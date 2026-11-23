"""Runs one node's Python inside a Modal sandbox.

Started by the gateway through the modal CLI:

    modal run runners/modal_driver.py --request=<request.json>

That is deliberate: the CLI runs this file with the interpreter that already has
the SDK, so Hermes' own interpreter never imports `modal` and the plugin never
creates an environment of its own.

The request JSON is written by the gateway and carries the node script, the
already-hashed file references, the resolved options and the path of the run
record this driver keeps up to date.
"""
from __future__ import annotations

import json
import os
import re
import shlex
import signal
import sys
import traceback
from pathlib import Path

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

import modal  # noqa: E402  (provided by the modal CLI's interpreter)

import runner_base as base  # noqa: E402  (sibling module, loaded by path on purpose)

app = modal.App("hermes-workflow-nodes")

# Environment variables a node may see. Anything else stays on the host.
ENV_ALLOWLIST = (
    "HF_TOKEN",
    "HUGGING_FACE_HUB_TOKEN",
    "HF_HUB_ENABLE_HF_TRANSFER",
)


def _phase(record_path: str, phase: str, **fields) -> None:
    base.update_record(record_path, phase=phase, **fields)
    print(f"[driver] {phase}", flush=True)


IMAGE_SOURCES = ("registry", "name")


def _image(name: str, source: str, apt_packages: list[str] | None = None):
    """Build the sandbox image from the declared source.

    Modal's two constructors are not interchangeable. ``from_registry`` takes a
    container image reference; ``from_name`` references an image previously
    published with ``Image.publish`` and hydrates lazily, so its lookup only
    happens once Sandbox.create resolves dependencies. The name alone cannot be
    inspected to tell the two apart (``python:3.12-slim`` is a syntactically
    valid published name with tag ``3.12-slim``), so the provider descriptor
    declares which one the configured value is.

    OS packages are image-level by nature: a sandbox is destroyed after one
    node, so anything apt-installed at run time dies with it. They mirror the
    plugin Dockerfile's apt line, which is what makes the two runtimes carry the
    same baseline libraries.
    """
    if source == "name":
        image = modal.Image.from_name(name)
    elif source == "registry":
        image = modal.Image.from_registry(name)
    else:
        raise ValueError(
            "Unknown imageSource "
            f"'{source}'; expected one of: {', '.join(IMAGE_SOURCES)}."
        )

    if apt_packages:
        image = image.apt_install(*apt_packages)
    return image


def _package_list(value) -> list[str]:
    """Whitespace- or comma-separated package names from a descriptor option."""
    return [item for item in re.split(r"[\s,]+", str(value or "")) if item]


def _with_pip(image, packages: list[str], index_url: str, torch_index_url: str = ""):
    """Bake Python packages into the image, so every node's sandbox has them.

    PyPI's torch wheel is the CPU build, so when a torch package is requested and
    a torch index is declared, torch is installed from that index first and the
    remaining packages from the default one. Both layers are cached by Modal.
    """
    if not packages:
        return image

    torch_packages: list[str] = []
    others: list[str] = []
    for package in packages:
        name = re.split(r"[=<>!\[ ]", package, maxsplit=1)[0].strip().lower()
        (torch_packages if name == "torch" else others).append(package)

    if torch_packages and torch_index_url:
        image = image.uv_pip_install(*torch_packages, index_url=torch_index_url)
        torch_packages = []

    remaining = torch_packages + others
    if index_url:
        return image.uv_pip_install(*remaining, index_url=index_url)
    return image.uv_pip_install(*remaining)


def _ensure_venv(sandbox, venv_dir: str, python: str) -> str:
    """Create the node venv on the Volume once; return its interpreter.

    Python packages installed at run time are the one thing here that cannot be
    image-level: the workflow may install them itself. Putting the venv on the
    mounted Volume is the Modal equivalent of the docker runtime's ``/opt/venv``
    volume, so an install in one node is still there for the next.
    """
    venv_python = f"{venv_dir}/bin/python"
    try:
        sandbox.filesystem.stat(venv_python)
        return venv_python
    except Exception:  # noqa: BLE001 - absent is the normal first run
        pass

    command = (
        f"uv venv {shlex.quote(venv_dir)} --python {shlex.quote(python)} "
        f"|| {shlex.quote(python)} -m venv {shlex.quote(venv_dir)}"
    )
    proc = sandbox.exec("sh", "-lc", command, timeout=180)
    stdout = proc.stdout.read()
    returncode = proc.wait()
    stderr = proc.stderr.read()
    if returncode != 0:
        raise RuntimeError(
            f"Could not create the node venv at {venv_dir}: "
            f"{((stderr or '') + (stdout or '')).strip()[-2000:] or 'no output'}"
        )
    print(f"[driver] venv ready at {venv_dir}", flush=True)
    return venv_python


