"""Workflow Studio backend: workflow/node-library storage plus node execution.

Each workflow carries a runtime choice, and every node run goes where that
choice points:

- ``local`` (the studio default) runs the node through Hermes' own
  ``execute_code`` (tools/code_execution_tool) in a separate kernel child
  process, using Hermes' interpreter.
- ``docker`` ships the node script into the long-lived ``hermes-workflow``
  container (see the Dockerfile and docker-compose.yml at the plugin root) and
  runs it with that container's Python 3.12 + uv install, so node code gets the
  container's packages and mounts and never touches this process.

The runner travels with each ``POST /run`` request. A request that omits it
falls back to ``HERMES_WORKFLOW_RUNNER`` (default ``docker``), which is what
scripts and API callers outside the studio use.

``GET /runner`` reports what the docker path resolves to right now.
"""
from __future__ import annotations

import ast
import asyncio
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import tempfile
import time
from typing import Any, Literal
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from plugins.plugin_storage import plugin_data_dir

logger = logging.getLogger(__name__)

router = APIRouter()


WORKFLOW_PREFIX = "workflow-"
WORKFLOW_DIR = Path(plugin_data_dir("hermes-workflow"))
WORKFLOW_DIR.mkdir(parents=True, exist_ok=True)

NODE_LIBRARY_PATH = WORKFLOW_DIR / "node-library.json"


class RunRequest(BaseModel):
    node_id: str
    code: str = Field(min_length=1)
    inputs: dict[str, Any] = Field(default_factory=dict)
    # Declared defaults, already resolved by the renderer (see lib/parameter-values.ts).
    parameters: dict[str, Any] = Field(default_factory=dict)
    # The workflow's runtime choice. Omitted -> HERMES_WORKFLOW_RUNNER (docker).
    runner: Literal["local", "docker"] | None = None


class SourceRequest(BaseModel):
    source: str = Field(min_length=1)


class NodeValidationError(Exception):
    pass


# --- Editor helpers -------------------------------------------------------
#
# The node editor compiles nothing: syntax and metadata checks are pure AST work
# here, so the studio ships without an in-browser Python runtime.

_METADATA_KEYS = frozenset(
    {"name", "description", "category", "inputs", "outputs", "parameters"}
)
_LITERAL_TYPE_NAMES = frozenset(
    {
        "Any",
        "str",
        "float",
        "int",
        "bool",
        "dict",
        "list",
        "Image",
        "Audio",
        "Video",
        "File",
    }
)


def _execution_class(tree: ast.Module) -> ast.ClassDef:
    found = next(
        (
            node
            for node in tree.body
            if isinstance(node, ast.ClassDef) and node.name == "Execution"
        ),
        None,
    )
    if found is None:
        raise NodeValidationError("Could not find class Execution.")
    return found


def _literal(node: ast.AST) -> Any:
    """The value of a literal annotation, or a ValueError the editor shows as-is."""
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        if node.id in _LITERAL_TYPE_NAMES:
            return node.id
        raise ValueError(f"Unsupported identifier: {node.id}")
    if isinstance(node, ast.List):
        return [_literal(item) for item in node.elts]
    if isinstance(node, ast.Tuple):
        return tuple(_literal(item) for item in node.elts)
    if isinstance(node, ast.Dict):
        result: dict[Any, Any] = {}
        for key, value in zip(node.keys, node.values):
            if key is None:
                raise ValueError("Metadata must contain literal values.")
            result[_literal(key)] = _literal(value)
        return result
    raise ValueError("Metadata must contain literal values.")


@router.post("/validate")
async def validate_source(body: SourceRequest):
    """Syntax check for the editor. Parses only — nothing is executed."""
    try:
        ast.parse(body.source)
    except SyntaxError as exc:
        return {
            "valid": False,
            "diagnostics": [
                {
                    "message": exc.msg,
                    "line": exc.lineno or 1,
                    "column": max((exc.offset or 1) - 1, 0),
                }
            ],
        }
    return {"valid": True, "diagnostics": []}


