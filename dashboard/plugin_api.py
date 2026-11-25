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
import signal
import subprocess
import sys
import tempfile
import time
from typing import Any, Literal
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from plugins.plugin_storage import plugin_data_dir

logger = logging.getLogger(__name__)

router = APIRouter()


WORKFLOW_PREFIX = "workflow-"
WORKFLOW_DIR = Path(plugin_data_dir("hermes-workflow"))
WORKFLOW_DIR.mkdir(parents=True, exist_ok=True)

NODE_LIBRARY_PATH = WORKFLOW_DIR / "node-library.json"

# --- runtime providers ----------------------------------------------------
#
# Every runtime lives behind runners/: descriptors in providers.json, one adapter
# per provider, and a driver when the provider runs code somewhere else. This
# module only resolves the choice and routes the work, so adding a provider is a
# descriptor plus an adapter, not a change here.
PLUGIN_ROOT = Path(__file__).resolve().parents[1]
RUNS_DIR = WORKFLOW_DIR / "runs"
RUNS_DIR.mkdir(parents=True, exist_ok=True)
SESSIONS_DIR = WORKFLOW_DIR / "sessions"
SESSIONS_DIR.mkdir(parents=True, exist_ok=True)

_RUNNERS_DIR = PLUGIN_ROOT / "runners"
if str(_RUNNERS_DIR) not in sys.path:
    sys.path.insert(0, str(_RUNNERS_DIR))

import runner_base  # noqa: E402
import modal_provider as modal_runtime  # noqa: E402

_PROVIDERS = runner_base.load_providers(PLUGIN_ROOT, WORKFLOW_DIR / "providers.json")


class RunRequest(BaseModel):
    node_id: str
    code: str = Field(min_length=1)
    inputs: dict[str, Any] = Field(default_factory=dict)
    # Declared defaults, already resolved by the renderer (see lib/parameter-values.ts).
    parameters: dict[str, Any] = Field(default_factory=dict)
    # The workflow's runtime choice; validated against providers.json.
    runner: str | None = None
    # Per-workflow overrides for the provider's descriptor options.
    runner_options: dict[str, Any] | None = None
    # Known when the studio sends it; used to group runs of one workflow.
    workflow_id: str | None = None
    # Workflow run session. Present only for providers that keep one sandbox for
    # the whole run (providers.json "scope": "workflow"); a node then attaches to
    # the sandbox the first node created instead of allocating its own.
    session_id: str | None = None


class SessionRequest(BaseModel):
    workflow_id: str | None = None
    # The workflow's runtime choice; only workflow-scoped providers get a session.
    runner: str | None = None
    runner_options: dict[str, Any] | None = None


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