def _not_found_message(exc: Exception, name: str, source: str) -> str:
    """Explain an unresolved sandbox dependency in terms of the image source."""
    if source == "name":
        hint = (
            f"Publish it with Image.publish({name!r}) first, or set Image source "
            "to 'registry' if the value is a container image reference."
        )
    else:
        hint = (
            "Check that the reference exists and is pullable, or set Image source "
            f"to 'name' if {name!r} is an image previously published to Modal."
        )
    return f"{exc}. Image {name!r} was used as a {source} reference. {hint}"


def _sandbox_env(options: dict, data_dir: str, venv_dir: str = "") -> dict:
    env: dict[str, str] = {}
    for key in ENV_ALLOWLIST:
        value = os.environ.get(key)
        if value:
            env[key] = value
    # Hugging Face downloads (datasets, weights) belong on the volume, not on the
    # sandbox's ephemeral disk: the next node finds them again.
    env.setdefault("HF_HOME", f"{data_dir}/hf-cache")
    if venv_dir:
        env["VIRTUAL_ENV"] = venv_dir
        base_path = env.get("PATH") or (
            "/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin"
        )
        env["PATH"] = f"{venv_dir}/bin:{base_path}"
    env.update(options.get("env") or {})
    return env


def _upload(sandbox, files: dict, data_dir: str) -> tuple[dict[str, str], list[dict]]:
    """Copy host files into the volume, skipping ones already there."""
    mapping: dict[str, str] = {}
    uploaded: list[dict] = []

    for host_path, meta in files.items():
        remote = f"{data_dir}/uploads/{meta['sha256']}/{meta['name']}"
        mapping[host_path] = remote
        try:
            sandbox.filesystem.stat(remote)
            uploaded.append({"path": host_path, "remote": remote, "cached": True})
            continue
        except Exception:  # noqa: BLE001 - absent is the normal case
            pass

        sandbox.filesystem.make_directory(f"{data_dir}/uploads/{meta['sha256']}")
        sandbox.filesystem.copy_from_local(host_path, remote)
        uploaded.append(
            {
                "path": host_path,
                "remote": remote,
                "cached": False,
                "size": meta.get("size", 0),
            }
        )
        print(f"[driver] uploaded {host_path} -> {remote}", flush=True)

    return mapping, uploaded


