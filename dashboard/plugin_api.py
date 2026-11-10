from __future__ import annotations

import ast
import asyncio
import inspect
from typing import Any, Awaitable, Protocol, cast

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


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
