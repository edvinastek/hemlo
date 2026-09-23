#!/usr/bin/env bash
# Runs supabase/tests/security.sql against the project and prints a verdict per
# check. Needs SB set to a Supabase access token. Leaves nothing behind: the
# file rolls itself back.
set -euo pipefail
REF=lphysuemxnmcuukzsoya
python3 -c "import json,sys;print(json.dumps({'query':open(sys.argv[1]).read()}))" "$(dirname "$0")/tests/security.sql" > /tmp/_sec.json
curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $SB" -H "Content-Type: application/json" --data @/tmp/_sec.json |
python3 -c "
import sys, json
d = json.load(sys.stdin)
if isinstance(d, dict): print(d); sys.exit(1)
for r in d: print(f\"{r['result']:4}  {r['check_name']}  (expected {r['expected']}, got {r['actual']})\")
bad = [r for r in d if r['result'] != 'ok']
print(); print(len(d) - len(bad), 'of', len(d), 'passed')
sys.exit(1 if bad else 0)"