@router.post("/node-metadata")
async def node_metadata(body: SourceRequest):
    """The class-level literals `Execution` declares (name, io, parameters…)."""
    try:
        tree = ast.parse(body.source)
        execution_class = _execution_class(tree)
    except SyntaxError as exc:
        raise HTTPException(
            status_code=400,
            detail={"type": "validation_error", "message": str(exc)},
        ) from exc
    except NodeValidationError as exc:
        raise HTTPException(
            status_code=400,
            detail={"type": "validation_error", "message": str(exc)},
        ) from exc

    metadata: dict[str, Any] = {}
    for statement in execution_class.body:
        if not isinstance(statement, ast.AnnAssign):
            continue
        if not isinstance(statement.target, ast.Name):
            continue

        name = statement.target.id
        if name not in _METADATA_KEYS:
            continue

        try:
            metadata[name] = _literal(statement.value)
        except (ValueError, TypeError) as exc:
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "validation_error",
                    "message": f"Execution.{name} must contain a literal value.",
                },
            ) from exc

    return metadata


@router.post("/node-methods")
async def node_methods(body: SourceRequest):
    """Source text of `run` / `build_output`, exactly as written in the class."""
    try:
        tree = ast.parse(body.source)
        execution_class = _execution_class(tree)
    except SyntaxError as exc:
        raise HTTPException(
            status_code=400,
            detail={"type": "validation_error", "message": str(exc)},
        ) from exc
    except NodeValidationError as exc:
        raise HTTPException(
            status_code=400,
            detail={"type": "validation_error", "message": str(exc)},
        ) from exc

    lines = body.source.splitlines()
    methods: dict[str, str] = {}

    for node in execution_class.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if node.name not in ("run", "build_output"):
            continue

        start_line = min(
            [node.lineno] + [decorator.lineno for decorator in node.decorator_list]
        )
        methods[node.name] = "\n".join(lines[start_line - 1 : node.end_lineno])

    return methods


# Printed by the driver so the result survives the tool's stdout capture intact.
_RESULT_MARKER = "@@workflow-node@@"

# Kernel identity: one warm interpreter across node runs, like an agent session's.
# Node source is exec'd into a fresh namespace per call, so node globals never
# collide; only imports (sys.modules) are shared, which is the point of reuse.
_KERNEL_TASK_ID = "hermes-workflow"

# The driver runs INSIDE the sandboxed child. It exec's the node's source there —
# never in this process — then reports one JSON line the caller can parse.
_NODE_DRIVER = r'''
import asyncio as __asyncio
import dataclasses as __dc
import inspect as __inspect
import json as __json
import math as __math


def __encode(value):
    """JSON-safe view of whatever build_output returns."""
    if value is None or isinstance(value, (bool, int)):
        return value
    if isinstance(value, float):
        # NaN/Infinity are not JSON: ship them as text rather than emit a body
        # no strict JSON parser (or the HTTP layer) will accept.
        return value if __math.isfinite(value) else str(value)
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple, set)):
        return [__encode(item) for item in value]
    if isinstance(value, dict):
        return {str(key): __encode(item) for key, item in value.items()}
    if __dc.is_dataclass(value) and not isinstance(value, type):
        return __encode(__dc.asdict(value))
    for __name in ("model_dump", "dict"):
        __method = getattr(value, __name, None)
        if callable(__method):
            try:
                return __encode(__method())
            except Exception:
                pass
    if hasattr(value, "__dict__"):
        return __encode({k: v for k, v in vars(value).items() if not k.startswith("_")})
    return repr(value)


__namespace = {"__name__": "__workflow_node__"}
__payload = __json.loads(__PAYLOAD__)


def __emit(result):
    """Hand the result back out of band.

    stdout is capped (execute_code keeps 50 KB, head + tail, with a truncation
    notice spliced into the middle), so a node returning more than that had its
    own JSON line cut in half. The result goes to the file the caller names; the
    marker line on stdout stays a constant size.
    """
    __text = __json.dumps(result)
    __path = __payload.get("result_path") or ""
    if __path:
        with open(__path, "w", encoding="utf-8") as __handle:
            __handle.write(__text)
        print("__MARKER__" + "written")
    else:
        print("__MARKER__" + __text)


exec(compile(__payload["source"], "<workflow-node>", "exec"), __namespace)

__execution_class = __namespace.get("Execution")
if not isinstance(__execution_class, type):
    __emit({"ok": False,
        "type": "validation_error",
        "message": "Python source must define an Execution class.",
    })
else:
    __output = __execution_class().build_output(
        __payload["inputs"], __payload["parameters"], __payload["context"]
    )
    if __inspect.isawaitable(__output):
        __output = __asyncio.run(__output)
    __emit({"ok": True, "output": __encode(__output)})
'''


