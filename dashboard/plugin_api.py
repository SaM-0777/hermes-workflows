from __future__ import annotations

import ast
import asyncio
from datetime import datetime, timezone
import inspect
import json
import logging
import os
from pathlib import Path
import re
from typing import Any, Awaitable, Protocol, cast
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


class ExecutionProtocol(Protocol):
    def build_output(
        self,
        inputs: dict[str, Any],
        parameters: dict[str, Any],
        context: dict[str, Any],
    ) -> Any | Awaitable[Any]: ...


class NodeValidationError(Exception):
    pass


def _prepare_execution(code: str) -> ExecutionProtocol:
    tree = ast.parse(code)
    compiled_code = compile(tree, "<workflow-node>", "exec")
    namespace: dict[str, Any] = {
        "__name__": "__workflow_node__",
    }
    exec(compiled_code, namespace)
    execution_class = namespace.get("Execution")
    if not isinstance(execution_class, type):
        raise NodeValidationError("Python source must define an Execution class.")
    return cast(ExecutionProtocol, execution_class())


async def _execute_node(
    code: str,
    inputs: dict[str, Any],
    parameters: dict[str, Any],
    context: dict[str, Any],
) -> dict[str, Any]:
    execution = await asyncio.to_thread(_prepare_execution, code)
    build_output = execution.build_output
    if inspect.iscoroutinefunction(build_output):
        output = await build_output(inputs, parameters, context)
    else:
        output = await asyncio.to_thread(build_output, inputs, parameters, context)
        if inspect.isawaitable(output):
            output = await output

    return {
        "status": "completed",
        "output": output,
    }


@router.post("/run")
async def run(body: RunRequest):
    try:
        result = await _execute_node(body.code, body.inputs, {}, {})
        return {"node_id": body.node_id, **result}
    except (SyntaxError, NodeValidationError) as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "type": "validation_error",
                "message": str(exc),
            },
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "type": "execution_error",
                "message": str(exc),
            },
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