def run(request: dict) -> int:
    record_path = request["record_path"]
    run_id = request["run_id"]
    options = request.get("options") or {}

    timeout = int(options.get("timeoutSeconds") or 300)
    data_dir = str(options.get("dataDir") or "/data")
    workdir = str(options.get("workdir") or "/work")
    python = str(options.get("python") or "python3")
    gpu = (options.get("gpu") or "").strip() or None
    volume_name = str(options.get("volume") or "hermes-workflow")
    app_name = str(options.get("app") or "hermes-workflow-nodes")
    image_name = str(options.get("image") or "python:3.12-slim")
    image_source = str(options.get("imageSource") or "registry").strip().lower()
    apt_packages = _package_list(options.get("aptPackages"))
    pip_packages = _package_list(options.get("pipPackages"))
    pip_index_url = str(options.get("pipIndexUrl") or "").strip()
    torch_index_url = str(options.get("torchIndexUrl") or "").strip()
    venv_dir = str(options.get("venvDir") or "").strip()

    files = request.get("files") or {}

    _phase(record_path, "starting", sandboxId=None)

    volume = modal.Volume.from_name(volume_name, create_if_missing=True)
    app_handle = modal.App.lookup(app_name, create_if_missing=True)

    base_image = _image(image_name, image_source, apt_packages)

    try:
        sandbox = modal.Sandbox.create(
            app=app_handle,
            image=_with_pip(base_image, pip_packages, pip_index_url, torch_index_url),
            volumes={data_dir: volume},
            workdir=workdir,
            timeout=timeout + 120,  # sandbox outlives the exec so logs and cleanup work
            gpu=gpu,
            runtime="gvisor" if gpu else None,
            cpu=options.get("cpu") or None,
            memory=options.get("memory") or None,
            env=_sandbox_env(options, data_dir, venv_dir),
        )
    except modal.exception.NotFoundError as exc:
        # The image lookup happens here, not in from_name/from_registry, so this
        # is where a wrong or unpublished reference surfaces.
        raise RuntimeError(
            _not_found_message(exc, image_name, image_source)
        ) from exc

    try:
        sandbox_id = getattr(sandbox, "object_id", None) or ""
        base.update_record(record_path, sandboxId=sandbox_id)
        print(f"[driver] sandbox {sandbox_id}", flush=True)

        _phase(record_path, "uploading")
        mapping, uploaded = _upload(sandbox, files, data_dir)
        base.update_record(record_path, uploaded=uploaded)
        if mapping:
            base.update_record(
                record_path,
                parameters=base.rewrite_paths(request.get("parameters") or {}, mapping),
                inputs=base.rewrite_paths(request.get("inputs") or {}, mapping),
            )
            request["parameters"] = base.rewrite_paths(request.get("parameters") or {}, mapping)
            request["inputs"] = base.rewrite_paths(request.get("inputs") or {}, mapping)

        _phase(record_path, "running")
        sandbox.filesystem.make_directory(workdir)
        script_path = f"{workdir}/node-{run_id}.py"

        # The node runs in the Volume venv when one is configured, so packages a
        # workflow installs itself survive into the next node's sandbox.
        python_path = _ensure_venv(sandbox, venv_dir, python) if venv_dir else python

        # Wrap the node source with the shared driver AFTER host paths were
        # rewritten, so the payload the sandbox sees already points at the
        # uploaded files. Empty result path: the marker carries the result on
        # stdout, which is what this driver parses.
        script = base.node_script(
            request["script"],
            request.get("inputs") or {},
            request.get("parameters") or {},
            {},
            "",
        )
        sandbox.filesystem.write_text(script, script_path)

        process = sandbox.exec(python_path, script_path, timeout=timeout)
        # stdout first: it carries the node's own output and the result marker.
        # stderr is drained after the process exits, which is fine for the bytes a
        # node writes there.
        stdout = process.stdout.read()
        exit_code = process.wait()
        stderr = process.stderr.read()

        if stdout:
            print(stdout, end="" if stdout.endswith("\n") else "\n", flush=True)

        payload = base.parse_stdout(stdout)
        if payload is None:
            message = (stderr or "").strip() or (
                f"Node python exited with code {exit_code} without a result marker."
            )
            base.update_record(
                record_path,
                phase="failed",
                status="failed",
                endedAt=base._now(),
                exitCode=exit_code,
                error={"message": message, "stderr": stderr[-4000:]},
            )
            print(f"[driver] failed: {message}", file=sys.stderr, flush=True)
            return 1

        if not payload.get("ok"):
            # The driver caught the node's own failure (validation error, raised
            # exception) and reported it through the marker.
            message = str(payload.get("message") or "Node execution failed.")
            base.update_record(
                record_path,
                phase="failed",
                status="failed",
                endedAt=base._now(),
                exitCode=exit_code,
                error={"message": message, "stderr": stderr[-4000:]},
            )
            print(f"[driver] failed: {message}", file=sys.stderr, flush=True)
            return 1

        base.update_record(
            record_path,
            phase="finished",
            status="completed",
            endedAt=base._now(),
            exitCode=exit_code,
            output=payload.get("output"),
            result=payload,
            stderr=stderr[-4000:],
        )
        return 0
    finally:
        try:
            sandbox.terminate()
        except Exception:  # noqa: BLE001 - cleanup must not mask the result
            traceback.print_exc()


def _run_from_args(arglist) -> None:
    # A cancelled run signals this process; turning that into SystemExit makes the
    # finally in run() terminate the sandbox instead of leaking it.
    def _terminate(signum, frame):  # noqa: ANN001 - signal handler signature
        raise SystemExit(128 + signum)

    try:
        signal.signal(signal.SIGTERM, _terminate)
    except (ValueError, OSError):  # pragma: no cover - non-main thread
        pass

    request_path = None
    for entry in arglist:
        if entry.startswith("--request="):
            request_path = entry.split("=", 1)[1]
        elif request_path is None and not entry.startswith("-"):
            request_path = entry

    if not request_path:
        raise SystemExit("usage: modal_driver.py --request=<request.json>")

    request = json.loads(Path(request_path).read_text(encoding="utf-8"))

    try:
        code = run(request)
    except Exception as exc:  # noqa: BLE001 - the record is the user-facing error
        base.update_record(
            request["record_path"],
            phase="failed",
            status="failed",
            endedAt=base._now(),
            error={"message": str(exc), "traceback": traceback.format_exc()[-4000:]},
        )
        print(f"[driver] error: {exc}", file=sys.stderr, flush=True)
        raise SystemExit(1)

    raise SystemExit(code)


@app.local_entrypoint()
def main(*arglist):
    # `modal run modal_driver.py` path, for an externally installed Modal client.
    _run_from_args(arglist)


if __name__ == "__main__":
    # Plain-script path (the declared-dependency route): the Modal SDK is a
    # plugin dependency, so Hermes' managed interpreter imports modal and runs
    # this directly. App.lookup + Sandbox.create need no `modal run` entrypoint.
    _run_from_args(sys.argv[1:])