def _validate_source(code: str) -> None:
    """Static checks only: parse the source and require a module-level Execution.

    Nothing is executed here; a SyntaxError or a missing class costs no child
    process and returns the same 400 the route always gave.
    """
    try:
        tree = ast.parse(code)
    except SyntaxError:
        raise

    defines_execution = any(
        isinstance(node, ast.ClassDef) and node.name == "Execution"
        for node in tree.body
    )
    if not defines_execution:
        raise NodeValidationError("Python source must define an Execution class.")


def _node_script(
    code: str,
    inputs: dict[str, Any],
    parameters: dict[str, Any],
    context: dict[str, Any],
    result_path: str,
) -> str:
    """The cell handed to execute_code: driver + everything else as data.

    The payload is embedded as a JSON *string* and parsed in the child
    (`json.loads`), never pasted in as an object literal: `json.dumps` writes
    `null`/`true`/`false`, which are not Python literals, so a node input of
    ``None`` used to raise `NameError: name 'null' is not defined` in the cell.

    ``result_path`` is where the child writes its result; see ``_emit`` in the
    driver for why it does not go over stdout.
    """
    payload = json.dumps(
        {
            "source": code,
            "inputs": inputs,
            "parameters": parameters,
            "context": context,
            "result_path": result_path,
        },
        ensure_ascii=True,
    )
    return (
        _NODE_DRIVER.replace("__MARKER__", _RESULT_MARKER)
        .replace("__PAYLOAD__", json.dumps(payload, ensure_ascii=True))
    )


def _parse_result(raw: str, result_path: str) -> dict[str, Any]:
    """Read the node's result: the out-of-band file first, stdout as a fallback."""
    try:
        envelope = json.loads(raw)
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f"execute_code returned an unreadable result: {raw[:400]}") from exc

    stdout = envelope.get("output") or ""
    payload: dict[str, Any] | None = None

    try:
        with open(result_path, encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, ValueError):
        payload = None

    if payload is None:
        # No file: the node never reached __emit (crash, refused script) or the
        # write failed and the driver fell back to the stdout marker.
        for line in reversed(stdout.splitlines()):
            if line.startswith(_RESULT_MARKER):
                try:
                    payload = json.loads(line[len(_RESULT_MARKER):])
                except ValueError:
                    payload = None
                break

    if payload is None:
        # Nothing came back: the tool refused the script, the kernel died, or the
        # node crashed before printing. The envelope carries the reason.
        detail = envelope.get("error") or stdout or "Node produced no result."
        status = str(envelope.get("status") or "")
        if status == "timeout":
            raise NodeTimeout(str(detail))
        raise NodeExecutionError(str(detail))

    if not payload.get("ok"):
        if payload.get("type") == "validation_error":
            raise NodeValidationError(str(payload.get("message") or "Invalid node source."))
        raise NodeExecutionError(str(payload.get("message") or "Node execution failed."))

    return {"status": "completed", "output": payload.get("output")}


