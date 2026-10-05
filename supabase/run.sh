#!/usr/bin/env bash
# Run a .sql file against the Visuma Supabase project via the Management API.
set -euo pipefail
REF=lphysuemxnmcuukzsoya
[ -n "${SB:-}" ] || { echo "SB token not set"; exit 1; }
f="$1"
python3 - "$f" <<'PY' > /tmp/_q.json
import json,sys
print(json.dumps({"query": open(sys.argv[1], encoding='utf-8').read()}))
PY
out=$(curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $SB" -H "Content-Type: application/json" --data @/tmp/_q.json)
echo "$out" | head -c 600; echo
echo "$out" | grep -qi '"message"\|"error"' && { echo "^^ FAILED: $f"; exit 1; }
echo "OK: $f"
