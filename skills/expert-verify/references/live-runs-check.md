# 動いている run の確かめ方

SKILL.md「2.2 stop の実行と保留」の 1 を実行する例。

```bash
co="<checkout>"; own="<start の pid_file>"; me=$(jq -r '.runId' "$own")
roots=("$co/.verify-runner" "${XDG_CACHE_HOME:-$HOME/.cache}/op-verify-runner/$(basename "$co")")
for f in "$(dirname "$own")"/*.json; do
  [ "$f" = "$own" ] && continue
  id=$(jq -er 'select(.runId and .startedAt and (.pids | type == "array")) | .runId' "$f" 2>/dev/null) || continue
  [ "$id" = "$me" ] && continue
  [ -e "${roots[0]}/$id/finished" ] || [ -e "${roots[1]}/$id/finished" ] && continue
  for p in $(jq -r '.pids[].pid' "$f"); do
    if kill -0 "$p" 2>/dev/null; then echo "$id"; break; fi
  done
done
```
