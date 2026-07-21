<!--
機能概要: op-run フェーズ2-A (探知) / 2-C (修正) / 3.5 (post-check) / 4 (global review) で
         共通に使われる parallel dispatch 方針の正本。並列管理は Dynamic Workflows runtime に
         委譲し、controller は cluster を partition して Workflow に一括で渡す。
作成意図: 旧版は EFFECTIVE_MAX_PARALLEL vs CONTROLLER_CHUNK_BUDGET(16) の chunk loop + Monitor
         待ち判定を canonical 集約していた (Issue #390)。ADR-0009 Phase C (C1) で op-run fan-out を
         Dynamic Workflows へ全面移行したことで controller 側の人為 chunk 分割・Monitor 待ち合わせは
         廃止された。本ファイルは「並列管理は runtime に委譲し、controller は partition のみ行う」という
         新方針の正本として書き換える。
注意点: 並列上限 (同時 agent 数) の決定は Dynamic Workflows runtime の責務であり、controller は
        上限を意識しない (人為 chunk 分割禁止)。density 観測値による `op cluster max-parallel` 再算出は
        SKILL.md 2-B 側に残る observability 用途であり、dispatch 上限の強制装置ではない。
-->

<!-- op-domain: refactor -->
<!-- op-source: op-run -->

# parallel-dispatch-policy: op-run parallel dispatch 方針 (canonical)

op-run が各フェーズで subagent を spawn するときの parallel dispatch 方針の正本。
ADR-0009 Phase C (C1) で fan-out を Dynamic Workflows へ全面移行したことに伴い、
controller 側の人為 chunk 分割・Monitor 待ち合わせを廃止した版。

---

## 方針 (runtime 委譲)

並列管理は **Dynamic Workflows runtime に委譲する**。

- runtime は同時 agent 数を `min(16, cores-2)` に自動制限し、超過分は **透過キューイング** する。
- controller は全 cluster を partition (`parallel_clusters` / `serial_chains`) して Workflow に
  **一括で渡す**。人為 chunk 分割はしない (**上限撤廃**)。
- controller は同時 agent 数の上限を意識しない。runtime が dispatch 順に発火し、空きが出るまで
  超過分を待たせる (キューイング) ため、controller 側で chunk 化・待ち合わせを実装する必要はない。

旧版にあった `EFFECTIVE_MAX_PARALLEL ≤ CONTROLLER_CHUNK_BUDGET(16)` の比較分岐・chunk loop・
Monitor 待ち合わせは **すべて廃止**。controller は partition 済みの object を Workflow args に渡すだけ。

---

## serialization (controller が dispatch 順序で強制)

直列化 (serialization) は **controller が `serial_chains` (dispatch 順序) で強制する**。
prompt hint に依存しない。

- controller は Stage2 競合検出 (discover 戻り値の `files_likely_to_modify` で実施 = barrier) の結果から、
  競合する cluster を `serial_chains` に、独立な cluster を `parallel_clusters` に partition する。
- Workflow runtime は `parallel_clusters` を並列発火 (上限は runtime が透過制御)、`serial_chains` の
  各 chain を逐次 await する (前 cluster の完了後に次を起動)。
- 直列化を「prompt 内のヒント文」で expert に依頼する旧来手法は採らない。partition 構造 (args) で
  機械的に強制する。

---

## フェーズ別の partition 適用先

各フェーズで partition / dispatch する対象が異なる。

| フェーズ | dispatch 対象 | 実行機構 |
|---------|--------------|---------|
| 2-A (探知) | clusters (approved_clusters) | `op-run-discover` Workflow |
| 2-C (修正) | clusters (stage2_approved_clusters) を `parallel_clusters` / `serial_chains` に partition | `ClusterOrchestrator` (Agent tool、ADR-0016) |
| 3.5 (post-check) | PRs (post-check 対象) | `ClusterOrchestrator` (Agent tool、directives.md フェーズ5.5) |
| 4 (global review) | PRs (review 対象) | `ClusterOrchestrator` (Agent tool、directives.md フェーズ6) |

探知 (`op-run-discover`) は serialization 不要 (read-only investigation) のため全 cluster を一括で渡す。
serialization が意味を持つのは write を伴う修正フェーズ (ClusterOrchestrator での apply) で、ここでのみ
`parallel_clusters` / `serial_chains` の partition を controller が確定する。

---

## density 観測との関係 (SKILL.md 2-B 側)

density 観測値で `op cluster max-parallel` を再算出する役割は **SKILL.md フェーズ 2-B 側に残る**。

- これは cluster 競合グラフの density を observability として観測するための役割であり、
  dispatch の同時実行上限を強制する装置ではない (上限の強制は runtime の `min(16, cores-2)` に委譲済み)。
- density が高い (cluster 同士が重なる) 場合の意味づけは、**partition (serial_chains への振り分け)** に
  反映される。同時実行数を controller が cap するのではなく、競合 cluster を直列化する形で吸収する。
- 詳細は SKILL.md 2-B / 2-B-density の記述を参照。本ファイルでは再掲しない。

---

## 禁止事項

- controller 側で人為 chunk 分割・chunk loop・chunk budget を実装しない (並列上限は runtime に委譲)。
- Monitor 待ち合わせで chunk 間を区切らない (Workflow の逐次 await が serialization を担う)。
- serialization を prompt hint で expert に依頼しない (`serial_chains` partition で機械的に強制する)。
- density 再算出 (`op cluster max-parallel`) を dispatch 上限の hard cap として扱わない
  (observability 用途。上限強制は runtime、競合吸収は partition)。

---

## 関連

- ADR-0009 Phase C (C1): op-run fan-out の Dynamic Workflows 移行 (本書き換えの根拠)
- `workflows/op-run-discover.js`: 探知 reader 並列 spawn → investigation report 返却 (Stage2 barrier 供給)
- ClusterOrchestrator (Agent tool): apply→verify + post-check + global review の各フェーズを担う (partition 受領側、ADR-0016。`op-run-fanout.js` / `op-run-postcheck.js` / `op-run-review.js` は削除済み)
- SKILL.md フェーズ 2-B / 2-B-density: density 観測値での `op cluster max-parallel` 再算出 (observability)
- `_shared/worktree-ops.md (>=3)`: worktree hard cap / soft warning による多層防御
- Issue #390 (CLOSED): 旧 chunk budget 散乱 10 箇所 → 本ファイル集約 (staged_refactor Stage 1)
- Issue #341 (CLOSED): 旧散乱の発生源 (並列度 default 動的化 + chunk budget 16 + worktree hard cap 32)
