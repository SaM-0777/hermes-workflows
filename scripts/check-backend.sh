#!/usr/bin/env bash
# Smoke-test the plugin's Python backend the way the gateway loads it.
#
#   ./scripts/check-backend.sh
#
# Loads dashboard/plugin_api.py through the same importer the gateway uses
# (hermes_cli.plugin_isolation.import_user_code), lists the routes it mounts,
# then runs one real node through POST /run — which means a real execute_code
# kernel child — and prints the response.
#
# This is a pre-flight/regression check on the code. To confirm the *running*
# gateway picked it up, restart that service and run a workflow from the Studio:
# the plugin router is imported once at mount and is not re-imported for an
# already-mounted plugin, so a restart is what loads it.
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_DIR="${HERMES_AGENT_DIR:-$HOME/.hermes/hermes-agent}"

PYTHON="$(ls -d "$HOME"/.hermes/tools/python-*/bin/python3 2>/dev/null | tail -1)"
if [ -z "${PYTHON:-}" ]; then
  echo "Could not find the Hermes runtime python under ~/.hermes/tools/python-*" >&2
  exit 1
fi
if [ ! -d "$AGENT_DIR" ]; then
  echo "Hermes checkout not found at $AGENT_DIR (set HERMES_AGENT_DIR)" >&2
  exit 1
fi

PLUGIN_DIR="$PLUGIN_DIR" AGENT_DIR="$AGENT_DIR" exec "$PYTHON" -I - <<'PY'
import asyncio, json, os, sys

agent_dir = os.environ["AGENT_DIR"]
plugin_dir = os.environ["PLUGIN_DIR"]

os.environ.pop("PYTHONPATH", None)
sys.path.insert(0, agent_dir)
import hermes_bootstrap  # noqa: F401  (wires site-packages like `hermes` itself)

from hermes_cli.plugin_isolation import import_user_code

api_path = os.path.join(plugin_dir, "dashboard", "plugin_api.py")
module = import_user_code(api_path, "hermes_dashboard_plugin_hermes-workflow")
if module is None:
    sys.exit("plugin_api.py has no module spec — is the path right?")

routes = sorted({getattr(route, "path", "") for route in module.router.routes})
print(f"loaded {api_path}")
print(f"routes: {', '.join(routes)}")
assert "/run" in routes, "the /run route did not mount"

NODE = """
import os

class Execution:
    def build_output(self, inputs, parameters, context):
        return {"echo": inputs.get("in"), "pid": os.getpid(), "cwd": os.getcwd()}
"""

body = module.RunRequest(node_id="smoke", code=NODE, inputs={"in": "hello"})
result = asyncio.run(module.run(body))
print("\nPOST /run ->", json.dumps(result, indent=2))

assert result["node_id"] == "smoke", result
assert result["status"] == "completed", result
assert result["output"]["echo"] == "hello", result
assert result["output"]["pid"] != os.getpid(), "node ran in the caller process!"
print(
    f"\nnode ran in pid {result['output']['pid']} (checks ran in {os.getpid()}); "
    f"cwd {result['output']['cwd']}"
)

NULLS = """
class Execution:
    def build_output(self, inputs, parameters, context):
        return {"seen": inputs}
"""
nulls = asyncio.run(
    module.run(module.RunRequest(node_id="nulls", code=NULLS, inputs={"in": None, "flag": True}))
)
print("\nNone/true inputs ->", json.dumps(nulls["output"]))
assert nulls["output"]["seen"] == {"in": None, "flag": True}, nulls

BAD = module.RunRequest(node_id="smoke", code="x = 1")
try:
    asyncio.run(module.run(BAD))
except Exception as exc:  # fastapi.HTTPException
    detail = getattr(exc, "detail", {})
    print(f"missing Execution class -> HTTP {getattr(exc, 'status_code', '?')} {detail}")
    assert getattr(exc, "status_code", None) == 400, detail
else:
    sys.exit("a node without an Execution class was accepted")

print("\nOK: backend loads, /run mounts, nodes execute through execute_code in a child process.")
PY
