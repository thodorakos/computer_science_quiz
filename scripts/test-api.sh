#!/usr/bin/env bash
set -euo pipefail
# Smoke test the real local Workers runtime and KV; no remote resources are used.
export WRANGLER_SEND_METRICS=false
export WRANGLER_LOG_PATH="${TMPDIR:-/tmp}/quiz-duel-wrangler.log"
npx --no-install hono batch - --runtime workerd --compact <<'JSONL'
{"method":"POST","path":"/api/game","body":{"name":"Maya","mode":20},"save":{"id":".id","hostToken":".token"},"expect":{"status":201,"body":{"slot":1}}}
{"path":"/api/game/{{id}}/invite","expect":{"status":200,"body":{"host":"Maya"}}}
{"path":"/api/game/{{id}}","expect":{"status":401}}
{"path":"/api/game/{{id}}","headers":{"authorization":"Bearer {{hostToken}}"},"expect":{"status":200,"body":{"p1":{"name":"Maya","done":false,"score":null}}}}
{"method":"POST","path":"/api/game/{{id}}/join","body":{"name":"Lena"},"save":{"guestToken":".token"},"expect":{"status":201,"body":{"slot":2}}}
{"method":"POST","path":"/api/game/{{id}}/answer","body":{"slot":1,"choice":0,"questionIndex":0},"expect":{"status":401}}
{"method":"POST","path":"/api/game/{{id}}/answer","headers":{"authorization":"Bearer {{guestToken}}"},"body":{"slot":1,"choice":0,"questionIndex":0},"expect":{"status":401}}
{"method":"POST","path":"/api/game/{{id}}/answer","headers":{"authorization":"Bearer {{hostToken}}"},"body":{"slot":1,"choice":0,"questionIndex":0},"expect":{"status":200,"body":{"answer":0,"done":false}}}
{"method":"POST","path":"/api/game/{{id}}/answer","headers":{"authorization":"Bearer {{hostToken}}"},"body":{"slot":1,"choice":0,"questionIndex":0},"expect":{"status":200,"body":{"answer":0,"done":false}}}
{"method":"POST","path":"/api/game/{{id}}/answer","headers":{"authorization":"Bearer {{guestToken}}"},"body":{"slot":2,"choice":1,"questionIndex":0},"expect":{"status":200,"body":{"answer":1,"done":false}}}
{"method":"POST","path":"/api/game/{{id}}/join","body":{"name":"Third"},"expect":{"status":409}}
{"method":"POST","path":"/api/game","body":{"name":123},"expect":{"status":400}}
{"method":"POST","path":"/api/game","headers":{"content-type":"text/plain"},"body":"{\"name\":\"A\"}","expect":{"status":415}}
{"method":"POST","path":"/api/game","headers":{"origin":"https://untrusted.example"},"body":{"name":"A"},"expect":{"status":403}}
{"path":"/api/game/xxxxxx/invite","expect":{"status":404}}
JSONL