class NodeExecutionError(Exception):
    pass


class NodeTimeout(NodeExecutionError):
    pass


def _execute_code_tool():
    """Hermes' ``execute_code`` tool, resolved through the published tool surface.

    Imported from ``tools.registry`` (a public plugin API module) rather than
    ``tools.code_execution_tool`` (core-private, catalog rule 9): the registry
    imports its own built-in tool modules and exposes ``dispatch``, so this plugin
    depends only on surfaces Hermes documents for plugins.
    """
    try:
        from tools.registry import discover_builtin_tools, registry
    except Exception as exc:  # pragma: no cover - environment issue
        raise RuntimeError(f"Hermes tool registry is unavailable: {exc}") from exc

    if registry.get_entry("execute_code") is None:
        discover_builtin_tools()

    if registry.get_entry("execute_code") is None:
        raise RuntimeError(
            "execute_code is not registered in this Hermes process; "
            "enable the code_execution toolset and retry."
        )

    return registry


# --- Container runner -----------------------------------------------------
#
# Nodes execute inside the long-lived ``hermes-workflow`` container that the
# plugin's docker-compose.yml defines. This file only drives it: check the
# daemon, start a stopped container, ship the script, run it with the
# container's own interpreter. Nothing here builds or recreates anything.

DEFAULT_CONTAINER = "hermes-workflow"
DEFAULT_CONTAINER_PYTHON = "python3"
DEFAULT_CONTAINER_WORKDIR = "/work"
DEFAULT_NODE_TIMEOUT = 300

# A workflow's stored runtime choice. Mirrors lib/runner.ts; "local" is what the
# studio selects for a workflow that carries none.
WORKFLOW_RUNNERS = ("local", "docker")
DEFAULT_WORKFLOW_RUNNER = "local"

# How long a stopped container gets to reach "running" after `docker start`.
_START_WAIT_SECONDS = 15

_DAEMON_DOWN_HINTS = (
    "cannot connect to the docker daemon",
    "error during connect",
    "is the docker daemon running",
    "dial unix",
    "failed to connect to the docker api",
    "docker.sock",
)

_PYTHON_CACHE: dict[str, str] = {}
_DOCKER_BIN_CACHE: dict[str, str] = {}

# Desktop apps (and anything else launched from Finder/Electron) inherit the GUI
# PATH — /usr/bin:/bin:/usr/sbin:/sbin — where a Docker Desktop CLI installed
# under ~/.docker/bin or the app bundle never appears. Look there directly.
_DOCKER_BIN_CANDIDATES = (
    "~/.docker/bin/docker",
    "/Applications/Docker.app/Contents/Resources/bin/docker",
    "/usr/local/bin/docker",
    "/opt/homebrew/bin/docker",
    "/usr/bin/docker",
)


def _runner_name() -> str:
    """Where node Python runs: ``docker`` (default) or ``local``."""
    value = (os.environ.get("HERMES_WORKFLOW_RUNNER") or "").strip().lower()
    if not value:
        return "docker"
    if value in ("docker", "local"):
        return value
    logger.warning(
        "Ignoring HERMES_WORKFLOW_RUNNER=%r (expected 'docker' or 'local')", value
    )
    return "docker"


def _setting(env_key: str, default: str) -> str:
    value = (os.environ.get(env_key) or "").strip()
    return value or default


def _container_name() -> str:
    return _setting("HERMES_WORKFLOW_CONTAINER", DEFAULT_CONTAINER)


def _container_python() -> str:
    return _setting("HERMES_WORKFLOW_PYTHON", DEFAULT_CONTAINER_PYTHON)


def _container_workdir() -> str:
    return _setting("HERMES_WORKFLOW_WORKDIR", DEFAULT_CONTAINER_WORKDIR).rstrip("/") or "/"


