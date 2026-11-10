from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.post("/run")
async def run(body: dict):
    return {"status": "ok"}
