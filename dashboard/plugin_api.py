"""Workflow Studio backend: workflow/node-library storage plus node execution.

Node Python runs through Hermes' own ``execute_code`` (tools/code_execution_tool),
never through ``exec`` in this process. That gives each run a separate kernel
child process with the scrubbed environment Hermes maintains (PATH, HOME, LANG/
LC_*, TMPDIR, SHELL, the project interpreter — credentials and unrelated config
are dropped), the kernel's own timeout, and its usual approval guard.
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
import shutil
import tempfile
from typing import Any
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


class NodeValidationError(Exception):
    pass


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


def _run_node(
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
            _run_node, body.code, body.inputs, {}, {}
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


# Workflow dir
def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, data):
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _workflow_path(workflow_id: str):
    return WORKFLOW_DIR / f"workflow-{workflow_id}.json"


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