def _node_timeout() -> int:
    raw = _setting("HERMES_WORKFLOW_NODE_TIMEOUT", str(DEFAULT_NODE_TIMEOUT))
    try:
        return max(int(raw), 1)
    except ValueError:
        logger.warning("Ignoring HERMES_WORKFLOW_NODE_TIMEOUT=%r (not an int)", raw)
        return DEFAULT_NODE_TIMEOUT


def _docker_binary() -> str:
    """Absolute path to a working docker CLI, or "" when none is found.

    GUI-launched processes have a minimal PATH, so the configured value and PATH
    are tried first, then the usual Docker Desktop install locations.
    """
    cached = _DOCKER_BIN_CACHE.get("path")
    if cached:
        return cached

    configured = (os.environ.get("HERMES_WORKFLOW_DOCKER_BIN") or "").strip()
    if configured:
        resolved = shutil.which(configured) or (
            configured if os.path.isfile(configured) and os.access(configured, os.X_OK) else ""
        )
        if resolved:
            _DOCKER_BIN_CACHE["path"] = resolved
            return resolved

    found = shutil.which("docker")
    if not found:
        for candidate in _DOCKER_BIN_CANDIDATES:
            path = os.path.expanduser(candidate)
            if os.path.isfile(path) and os.access(path, os.X_OK):
                found = path
                break

    _DOCKER_BIN_CACHE["path"] = found or ""
    return _DOCKER_BIN_CACHE["path"]


def _compose_command() -> str:
    binary = _docker_binary() or "docker"
    return f"{binary} compose -f {Path(__file__).resolve().parents[1] / 'docker-compose.yml'} up -d"


