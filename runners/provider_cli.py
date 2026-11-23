"""Locating a provider CLI on any OS.

Same problem the docker adapter has: a Hermes process started by a desktop app
sees a minimal PATH, so a CLI that lives in a user-local or tool-managed
directory has to be looked for explicitly. Order is always: explicit override,
PATH, then the provider's own install locations.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys


def exe(name: str) -> str:
    """The executable's file name for this OS."""
    return f"{name}.exe" if sys.platform.startswith("win") else name


def _usable(path: str) -> bool:
    return bool(path) and os.path.isfile(path) and os.access(path, os.X_OK)


def find_command(
    name: str,
    *,
    env_var: str | None = None,
    candidates: tuple[str, ...] = (),
) -> str:
    """Absolute path to a usable CLI, or "" when none is found."""
    if env_var:
        configured = (os.environ.get(env_var) or "").strip()
        if configured:
            found = shutil.which(configured) or ""
            if not found:
                resolved = os.path.expandvars(os.path.expanduser(configured))
                if _usable(resolved):
                    found = resolved
            if found:
                return found

    found = shutil.which(exe(name)) or shutil.which(name) or ""
    if found:
        return found

    for candidate in candidates:
        resolved = os.path.expandvars(os.path.expanduser(candidate))
        if _usable(resolved):
            return resolved
    return ""


def searched(
    name: str,
    *,
    env_var: str | None = None,
    candidates: tuple[str, ...] = (),
) -> str:
    """Everything `find_command` consults, for an actionable error message."""
    parts: list[str] = []
    if env_var:
        configured = (os.environ.get(env_var) or "").strip()
        if configured:
            parts.append(f"{env_var}={configured}")
    parts.append("PATH")
    parts.extend(candidates)
    return ", ".join(parts)


def subprocess_kwargs() -> dict:
    """Text-mode subprocess options that behave the same on every OS."""
    kwargs: dict = {
        "capture_output": True,
        "text": True,
        "encoding": "utf-8",
        "errors": "replace",
    }
    no_window = (
        getattr(subprocess, "CREATE_NO_WINDOW", 0)
        if sys.platform.startswith("win")
        else 0
    )
    if no_window:
        kwargs["creationflags"] = no_window
    return kwargs
