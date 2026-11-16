# Node execution image: Python 3.12 + uv.
#
# The interpreter environment lives at /opt/venv, which docker-compose.yml mounts
# from a named volume. Packages therefore persist across container recreation and
# image rebuilds — /opt/venv is created once by docker-entrypoint.sh and reused
# as-is. There is nothing to activate: PATH already points at /opt/venv/bin.
#
# Build/rebuild: docker compose up -d --build
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONIOENCODING=utf-8 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_NO_PROGRESS=1 \
    UV_CACHE_DIR=/opt/uv-cache \
    VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /work

COPY docker-entrypoint.sh /usr/local/bin/hermes-workflow-entrypoint
RUN chmod +x /usr/local/bin/hermes-workflow-entrypoint

# The container stays up; the plugin starts nodes with `docker exec`.
# Packages install into the persistent volume at run time:
#   docker exec hermes-workflow uv pip install <package>
# OS packages belong here in the Dockerfile, because they live in the image.
ENTRYPOINT ["/usr/local/bin/hermes-workflow-entrypoint"]
CMD ["sleep", "infinity"]