def _docker(
    args: list[str],
    *,
    input_text: str | None = None,
    timeout: int = 60,
) -> subprocess.CompletedProcess:
    """Run one docker CLI command. Transport failures become node errors."""
    binary = _docker_binary()
    if not binary:
        searched = ", ".join(
            [os.environ.get("HERMES_WORKFLOW_DOCKER_BIN", ""), "PATH", *_DOCKER_BIN_CANDIDATES]
        )
        raise NodeExecutionError(
            "Docker CLI not found. Searched: "
            f"{searched}. Install Docker Desktop, or set "
            "HERMES_WORKFLOW_DOCKER_BIN to the docker binary's full path."
        )
    try:
        proc = subprocess.run(
            [binary, *args],
            input=input_text,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except FileNotFoundError as exc:
        raise NodeExecutionError(
            f"Docker CLI not found ({binary}). Install Docker, or point "
            "HERMES_WORKFLOW_DOCKER_BIN at it."
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise NodeTimeout(f"`docker {args[0]}` did not return within {timeout}s.") from exc

    stderr = (proc.stderr or "").strip()
    if proc.returncode != 0 and any(
        hint in stderr.lower() for hint in _DAEMON_DOWN_HINTS
    ):
        first_line = stderr.splitlines()[0] if stderr else "no detail"
        raise NodeExecutionError(
            "Workflow nodes run inside Docker, but the Docker daemon is not "
            f"reachable ({first_line}). Start Docker Desktop, then retry."
        )
    return proc


def _docker_output(args: list[str], *, timeout: int = 60) -> str:
    proc = _docker(args, timeout=timeout)
    if proc.returncode != 0:
        raise NodeExecutionError((proc.stderr or "").strip() or f"docker {args[0]} failed.")
    return proc.stdout or ""


def _container_state(container: str) -> str:
    """``running`` / ``exited`` / ``created`` / "" when the container is absent."""
    out = _docker_output(
        ["ps", "-a", "--filter", f"name=^{container}$", "--format", "{{.State}}"]
    )
    states = [line.strip() for line in out.splitlines() if line.strip()]
    return states[0] if states else ""


def _ensure_container() -> str:
    """The container to run in, started if it exists but is stopped."""
    container = _container_name()

    info = _docker(["info", "--format", "{{.ServerVersion}}"], timeout=30)
    if info.returncode != 0:
        raise NodeExecutionError(
            "Docker is not running. Workflow nodes execute inside the "
            f"'{container}' container — start Docker Desktop, then retry."
        )

    state = _container_state(container)
    if not state:
        raise NodeExecutionError(
            f"Container '{container}' does not exist. Create it with:\n"
            f"  {_compose_command()}"
        )
    if state == "running":
        return container

    started = _docker(["start", container], timeout=_START_WAIT_SECONDS + 10)
    if started.returncode != 0:
        detail = (started.stderr or "").strip() or "docker start failed."
        raise NodeExecutionError(f"Could not start container '{container}': {detail}")

    deadline = time.monotonic() + _START_WAIT_SECONDS
    while time.monotonic() < deadline:
        if _container_state(container) == "running":
            return container
        time.sleep(0.5)

    raise NodeExecutionError(
        f"Container '{container}' did not reach 'running' within "
        f"{_START_WAIT_SECONDS}s. Check it with: docker logs {container}"
    )


def _resolve_python(container: str) -> str:
    """Interpreter inside *container*; a venv path works if one is configured."""
    python = _container_python()
    key = f"{container}\0{python}"
    if key in _PYTHON_CACHE:
        return _PYTHON_CACHE[key]

    proc = _docker(
        ["exec", container, "sh", "-c", f"command -v {shlex.quote(python)}"],
        timeout=30,
    )
    found = (proc.stdout or "").strip().splitlines()
    if proc.returncode != 0 or not found:
        raise NodeExecutionError(
            f"Interpreter '{python}' is not on PATH inside container "
            f"'{container}'. Set HERMES_WORKFLOW_PYTHON to the interpreter to use."
        )
    _PYTHON_CACHE[key] = found[0].strip()
    return _PYTHON_CACHE[key]


def _has_result_marker(stdout: str) -> bool:
    return any(line.startswith(_RESULT_MARKER) for line in stdout.splitlines())


def _run_node_in_container(
    code: str,
    inputs: dict[str, Any],
    parameters: dict[str, Any],
    context: dict[str, Any],
) -> dict[str, Any]:
    """Ship the node script into the container and run it there."""
    container = _ensure_container()
    python = _resolve_python(container)
    workdir = _container_workdir()
    timeout = _node_timeout()

    # result_path empty: the driver prints the marker line instead of writing a
    # file. docker exec captures stdout whole, so execute_code's 50 KB cap (the
    # reason the local path uses a result file) does not apply.
    script = _node_script(code, inputs, parameters, context, "")
    remote = f"{workdir}/node-{uuid.uuid4().hex}.py"

    _docker(["exec", container, "mkdir", "-p", workdir], timeout=30)

    try:
        shipped = _docker(
            ["exec", "-i", container, "sh", "-c", f"cat > {shlex.quote(remote)}"],
            input_text=script,
            timeout=60,
        )
        if shipped.returncode != 0:
            raise NodeExecutionError(
                f"Could not write the node script into container '{container}': "
                f"{(shipped.stderr or '').strip() or 'unknown error'}"
            )

        try:
            proc = _docker(
                [
                    "exec",
                    container,
                    "sh",
                    "-c",
                    f"cd {shlex.quote(workdir)} && exec {python} {shlex.quote(remote)}",
                ],
                timeout=timeout,
            )
        except NodeTimeout as exc:
            _docker(
                [
                    "exec",
                    container,
                    "sh",
                    "-c",
                    f"pkill -f {shlex.quote(remote)} || true",
                ],
                timeout=20,
            )
            raise NodeTimeout(
                f"Node exceeded {timeout}s inside container '{container}'; the "
                "container-side process was killed."
            ) from exc

        if proc.returncode != 0 and not _has_result_marker(proc.stdout or ""):
            detail = (proc.stderr or "").strip() or (
                f"Node python exited with code {proc.returncode}."
            )
            raise NodeExecutionError(detail)

        return _parse_result(json.dumps({"output": proc.stdout or ""}), "")
    finally:
        try:
            _docker(["exec", container, "rm", "-f", remote], timeout=20)
        except NodeExecutionError:
            logger.debug("Could not remove %s from %s", remote, container)


def _run_node(
    code: str,
    inputs: dict[str, Any],
    parameters: dict[str, Any],
    context: dict[str, Any],
    runner: str | None = None,
) -> dict[str, Any]:
    """Run one node wherever the request's runner (or the env default) points."""
    if (runner or _runner_name()) == "docker":
        return _run_node_in_container(code, inputs, parameters, context)
    return _run_node_via_execute_code(code, inputs, parameters, context)


def _run_node_via_execute_code(
    code: str,
    inputs: dict[str, Any],
    parameters: dict[str, Any],
    context: dict[str, Any],
) -> dict[str, Any]:
    """Run one node in an execute_code kernel child and return its output."""
    registry = _execute_code_tool()

    workdir = tempfile.mkdtemp(prefix="workflow-node-")
    result_path = os.path.join(workdir, "result.json")
    try:
        raw = registry.dispatch(
            "execute_code",
            {
                "code": _node_script(code, inputs, parameters, context, result_path),
                "reset": False,
            },
            task_id=_KERNEL_TASK_ID,
            enabled_tools=[],
        )
        if not isinstance(raw, str):
            raise NodeExecutionError(
                f"execute_code returned {type(raw).__name__}, expected JSON text."
            )
        return _parse_result(raw, result_path)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


@router.post("/run")
async def run(body: RunRequest):
    try:
        _validate_source(body.code)
    except SyntaxError as exc:
        raise HTTPException(
            status_code=400,
            detail={"type": "validation_error", "message": str(exc)},
        ) from exc
    except NodeValidationError as exc:
        raise HTTPException(
            status_code=400,
            detail={"type": "validation_error", "message": str(exc)},
        ) from exc

    try:
        # execute_code is blocking (it drives a child process over a socket).
        result = await asyncio.to_thread(
            _run_node, body.code, body.inputs, body.parameters, {}, body.runner
        )
        return {"node_id": body.node_id, **result}
    except NodeTimeout as exc:
        raise HTTPException(
            status_code=504,
            detail={"type": "execution_error", "message": str(exc)},
        ) from exc
    except NodeValidationError as exc:
        raise HTTPException(
            status_code=400,
            detail={"type": "validation_error", "message": str(exc)},
        ) from exc
    except Exception as exc:
        logger.exception("Workflow node %s failed", body.node_id)
        raise HTTPException(
            status_code=500,
            detail={"type": "execution_error", "message": str(exc)},
        ) from exc


@router.get("/runner")
async def runner_status():
    """What the node runner resolves to right now — diagnosis without a run."""
    runner = _runner_name()
    info: dict[str, Any] = {
        "runner": runner,
        "container": _container_name(),
        "python": _container_python(),
        "workdir": _container_workdir(),
        "timeout": _node_timeout(),
    }
    if runner != "docker":
        info["status"] = "local"
        return info

    def _probe() -> dict[str, Any]:
        probe = dict(info)
        try:
            daemon = _docker(["info", "--format", "{{.ServerVersion}}"], timeout=30)
            probe["docker_running"] = daemon.returncode == 0
            probe["container_state"] = _container_state(_container_name())
            probe["status"] = (
                "ready" if probe["container_state"] == "running" else "not_running"
            )
        except NodeExecutionError as exc:
            probe["docker_running"] = False
            probe["status"] = "unavailable"
            probe["error"] = str(exc)
        return probe

    return await asyncio.to_thread(_probe)


# Workflow dir
def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, data):
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _workflow_path(workflow_id: str):
    return WORKFLOW_DIR / f"workflow-{workflow_id}.json"


def _workflow_runner(body: dict, fallback: str) -> str:
    """The runtime to store: the request's choice, else the existing/default one."""
    value = body.get("runner")
    if value is None:
        return fallback
    if value not in WORKFLOW_RUNNERS:
        raise HTTPException(
            status_code=400,
            detail=f"runner must be one of: {', '.join(WORKFLOW_RUNNERS)}.",
        )
    return value


# Workflows
@router.get("/workflows")
async def read_workflows():
    workflows = [_read_json(path) for path in WORKFLOW_DIR.glob("workflow-*.json")]
    return sorted(
        workflows,
        key=lambda workflow: workflow["updatedAt"],
        reverse=True,
    )


@router.post("/workflows")
async def create_workflow(body: dict):
    workflow_id = str(uuid.uuid4())
    now = _now()
    workflow = {
        "id": workflow_id,
        "name": body.get("name") or f"workflow-{workflow_id}",
        "createdAt": now,
        "updatedAt": now,
        "runner": _workflow_runner(body, DEFAULT_WORKFLOW_RUNNER),
        "nodes": [],
        "edges": [],
    }
    _write_json(_workflow_path(workflow_id), workflow)
    return workflow


@router.put("/workflows/{workflow_id}")
async def save_workflow(workflow_id: str, body: dict):
    path = _workflow_path(workflow_id)
    try:
        workflow = _read_json(path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Workflow not found")
    workflow.update(
        {
            "id": workflow_id,
            "name": (
                body["name"]
                if body.get("name") is not None
                else workflow.get("name", f"workflow-{workflow_id}")
            ),
            "updatedAt": _now(),
            # Absent runner keeps the stored one, so a name-only save cannot
            # silently reset the runtime choice.
            "runner": _workflow_runner(body, workflow.get("runner") or DEFAULT_WORKFLOW_RUNNER),
            "nodes": body["nodes"],
            "edges": body["edges"],
        }
    )
    _write_json(path, workflow)
    return workflow


@router.get("/workflows/{workflow_id}")
async def load_workflow(workflow_id: str):
    try:
        return _read_json(_workflow_path(workflow_id))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Workflow not found")


@router.delete("/workflows/{workflow_id}")
async def delete_workflow(workflow_id: str):
    path = _workflow_path(workflow_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Workflow not found")
    path.unlink()
    return workflow_id


# Node Library
@router.get("/node-library")
async def read_node_library():
    if not NODE_LIBRARY_PATH.exists():
        return []
    return _read_json(NODE_LIBRARY_PATH)


@router.put("/node-library")
async def write_node_library(body: dict):
    _write_json(NODE_LIBRARY_PATH, body["nodes"])
    return {"ok": True}


@router.post("/node-library/nodes")
async def save_library_node(body: dict):
    nodes = await read_node_library()
    now = _now()
    node = {
        "id": str(uuid.uuid4()),
        "data": body["data"],
        "createdAt": now,
        "updatedAt": now,
    }
    nodes.append(node)
    _write_json(NODE_LIBRARY_PATH, nodes)
    return node


@router.put("/node-library/nodes/{node_id}")
async def update_library_node(node_id: str, body: dict):
    nodes = await read_node_library()
    node = next((node for node in nodes if node["id"] == node_id), None)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    node["data"] = body["data"]
    node["updatedAt"] = _now()
    _write_json(NODE_LIBRARY_PATH, nodes)
    return node


@router.delete("/node-library/nodes/{node_id}")
async def delete_library_node(node_id: str):
    nodes = await read_node_library()
    updated_nodes = [node for node in nodes if node["id"] != node_id]
    if len(updated_nodes) == len(nodes):
        raise HTTPException(status_code=404, detail="Node not found")
    _write_json(NODE_LIBRARY_PATH, updated_nodes)
    return node_id
