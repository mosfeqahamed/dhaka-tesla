#!/bin/sh
# Bring the database up to date, load the demo cast (idempotent), then serve.
# The same image runs locally in compose and on the hosting platform.
set -e
node dist/db/migrate.js
if [ "${SEED_ON_START:-true}" = "true" ]; then
  node dist/db/seed.js
fi
exec node dist/server.js
