---
name: op-spec-patrol
description: canonical spec (.claude/rules/) を警備員的に巡回するスキル。`op spec-patrol score` で feature を選定し、機械 drift (broken-link / paths-overlap / cite / index) は CLI が決定論検出。うち安全に確定する索引再生成 (rebuild-index) と cite 降格 (cite-downgrade) のみ dry-run→--apply で auto-fix し、broken-link / paths-overlap は検出のみ (修正先は人間判断ゆえ報告)。domain drift (正本⟷code の意味的乖離) は op-spec-patrol-audit workflow で spec-expert 監査 + refute し、confirmed は Spec Patrol Ledger に記録して op-spec の cultivation queue へ回す (起票しない)。「op-spec-patrol」「正本巡回」「spec patrol」「canonical spec 監査」等のキーワードで起動。
---

# op-spec-patrol: canonical spec の警備員的巡回

正本 (`.claude/rules/<feature>.md`) を op-patrol と同じ要領で巡回し、code に追従できていない正本を見つける。
機械 drift は CLI で決定論検出し、LLM 判断が要る domain drift だけを workflow に回す。

## Invocation Mode

- **Direct** (既定): Phase 1 の選定と Phase 3 の機械 fix 適用の前に承認 gate を置く。
- **`--auto`**: 機械 fix を自動適用し、domain drift は Ledger に記録するだけ。

## 不変則 7 例外宣言

op-spec-patrol は機械 drift のうち fix が決定論的に確定するもの (`rebuild-index` / `cite-downgrade`) だけを
auto-fix する mutation 責務を持つ (CLAUDE.md 不変則7 の第 3 例外)。
broken-link / paths-overlap は検出のみ (修正先は人間判断)。domain drift は auto-fix も起票もせず、正本も書き換えない
(正本 write は op-spec が human align 後に行う)。この例外は op-spec-patrol に限る。

---

### Phase 0: preflight

1. `git rev-parse --show-toplevel` / `gh auth status`。
2. `.claude/rules` が無ければ停止し、先に `/op-spec` で正本を起こすよう案内する。
3. Spec Patrol Ledger の取得:
   ```bash
   LEDGER_ISSUE="$(op issue list --label op-spec-patrol --label op-state --state open | jq -r '.details.issues[0].number // empty')"
   op spec-patrol ledger pull --issue "$LEDGER_ISSUE" > "$PREV_STATE_JSON"   # area_state: feature → last_patrolled_at / scan_count / drift_counts
   ```
   Ledger Issue が無ければ `op spec-patrol ledger init` を案内する (label `op-spec-patrol` + `op-state` + `do-not-close`)。

### Phase 1: feature 選定

```bash
op spec-patrol score --last-patrolled-at <feature>=<RFC3339> ...   # area_state の last_patrolled_at を feature ごとに注入
```

`details.specs` (spec_score 降順) から budget 分の top-N feature を選ぶ。Direct は選定 + score 内訳を提示して承認を得る。

### Phase 2: 機械 drift 検出 (read-only)

```bash
op spec-patrol list-specs --json       # paths overlap
op spec-patrol check-links --json      # dead feature / dead section / dangling op-spec-ref
op spec-patrol cite-downgrade --json   # dry-run: 出典欠落 [human] の降格予定
op spec-patrol rebuild-index --json    # dry-run: 索引表の再生成差分
```

### Phase 3: 機械 auto-fix

Phase 2 の dry-run に差分があるものだけ適用する (Direct は承認後、`--auto` は自動):

```bash
op spec-patrol rebuild-index --apply --yes    # constitution Part 2 索引を再生成
op spec-patrol cite-downgrade --apply --yes   # 出典欠落 [human] → [?] TODO: needs-human
```

broken-link / paths-overlap は fix を生成せず、Phase 7 の報告に残す。

### Phase 4: domain drift 監査

```
Workflow({ name: "op-spec-patrol-audit", args: {
  today: "<YYYY-MM-DD>", run_id: "<run id>",
  features: [{ feature, spec_path, paths:[...], code_scope:[...], status, target_issues:[...] }]  // = Phase 1 選定
} })
```

args は bare object で渡す (`JSON.stringify` しない、`_shared/workflow-calling.md` §4)。
戻り `.result.features[].findings` / `.verdicts` のうち **verdict=confirmed のみ採用**する (refuted / downgrade は報告で可視化)。

### Phase 5: route

- 機械 drift: Phase 3 で適用済み。残り (paths-overlap / broken-link) は報告に残す。
- domain confirmed drift: 起票せず、Phase 6 で Ledger に記録する。op-spec の drift-driven entry がそれを拾って cultivation する。

### Phase 6: Spec Patrol Ledger 更新

```bash
op spec-patrol ledger push --issue "$LEDGER_ISSUE" --checkpoint-id <id> --previous-state "$PREV_STATE_JSON" \
  --updated-feature <feature>=<RFC3339> ... \
  --drift-count <feature>=<drift_type>:<count> ...   # confirmed drift (機械 + domain) があった feature のみ。例: op-sweep=error:2
```

`--drift-count` を渡さないと drift 実績が Ledger に残らず、op-spec の drift-driven entry が拾えない。

### Phase 7: 完了報告

- 巡回した feature と score 内訳
- 機械 drift: 検出件数と auto-fix 適用結果
- domain drift: confirmed / refuted の内訳と、op-spec で拾う候補一覧
- 自動 fix しなかった機械 finding (paths-overlap / broken-link) と人間判断が要る点
- Ledger checkpoint id、未巡回 feature

正本を俯瞰したいときは `/op-rules` を案内してよい。
