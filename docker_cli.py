"""Locate the Docker CLI on any operating system.

A Hermes process can be started by a desktop app, a service manager or a shell,
so PATH is not dependable. On macOS a Finder/Electron launch only sees
``/usr/bin:/bin:/usr/sbin:/sbin`` while Docker Desktop puts its CLI under
``~/.docker/bin`` or inside the app bundle; Windows installs it under Program
Files, LocalAppData or ProgramData; Linux packages it into /usr/bin,
/usr/local/bin, /snap/bin or a Homebrew prefix.

Discovery order is the same everywhere:

1. ``HERMES_WORKFLOW_DOCKER_BIN`` — an explicit command name or absolute path
2. ``shutil.which("docker")`` — the PATH this process actually has
3. per-OS install locations from :func:`search_locations`

Both the tool layer (``tools.py``) and the backend
(``dashboard/plugin_api.py``) resolve the CLI through this module, so the two
cannot drift. They load it by path because each is imported as a standalone
module rather than as a package sibling.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

_CACHE: dict[str, str] = {}


def _exe() -> str:
    """The CLI's file name for this OS."""
    return "docker.exe" if sys.platform.startswith("win") else "docker"


def _windows_locations() -> tuple[str, ...]:
    exe = _exe()
    program_files = os.environ.get("ProgramFiles") or r"C:\Program Files"
    program_files_x86 = os.environ.get("ProgramFiles(x86)") or r"C:\Program Files (x86)"
    local_appdata = os.environ.get("LOCALAPPDATA") or ""
    user_profile = os.environ.get("USERPROFILE") or ""

    locations = (
        os.path.join(local_appdata, "Docker", "bin", exe) if local_appdata else "",
        os.path.join(user_profile, ".docker", "bin", exe) if user_profile else "",
        os.path.join(program_files, "Docker", "Docker", "resources", "bin", exe),
        os.path.join(program_files_x86, "Docker", "Docker", "resources", "bin", exe),
        os.path.join(r"C:\ProgramData\DockerDesktop", "version-bin", "docker.exe"),
    )
    return tuple(location for location in locations if location)


def _macos_locations() -> tuple[str, ...]:
    return (
        "~/.docker/bin/docker",
        "~/.local/bin/docker",
        "/Applications/Docker.app/Contents/Resources/bin/docker",
        "/usr/local/bin/docker",
        "/opt/homebrew/bin/docker",
        "/usr/bin/docker",
    )


def _posix_locations() -> tuple[str, ...]:
    return (
        "~/.docker/bin/docker",
        "~/.local/bin/docker",
        "/usr/local/bin/docker",
        "/usr/bin/docker",
        "/bin/docker",
        "/snap/bin/docker",
        "/opt/homebrew/bin/docker",
        "/home/linuxbrew/.linuxbrew/bin/docker",
    )


def search_locations() -> tuple[str, ...]:
    """Install locations for this OS, in priority order."""
    if sys.platform.startswith("win"):
        return _windows_locations()
    if sys.platform == "darwin":
        return _macos_locations()
    return _posix_locations()


def _usable(path: str) -> bool:
    return bool(path) and os.path.isfile(path) and os.access(path, os.X_OK)


def find_docker_binary() -> str:
    """Absolute path to a usable docker CLI, or "" when none is found.

    The result is cached for the life of the process; call :func:`reset_cache`
    after installing Docker or changing the override.
    """
    if "path" in _CACHE:
        return _CACHE["path"]

    found = ""

    configured = (os.environ.get("HERMES_WORKFLOW_DOCKER_BIN") or "").strip()
    if configured:
        found = shutil.which(configured) or ""
        if not found:
            candidate = os.path.expandvars(os.path.expanduser(configured))
            if _usable(candidate):
                found = candidate

    if not found:
        found = shutil.which(_exe()) or shutil.which("docker") or ""

    if not found:
        for location in search_locations():
            candidate = os.path.expandvars(os.path.expanduser(location))
            if _usable(candidate):
                found = candidate
                break

    _CACHE["path"] = found
    return found


def reset_cache() -> None:
    _CACHE.clear()


def searched() -> str:
    """Everything discovery consults, for an actionable error message."""
    parts: list[str] = []
    configured = (os.environ.get("HERMES_WORKFLOW_DOCKER_BIN") or "").strip()
    if configured:
        parts.append(f"HERMES_WORKFLOW_DOCKER_BIN={configured}")
    parts.append("PATH")
    parts.extend(search_locations())
    return ", ".join(parts)


def subprocess_kwargs() -> dict:
    """Text-mode subprocess options that behave the same on every OS.

    ``encoding`` keeps docker's output decodable when the console locale is not
    UTF-8, and CREATE_NO_WINDOW stops a console flashing up when the gateway runs
    headless on Windows.
    """
    kwargs: dict = {
        "capture_output": True,
        "text": True,
        "encoding": "utf-8",
        "errors": "replace",
    }
    no_window = getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform.startswith("win") else 0
    if no_window:
        kwargs["creationflags"] = no_window
    return kwargs


def compose_file(plugin_root: Path) -> Path:
    """The compose file that defines the node container."""
    return Path(plugin_root) / "docker-compose.yml"
