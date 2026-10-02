#!/usr/bin/env bash
# Usage: [LOCALDB_NAME=pgX LOCALDB_PORT=5543X LOCALDB_REPO=/path/to/checkout] bash scripts/localdb.sh [stop]
# Fresh local Postgres 16 with Supabase stand-ins, every migration applied in order.
set -e
S=$(cd "$(dirname "$0")" && pwd)
B=/usr/lib/postgresql/16/bin
NAME=${LOCALDB_NAME:-pg16}
PORT=${LOCALDB_PORT:-55432}
REPO=${LOCALDB_REPO:-/home/claude/getit}
D=/home/pgtest/$NAME
as() { su -s /bin/bash pgtest -c "$*"; }
if [ "$1" = "stop" ]; then as "$B/pg_ctl -D $D/data -w stop -m fast" || true; exit 0; fi
as "$B/pg_ctl -D $D/data -w stop -m fast" >/dev/null 2>&1 || true
rm -rf $D; mkdir -p $D; chown pgtest $D
as "$B/initdb -D $D/data -A trust -U postgres" >/dev/null
as "$B/pg_ctl -D $D/data -o '-p $PORT -k $D' -l $D/log -w start" >/dev/null
P="psql -h $D -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "create extension if not exists pg_trgm" postgres
$P -f $S/stub.sql postgres
for f in $REPO/supabase/migrations/*.sql; do
  echo "== $(basename $f)"; $P -f $f postgres
done
echo MIGRATIONS OK
echo "psql: psql -h $D -p $PORT -U postgres postgres   (security suite: psql ... -f $REPO/supabase/tests/security.sql)"
