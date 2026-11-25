# op-merge の CI 待ち (4-3)

`run_in_background` で起動する。結果の扱いは SKILL.md の 4-3。

```bash
# <head sha> は push 後の head。出力は pass / fail / none / pending / error
for i in $(seq 1 15); do
  C=$(gh api --paginate 'repos/{owner}/{repo}/commits/<head sha>/check-runs' --jq '.check_runs[] | .conclusion // "pending"') || { R=error; break; }
  if [ -z "$C" ]; then if [ "$i" -ge 3 ]; then R=none; else R=pending; fi
  elif echo "$C" | grep -qx pending; then R=pending
  elif echo "$C" | grep -qvxE 'success|skipped|neutral'; then R=fail
  else R=pass; fi
  [ "$R" != pending ] && break
  [ "$i" -lt 15 ] && sleep 60
done
echo "$R"
```