# The node driver template lives in runner_base so a remote adapter can wrap
# the node source with the same execution contract after rewriting paths.


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

    ``result_path`` is where the child writes its result; see ``__emit`` in
    runner_base.NODE_DRIVER for why it does not go over stdout by default. The
    same template is what a remote adapter wraps the node source with, so every
    runtime runs against one execution contract.
    """
    return runner_base.node_script(code, inputs, parameters, context, result_path)


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

# A workflow's stored runtime choice. The list comes from providers.json, so a new
# provider needs no edit here; "local" is what the studio selects by default.
WORKFLOW_RUNNERS = tuple(_PROVIDERS["order"])
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


def _load_docker_cli():
    """Import the plugin's docker_cli.py once, under a stable module name.

    This module is imported standalone by the dashboard layer, so it resolves the
    helper by path instead of relying on a package-relative import.
    """
    module = sys.modules.get("hermes_workflow_docker_cli")
    if module is not None:
        return module

    import importlib.util

    path = Path(__file__).resolve().parents[1] / "docker_cli.py"
    spec = importlib.util.spec_from_file_location("hermes_workflow_docker_cli", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load the docker CLI helper at {path}.")
    module = importlib.util.module_from_spec(spec)
    sys.modules["hermes_workflow_docker_cli"] = module
    spec.loader.exec_module(module)
    return module


# Per-OS CLI discovery lives in docker_cli.py, shared with tools.py: a GUI-launched
# process has a minimal PATH, so the CLI is also looked for in the install
# locations of whichever OS this is.
_DOCKER_CLI = _load_docker_cli()


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
    """Absolute path to a working docker CLI, or "" when none is found."""
    return _DOCKER_CLI.find_docker_binary()


def _quoted(value: str) -> str:
    """Quote a path for the copy-paste command shown to the user."""
    return f'"{value}"' if " " in value else value


def _compose_command() -> str:
    binary = _docker_binary() or "docker"
    compose_file = Path(__file__).resolve().parents[1] / "docker-compose.yml"
    return f'{_quoted(binary)} compose -f {_quoted(str(compose_file))} up -d'


def _docker(
    args: list[str],
    *,
    input_text: str | None = None,
    timeout: int = 60,
) -> subprocess.CompletedProcess:
    """Run one docker CLI command. Transport failures become node errors."""
    binary = _docker_binary()
    if not binary:
        raise NodeExecutionError(
            "Docker CLI not found. Searched: "
            f"{_DOCKER_CLI.searched()}. Install Docker (Docker Desktop on "
            "macOS/Windows), or set HERMES_WORKFLOW_DOCKER_BIN to the docker "
            "binary's full path."
        )
    try:
        proc = subprocess.run(
            [binary, *args],
            input=input_text,
            timeout=timeout,
            **_DOCKER_CLI.subprocess_kwargs(),
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

    runner = (body.runner or _runner_name()).strip().lower()
    if runner not in WORKFLOW_RUNNERS:
        raise HTTPException(
            status_code=400,
            detail={
                "type": "validation_error",
                "message": f"runner must be one of: {', '.join(WORKFLOW_RUNNERS)}.",
            },
        )

    if runner == "modal":
        # Cloud providers run out of process: submitting returns immediately and
        # the studio polls the run record, so a node may take hours.
        submission = await asyncio.to_thread(_submit_remote_node, body, runner)
        return JSONResponse(status_code=202, content=submission)

    try:
        # execute_code is blocking (it drives a child process over a socket).
        result = await asyncio.to_thread(
            _run_node, body.code, body.inputs, body.parameters, {}, runner
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


# --- remote providers -----------------------------------------------------
#
# A remote provider runs the node out of process: submission records the intent
# and starts the driver, and the studio polls the run record. That is what lets a
# node take minutes or hours without owning an HTTP request.


def _run_paths(run_id: str) -> tuple[Path, Path, Path]:
    return (
        RUNS_DIR / f"{run_id}.json",
        RUNS_DIR / f"{run_id}.request.json",
        RUNS_DIR / f"{run_id}.log",
    )


def _provider_status(provider_id: str) -> dict:
    if provider_id == "modal":
        return modal_runtime.status()
    return {"provider": provider_id, "ready": True, "missing": [], "hints": []}


# --- run sessions ---------------------------------------------------------
#
# A provider that declares ``"scope": "workflow"`` keeps one sandbox for a whole
# workflow run. The studio opens a session before the graph starts, every node
# carries its id, and the first node's driver creates the sandbox and records it.
# Closing the session terminates that sandbox. Providers without the flag never
# take this path: their runs are byte-identical to the per-node model.

_TERMINATE_TIMEOUT = 180


def _close_session_sync(session_id: str) -> dict | None:
    """Terminate a session's sandbox and mark the record closed.

    Runs the driver in terminate-only mode, so nothing here imports the provider
    SDK. A sandbox that is already gone is fine: the record still closes, and the
    provider's idle timeout is the backstop.
    """
    session = runner_base.read_session(WORKFLOW_DIR, session_id)
    if session is None:
        return None
    if session.get("status") == "closed":
        return session

    provider = str(session.get("provider") or "")
    sandbox_id = str(session.get("sandbox_id") or "")

    if provider != "modal":
        return runner_base.update_session(
            WORKFLOW_DIR, session_id, status="closed", endedAt=runner_base.now()
        )

    record_path = SESSIONS_DIR / f"{session_id}.terminate.json"
    request_path = SESSIONS_DIR / f"{session_id}.terminate.request.json"
    log_path = SESSIONS_DIR / f"{session_id}.terminate.log"

    runner_base.create_record(
        record_path,
        session_id=session_id,
        provider=provider,
        node_id="terminate",
        sandboxId=sandbox_id,
    )
    runner_base.write_record(
        request_path,
        {
            "mode": "terminate",
            "provider": provider,
            "session_id": session_id,
            "session_path": str(runner_base.session_path(WORKFLOW_DIR, session_id)),
            "sandbox_id": sandbox_id,
            "options": session.get("options") or {},
            "record_path": str(record_path),
        },
    )

    failure = ""
    try:
        command = modal_runtime.driver_command(request_path)
        proc = subprocess.run(
            command,
            cwd=str(PLUGIN_ROOT),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=_TERMINATE_TIMEOUT,
        )
        try:
            log_path.write_text(
                (proc.stdout or "") + (proc.stderr or ""), encoding="utf-8"
            )
        except OSError:
            logger.debug("Could not write %s", log_path)
        if proc.returncode != 0:
            failure = (proc.stderr or proc.stdout or "").strip()[-1000:]
    except Exception as exc:  # noqa: BLE001 - the record carries the reason
        failure = str(exc)

    if failure:
        logger.warning("Could not terminate session %s: %s", session_id, failure)
        runner_base.update_record(
            record_path, status="failed", phase="failed", error={"message": failure}
        )

    return runner_base.update_session(
        WORKFLOW_DIR,
        session_id,
        status="closed",
        endedAt=runner_base.now(),
        **({"terminateError": failure} if failure else {}),
    )


def _sweep_stale_sessions() -> None:
    """Close sessions whose sandbox is long past its workflow timeout.

    Bookkeeping only: the sandbox itself is already reaped by its workflow
    timeout. This keeps the sessions list honest after a studio crash.
    """
    now = datetime.now(timezone.utc)
    for session in runner_base.list_sessions(WORKFLOW_DIR):
        if session.get("status") != "open":
            continue
        created = str(session.get("createdAt") or "")
        try:
            started = datetime.fromisoformat(created.replace("Z", "+00:00"))
        except ValueError:
            continue
        options = session.get("options") or {}
        try:
            limit = int(options.get("workflowTimeoutSeconds") or 3600) + 600
        except (TypeError, ValueError):
            limit = 4200
        if (now - started).total_seconds() <= limit:
            continue
        runner_base.update_session(
            WORKFLOW_DIR, session["session_id"], status="expired", endedAt=runner_base.now()
        )


try:
    _sweep_stale_sessions()
except Exception:  # noqa: BLE001 - never block the API on housekeeping
    logger.exception("Could not sweep stale workflow sessions")


def _submit_remote_node(body: "RunRequest", provider_id: str) -> dict:
    readiness = _provider_status(provider_id)
    if not readiness.get("ready"):
        raise HTTPException(
            status_code=409,
            detail={
                "type": "runtime_not_configured",
                "provider": provider_id,
                "missing": readiness.get("missing", []),
                "hints": readiness.get("hints", []),
                "message": (
                    f"The {provider_id} runtime is not configured yet. "
                    + " ".join(readiness.get("hints", []))
                ),
            },
        )

    options = runner_base.resolved_options(_PROVIDERS, provider_id, body.runner_options)

    # A session means every node of this run shares one sandbox. The record is
    # validated here so a stale or foreign id fails before a driver starts.
    session = None
    if body.session_id:
        session = runner_base.read_session(WORKFLOW_DIR, body.session_id)
        if session is None:
            raise HTTPException(
                status_code=404,
                detail={
                    "type": "session_not_found",
                    "message": f"Workflow session {body.session_id} does not exist.",
                },
            )
        if session.get("status") != "open":
            raise HTTPException(
                status_code=409,
                detail={
                    "type": "session_closed",
                    "message": (
                        f"Workflow session {body.session_id} is "
                        f"{session.get('status')} and cannot accept nodes. "
                        "Start the workflow again to open a new sandbox."
                    ),
                },
            )
        if str(session.get("provider") or "") != provider_id:
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "session_provider_mismatch",
                    "message": (
                        f"Session {body.session_id} belongs to the "
                        f"'{session.get('provider')}' runtime, not '{provider_id}'."
                    ),
                },
            )
        session_path = runner_base.session_path(WORKFLOW_DIR, body.session_id)
    else:
        session_path = None

    cap = _PROVIDERS["fileCapBytes"]
    files, rejected = runner_base.plan_uploads([body.parameters, body.inputs], cap)
    if rejected:
        listing = ", ".join(f"{item['path']} ({item['size']} bytes)" for item in rejected)
        raise HTTPException(
            status_code=400,
            detail={
                "type": "file_too_large",
                "provider": provider_id,
                "cap": cap,
                "files": rejected,
                "message": (
                    f"{provider_id} runs take files up to {cap} bytes each; "
                    f"these are larger: {listing}."
                ),
            },
        )

    run_id = runner_base.new_run_id()
    record_path, request_path, log_path = _run_paths(run_id)

    request = {
        "run_id": run_id,
        "provider": provider_id,
        "node_id": body.node_id,
        "workflow_id": body.workflow_id,
        "script": body.code,
        "inputs": body.inputs,
        "parameters": body.parameters,
        "options": options,
        "files": files,
        "record_path": str(record_path),
    }
    if session is not None:
        # The driver reads the session record for the shared sandbox id and
        # leaves the sandbox running for the next node.
        request["session_id"] = body.session_id
        request["session_path"] = str(session_path)

    runner_base.write_record(request_path, request)
    runner_base.create_record(
        record_path,
        run_id=run_id,
        provider=provider_id,
        node_id=body.node_id,
        workflow_id=body.workflow_id,
        session_id=body.session_id or "",
        options=options,
        files={path: meta["sha256"] for path, meta in files.items()},
        logPath=str(log_path),
    )

    command = modal_runtime.driver_command(request_path)
    with open(log_path, "w", encoding="utf-8") as log:
        process = subprocess.Popen(
            command,
            cwd=str(PLUGIN_ROOT),
            stdout=log,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            start_new_session=True,
        )
    runner_base.update_record(record_path, driverPid=process.pid)

    return {
        "run_id": run_id,
        "provider": provider_id,
        "node_id": body.node_id,
        "status": "queued",
        "phase": "queued",
    }


def _saved_workflow_options(workflow_id: str | None, provider: str) -> dict | None:
    """Runner options as stored on the workflow, or None when it has none.

    The approval dialog presents the saved workflow, so these are the settings the
    run is meant to use. A studio whose in-memory state predates the last save would
    otherwise open the session with stale options.
    """
    if not workflow_id:
        return None
    try:
        workflow = _read_json(_workflow_path(workflow_id))
    except (OSError, ValueError):
        return None
    if not isinstance(workflow, dict):
        return None
    if str(workflow.get("runner") or "") != provider:
        return None
    stored = workflow.get("runnerOptions") or {}
    if not stored:
        return None
    return runner_base.resolved_options(_PROVIDERS, provider, stored)


@router.post("/runtime/sessions")
async def open_session(body: SessionRequest):
    """Open a workflow run session for a provider that keeps one sandbox.

    Nothing is allocated here: the first node's driver creates the sandbox and
    records its id, so a run that fails before its first node costs nothing.
    """

    def _open() -> dict:
        provider = (body.runner or _runner_name()).strip().lower()
        if provider not in WORKFLOW_RUNNERS:
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "validation_error",
                    "message": f"runner must be one of: {', '.join(WORKFLOW_RUNNERS)}.",
                },
            )
        if not runner_base.workflow_scoped(_PROVIDERS, provider):
            raise HTTPException(
                status_code=400,
                detail={
                    "type": "runtime_scope_error",
                    "message": (
                        f"The '{provider}' runtime runs each node in its own "
                        "environment, so it has no workflow session to open."
                    ),
                },
            )

        readiness = _provider_status(provider)
        if not readiness.get("ready"):
            raise HTTPException(
                status_code=409,
                detail={
                    "type": "runtime_not_configured",
                    "provider": provider,
                    "missing": readiness.get("missing", []),
                    "hints": readiness.get("hints", []),
                    "message": (
                        f"The {provider} runtime is not configured yet. "
                        + " ".join(readiness.get("hints", []))
                    ),
                },
            )

        options = runner_base.resolved_options(_PROVIDERS, provider, body.runner_options)
        # The saved workflow is what the approval dialog presents, so its runner
        # options are the ones a session runs with. A studio whose state predates
        # the last save would otherwise open the sandbox with stale settings.
        saved = _saved_workflow_options(body.workflow_id, provider)
        if saved:
            options = saved
        session_id = runner_base.new_session_id()
        record = runner_base.create_session(
            WORKFLOW_DIR,
            session_id,
            workflow_id=body.workflow_id or "",
            provider=provider,
            options=options,
            sandbox_id="",
        )
        return {
            "session_id": session_id,
            "provider": provider,
            "status": record.get("status", "open"),
            "options": options,
        }

    return await asyncio.to_thread(_open)


@router.get("/runtime/sessions")
async def list_run_sessions():
    """Session records, newest first — what a reloaded studio re-attaches to."""
    records = runner_base.list_sessions(WORKFLOW_DIR)
    records.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
    return records


@router.delete("/runtime/sessions/{session_id}")
async def close_session(session_id: str):
    """Terminate the session's sandbox and mark the record closed."""
    session = runner_base.read_session(WORKFLOW_DIR, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    closed = await asyncio.to_thread(_close_session_sync, session_id)
    return closed or session


@router.get("/runtime/providers")
async def runtime_providers():
    """Descriptors plus live readiness, for the selector and its setup dialog."""

    def build() -> dict:
        entries = []
        for provider_id in _PROVIDERS["order"]:
            entry = _PROVIDERS["providers"][provider_id]
            entries.append(
                {
                    "id": provider_id,
                    "label": entry.get("label", provider_id),
                    "description": entry.get("description", ""),
                    "kind": entry.get("kind", "builtin"),
                    # "workflow" = one execution unit for the whole run; the
                    # studio opens a session and every node joins it.
                    "scope": str(entry.get("scope") or "node"),
                    "needsSetup": bool(entry.get("needsSetup")),
                    "defaults": entry.get("defaults", {}),
                    "options": entry.get("options", []),
                    "status": _provider_status(provider_id),
                }
            )
        return {"fileCapBytes": _PROVIDERS["fileCapBytes"], "providers": entries}

    return await asyncio.to_thread(build)


@router.get("/runtime/runs")
async def list_runs(status: str | None = None, provider: str | None = None):
    """Run records, newest first — what the canvas re-attaches to after a reload."""
    records = []
    for path in sorted(RUNS_DIR.glob("*.json")):
        if path.name.endswith(".request.json"):
            continue
        record = runner_base.read_record(path)
        if not record:
            continue
        if status and record.get("status") != status:
            continue
        if provider and record.get("provider") != provider:
            continue
        records.append(record)
    records.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
    return records


@router.get("/runtime/runs/{run_id}")
async def get_run(run_id: str):
    record_path, _, _ = _run_paths(run_id)
    record = runner_base.read_record(record_path)
    if record is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return record


@router.delete("/runtime/runs/{run_id}")
async def cancel_run(run_id: str):
    """Stop a node run: signal the driver, which terminates the sandbox."""
    record_path, _, _ = _run_paths(run_id)
    record = runner_base.read_record(record_path)
    if record is None:
        raise HTTPException(status_code=404, detail="Run not found")

    pid = record.get("driverPid")
    if isinstance(pid, int) and record.get("status") == "running":
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            logger.debug("Driver %s was already gone", pid)

    updated = runner_base.update_record(
        record_path, status="cancelled", phase="cancelled", endedAt=runner_base.now()
    )

    # A cancelled node ends the run, so its shared sandbox must go too; otherwise
    # the rest of the workflow would keep a session that no longer has a parent.
    session_id = str(record.get("session_id") or "")
    if session_id:
        await asyncio.to_thread(_close_session_sync, session_id)

    return updated or record


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
