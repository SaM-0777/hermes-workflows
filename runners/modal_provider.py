"""Modal runtime adapter: readiness and the driver command.

Route A (the documented one): the Modal SDK is a declared plugin dependency
(pyproject.toml next to plugin.yaml), so Hermes' package manager installs it into
the managed environment at enable. The driver then runs as a plain script under
that same interpreter (`sys.executable modal_driver.py`), which is the pattern
Modal's sandbox docs describe — App.lookup + Sandbox.create need no `modal run`.

This module still does not `import modal` itself: the gateway imports it, and the
SDK is probed in a subprocess so a missing package is a readiness signal, not an
ImportError that breaks plugin load.

Fallback (route B / sidecar): if the SDK is not importable in the managed
interpreter but an external `modal` CLI is installed, the driver is started with
`modal run` instead. That keeps a self-managed Modal client working.

The file is named `modal_provider.py`, not `modal.py`, because the driver puts
this directory on sys.path and a module called `modal` would shadow the SDK.
"""
from __future__ import annotations

import glob
import os
import subprocess
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

import provider_cli  # noqa: E402  (sibling module, loaded by path on purpose)

PROVIDER_ID = "modal"
CLI_NAME = "modal"
CLI_ENV = "HERMES_WORKFLOW_MODAL_BIN"
DRIVER = _HERE / "modal_driver.py"

_FIXED_CANDIDATES = (
    "~/.local/bin/modal",
    "~/.local/share/uv/tools/modal/bin/modal",
    "~/.local/pipx/venvs/modal/bin/modal",
    "~/.modal/bin/modal",
    "/opt/homebrew/bin/modal",
    "/usr/local/bin/modal",
    "/usr/bin/modal",
)


def _windows_candidates() -> tuple[str, ...]:
    appdata = os.environ.get("APPDATA") or ""
    local = os.environ.get("LOCALAPPDATA") or ""
    profile = os.environ.get("USERPROFILE") or ""
    entries = [
        os.path.join(appdata, "Python", "Scripts", "modal.exe") if appdata else "",
        os.path.join(local, "uv", "tools", "modal", "Scripts", "modal.exe") if local else "",
        os.path.join(profile, ".local", "bin", "modal.exe") if profile else "",
    ]
    return tuple(entry for entry in entries if entry)


def candidates() -> tuple[str, ...]:
    """Install locations for this OS, including versioned Python bin dirs."""
    if sys.platform.startswith("win"):
        return _windows_candidates()

    entries: list[str] = list(_FIXED_CANDIDATES)
    # pip --user installs land in ~/Library/Python/<x.y>/bin on macOS.
    entries.extend(sorted(glob.glob(os.path.expanduser("~/Library/Python/*/bin/modal"))))
    entries.extend(sorted(glob.glob(os.path.expanduser("~/.pyenv/versions/*/bin/modal"))))
    return tuple(entries)


_CACHE: dict[str, str] = {}


def find_modal() -> str:
    """Absolute path to an external modal CLI, or "" when none is installed."""
    if "cli" not in _CACHE:
        _CACHE["cli"] = provider_cli.find_command(
            CLI_NAME, env_var=CLI_ENV, candidates=candidates()
        )
    return _CACHE["cli"]


def sdk_version(timeout: int = 30) -> str:
    """Modal version importable by the managed interpreter, or "" if absent.

    Probed in a subprocess so a missing SDK is a readiness signal rather than an
    ImportError in the gateway. This is the declared-dependency (route A) check.
    """
    if "sdk" not in _CACHE:
        try:
            proc = subprocess.run(
                [sys.executable, "-c", "import modal; print(modal.__version__)"],
                timeout=timeout,
                **provider_cli.subprocess_kwargs(),
            )
            _CACHE["sdk"] = (proc.stdout or "").strip() if proc.returncode == 0 else ""
        except (OSError, subprocess.TimeoutExpired):
            _CACHE["sdk"] = ""
    return _CACHE["sdk"]


def reset_cache() -> None:
    _CACHE.clear()


def credentials() -> dict:
    """Whether Modal credentials exist, without reading their values."""
    token_id = (os.environ.get("MODAL_TOKEN_ID") or "").strip()
    token_secret = (os.environ.get("MODAL_TOKEN_SECRET") or "").strip()
    if token_id and token_secret:
        return {"present": True, "source": "environment"}
    config = Path(os.path.expanduser("~/.modal.toml"))
    if config.is_file():
        return {"present": True, "source": str(config)}
    return {"present": False, "source": ""}


def status() -> dict:
    """Readiness for the setup dialog: what exists, and what is missing."""
    sdk = sdk_version()
    cli = find_modal()
    creds = credentials()

    missing: list[str] = []
    hints: list[str] = []

    if not sdk and not cli:
        missing.append("sdk")
        hints.append(
            "The Modal SDK is declared in this plugin's pyproject.toml. Enable or "
            "restart the plugin so Hermes installs it (`hermes plugins enable "
            "hermes-workflow`, then restart). Alternatively install a client "
            "yourself (`uv tool install modal`); the plugin will use it as a fallback."
        )
    if not creds["present"]:
        missing.append("credentials")
        hints.append(
            "Create a token in the Modal dashboard, then run `modal token set "
            "--token-id <id> --token-secret <secret>` (or export MODAL_TOKEN_ID and "
            "MODAL_TOKEN_SECRET)."
        )

    return {
        "provider": PROVIDER_ID,
        "ready": not missing,
        "sdk": {
            "importable": bool(sdk),
            "version": sdk,
            "interpreter": sys.executable,
        },
        "cli": {"path": cli},
        "credentials": creds,
        "searched": provider_cli.searched(CLI_NAME, env_var=CLI_ENV, candidates=candidates()),
        "missing": missing,
        "hints": hints,
    }


def driver_command(request_path: str | Path) -> list[str]:
    """Command that runs the node driver.

    Prefers the managed interpreter (the declared SDK is importable there); falls
    back to an external `modal run` when only a sidecar client is installed.
    """
    if sdk_version():
        return [sys.executable, str(DRIVER), f"--request={request_path}"]

    cli = find_modal()
    if cli:
        return [cli, "run", str(DRIVER), f"--request={request_path}"]

    raise RuntimeError(
        "The Modal SDK is not available. Enable the plugin so Hermes installs it, "
        "or install an external modal client."
    )
