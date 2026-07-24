#!/bin/sh
# Boot the openai-oauth proxy with the site's ChatGPT session.
#
# The sign-in flow is interactive and cannot run in a headless container, so
# the session is created once on a developer machine (`npx openai-oauth login`)
# and delivered here as CODEX_AUTH_JSON.
set -eu

CODEX_HOME="${CODEX_HOME:-/data/.codex}"
AUTH_FILE="$CODEX_HOME/auth.json"
mkdir -p "$CODEX_HOME"

# Seed from the env var on FIRST boot only. An existing file always wins: the
# proxy rotates the session as it runs, so re-seeding on every redeploy would
# overwrite live credentials with the stale bootstrap copy and eventually
# break the model. This is why the volume in DEPLOYMENT.md §8.2 is required
# and not just nice to have.
#
# CODEX_AUTH_RESEED=1 forces a one-off overwrite, for when the session really
# has gone bad and CODEX_AUTH_JSON holds a fresh one. Clear the flag again
# afterwards, or every redeploy will stamp on the rotated credentials.
if [ "${CODEX_AUTH_RESEED:-}" = "1" ] && [ -n "${CODEX_AUTH_JSON:-}" ]; then
  echo "openai-oauth: CODEX_AUTH_RESEED=1 — replacing the stored session"
  rm -f "$AUTH_FILE"
fi

if [ -n "${CODEX_AUTH_JSON:-}" ] && [ ! -f "$AUTH_FILE" ]; then
  printf '%s' "$CODEX_AUTH_JSON" > "$AUTH_FILE"
  chmod 600 "$AUTH_FILE"
  echo "openai-oauth: seeded $AUTH_FILE from CODEX_AUTH_JSON"
fi

if [ ! -f "$AUTH_FILE" ]; then
  echo "openai-oauth: no session at $AUTH_FILE." >&2
  echo "  Run 'npx openai-oauth@latest login' locally, then set CODEX_AUTH_JSON" >&2
  echo "  to the contents of ~/.codex/auth.json on this service." >&2
  exit 1
fi

# Bind 0.0.0.0, NOT the IPv6 wildcard "::". openai-oauth builds its own
# upstream URL by concatenating the host, so "::" produces "http://:::10531"
# and every request comes back 500 "Failed to parse URL". 0.0.0.0 is verified
# reachable from the app service over <service>.railway.internal.
#
# Own port, deliberately not Railway's injected PORT: this service must stay
# private, and a shifting port would silently break CHATGPT_OAUTH_BASE on the
# app service.
exec npx "openai-oauth@${OPENAI_OAUTH_VERSION:-latest}" \
  --host "${PROXY_HOST:-0.0.0.0}" \
  --port "${PROXY_PORT:-10531}"
