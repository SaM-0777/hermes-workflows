#!/bin/sh
# Node container entrypoint.
#
# /opt/venv is a named Docker volume (see docker-compose.yml), so the
# interpreter and everything installed into it survive container recreation and
# image rebuilds. It is created once and never recreated: an existing, working
# environment is reused as-is.
set -e

if ! /opt/venv/bin/python -c 'import sys' >/dev/null 2>&1; then
    if [ -e /opt/venv/bin/python ]; then
        echo "[hermes-workflow] /opt/venv is unusable (base interpreter changed); rebuilding it"
        # --clear empties the target directory, so no manual deletion is needed.
        uv venv --clear --seed --python 3.12 /opt/venv
    else
        echo "[hermes-workflow] creating the persistent interpreter in /opt/venv"
        # --seed also installs pip/setuptools/wheel, so `python -m pip` works too.
        uv venv --seed --python 3.12 /opt/venv
    fi
fi

echo "[hermes-workflow] ready: $(/opt/venv/bin/python -V 2>&1) at /opt/venv (persistent volume)"

exec "$@"
