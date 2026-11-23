"""Provider-agnostic pieces of node execution.

Nothing here imports a provider SDK, Hermes or FastAPI: the gateway, the tests
and every provider driver can load this module on its own.

Contents
  descriptors        providers.json, plus an optional per-installation override
  result marker      the single line a node script prints for the runner to read
  file references    finding host files in node values, and rewriting them to
                     provider-side paths after upload
  run records        one JSON file per node run, so status survives a request
"""
from __future__ import annotations

import hashlib
import json
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

RESULT_MARKER = "@@workflow-node@@"


# The driver a node script prints its result through. Shared by every runtime:
# the gateway bakes it into the cell/container script, and a remote driver wraps
# the node source with it AFTER rewriting host paths to provider-side paths.
#
# The payload is embedded as a JSON *string* and parsed in the child
# (``json.loads``), never pasted in as an object literal: ``json.dumps`` writes
# ``null``/``true``/``false``, which are not Python literals, so a node input of
# ``None`` used to raise ``NameError: name 'null' is not defined``.
NODE_DRIVER = r'''
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
    own JSON line cut in half. When the caller names a result file the result
    goes there and the marker line stays a constant size; a runtime that reads
    the marker from stdout passes an empty path.
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


def node_script(
    code: str,
    inputs: dict | None = None,
    parameters: dict | None = None,
    context: dict | None = None,
    result_path: str = "",
) -> str:
    """The script a runtime executes: driver + node source and values as data."""
    payload = json.dumps(
        {
            "source": code,
            "inputs": inputs or {},
            "parameters": parameters or {},
            "context": context or {},
            "result_path": result_path,
        },
        ensure_ascii=True,
    )
    return NODE_DRIVER.replace("__MARKER__", RESULT_MARKER).replace(
        "__PAYLOAD__", json.dumps(payload, ensure_ascii=True)
    )

# queued -> uploading -> starting -> running -> finished; "failed"/"cancelled"
# are terminal too. The studio renders all of queued/uploading/starting/running
# as "running" and shows the phase alongside.
PHASES = ("queued", "uploading", "starting", "running", "finished")
TERMINAL = ("finished", "failed", "cancelled")

REMOTE_PREFIXES = ("http://", "https://", "hf://", "s3://", "gs://", "r2://")


# --- descriptors ----------------------------------------------------------


def _read_json(path: Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_providers(root: Path, override_path: Path | None = None) -> dict:
    """Read providers.json, then apply an optional override on top of it.

    The override may add a provider or patch an existing one's `defaults` and
    `options`. It never removes a provider, so a broken override cannot make a
    workflow's stored runtime disappear.
    """
    base = _read_json(Path(root) / "providers.json")
    providers = {entry["id"]: entry for entry in base.get("providers", [])}
    order = [entry["id"] for entry in base.get("providers", [])]

    if override_path and Path(override_path).is_file():
        try:
            override = _read_json(Path(override_path))
        except (OSError, ValueError):
            override = {}
        for entry in override.get("providers", []):
            provider_id = entry.get("id")
            if not provider_id:
                continue
            current = providers.get(provider_id)
            if current is None:
                providers[provider_id] = entry
                order.append(provider_id)
            else:
                defaults = {**current.get("defaults", {}), **entry.get("defaults", {})}
                merged = {**current, **entry, "defaults": defaults}
                if "options" not in entry:
                    merged["options"] = current.get("options", [])
                providers[provider_id] = merged

    return {
        "fileCapBytes": base.get("fileCapBytes", 100 * 1024 * 1024),
        "order": order,
        "providers": providers,
    }


def descriptor(providers: dict, provider_id: str) -> dict:
    entry = providers["providers"].get(provider_id)
    if entry is None:
        raise KeyError(f"Unknown runtime provider: {provider_id}")
    return entry


def resolved_options(providers: dict, provider_id: str, overrides: dict | None) -> dict:
    """Descriptor defaults with the workflow's overrides applied.

    Only keys the descriptor lists in `options` are accepted, so a stale or
    hand-edited workflow cannot inject arbitrary keys into a provider call.
    """
    entry = descriptor(providers, provider_id)
    options = dict(entry.get("defaults", {}))
    allowed = {option["key"] for option in entry.get("options", [])}
    for key, value in (overrides or {}).items():
        if key in allowed and value not in (None, ""):
            options[key] = value
    return options


# --- file references ------------------------------------------------------


def _is_file_reference(value: str) -> bool:
    if not value or value.startswith(REMOTE_PREFIXES):
        return False
    if not os.path.isabs(value):
        return False
    return os.path.isfile(value)


def local_paths(value: Any) -> list[str]:
    """Every existing host file referenced inside a nested node value."""
    found: list[str] = []

    def walk(item: Any) -> None:
        if isinstance(item, str):
            if _is_file_reference(item):
                found.append(item)
        elif isinstance(item, dict):
            for nested in item.values():
                walk(nested)
        elif isinstance(item, (list, tuple)):
            for nested in item:
                walk(nested)

    walk(value)
    return found


def rewrite_paths(value: Any, mapping: dict[str, str]) -> Any:
    """Replace host paths with provider-side paths, preserving structure."""
    if isinstance(value, str):
        return mapping.get(value, value)
    if isinstance(value, dict):
        return {key: rewrite_paths(item, mapping) for key, item in value.items()}
    if isinstance(value, list):
        return [rewrite_paths(item, mapping) for item in value]
    if isinstance(value, tuple):
        return tuple(rewrite_paths(item, mapping) for item in value)
    return value


def sha256_file(path: str, chunk: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(chunk), b""):
            digest.update(block)
    return digest.hexdigest()


def plan_uploads(values: Iterable[Any], cap_bytes: int) -> tuple[dict[str, dict], list[dict]]:
    """Hash the files a node references, refusing anything over the cap.

    Returns (files, rejected): files maps host path -> {sha256, size, name},
    rejected lists {path, size} for the over-cap ones. A non-empty `rejected`
    must fail the run before anything is created.
    """
    files: dict[str, dict] = {}
    rejected: list[dict] = []
    seen: set[str] = set()

    for value in values:
        for path in local_paths(value):
            if path in seen:
                continue
            seen.add(path)
            try:
                size = os.path.getsize(path)
            except OSError:
                continue
            if size > cap_bytes:
                rejected.append({"path": path, "size": size, "cap": cap_bytes})
                continue
            files[path] = {
                "sha256": sha256_file(path),
                "size": size,
                "name": os.path.basename(path),
            }

    return files, rejected


# --- results --------------------------------------------------------------


def parse_stdout(stdout: str) -> dict | None:
    """The last marker line's payload, or None when the node printed none."""
    payload = None
    for line in (stdout or "").splitlines():
        if line.startswith(RESULT_MARKER):
            try:
                payload = json.loads(line[len(RESULT_MARKER) :])
            except ValueError:
                payload = None
    return payload


# --- run records ----------------------------------------------------------


def _now() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def now() -> str:
    """UTC timestamp in the same format every record uses."""
    return _now()


def new_run_id() -> str:
    return uuid.uuid4().hex


def write_record(path: str | Path, record: dict) -> None:
    """Atomic JSON write: readers never see a half-written record."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=str(target.parent),
        prefix=f".{target.name}.",
        suffix=".tmp",
        delete=False,
    )
    try:
        json.dump(record, handle, indent=2)
        handle.flush()
        os.fsync(handle.fileno())
    finally:
        handle.close()
    os.replace(handle.name, target)


def read_record(path: str | Path) -> dict | None:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except ValueError:
        return None


def update_record(path: str | Path, **fields: Any) -> dict | None:
    """Merge fields into a record that a driver and the gateway both touch."""
    record = read_record(path)
    if record is None:
        return None
    record.update(fields)
    record["updatedAt"] = _now()
    write_record(path, record)
    return record


def create_record(path: str | Path, **fields: Any) -> dict:
    record = {
        "phase": "queued",
        "status": "running",
        "createdAt": _now(),
        "updatedAt": _now(),
        **fields,
    }
    write_record(path, record)
    return record
