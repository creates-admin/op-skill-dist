# Report Schema — scan / apply の出力フォーマット (pointer)

<!--
機能概要: optimize-expert の scan finding / apply 完了報告のスキーマ pointer + optimize 固有の
         semantic notes。
作成意図: ADR-0008 (payload 軸) M1 PoC により、scan finding (scan-finding) / apply report
         (apply-report) の正本は op-core::payload の Rust types へ移管済。本ファイルは
         templates/scan-finding.schema.json / templates/apply-report.schema.json (既に pointer 化済)
         と同じ正本を指す prose 側の pointer とし、二重正本による自己矛盾を解消する。
注意点: optimize は scan-finding / apply-report の Rust types 自体が「canonical 共通 + optimize 拡張」
       を統合した struct (security_finding.rs と異なり独立 domain 拡張ファイルを持たない) ため、
       optimize 固有の field は下記「optimize 固有の semantic notes」に列挙するのみで、
       値そのものの正本は常に op-core 側。ここでの再定義は禁止。
-->

## 正本

- **scan finding**: `op-core::payload::scan_finding` (`op-tools/crates/op-core/src/payload/scan_finding.rs`)
- **apply report**: `op-core::payload::apply_report` (`op-tools/crates/op-core/src/payload/apply_report.rs`)

CLI で確認する:

```bash
op help payload scan-finding --json    # 必須/任意 field・enum・shape の self-describe
op help payload apply-report --json
op help payload --list                 # 既知 payload 一覧
```

- 設計判断: [ADR-0008 `op help payload` 軸](../../../op-tools/docs/adr/0008-payload-axis.md)
- 旧 JSON Schema (pointer 化済): `templates/scan-finding.schema.json` / `templates/apply-report.schema.json`
- round-trip fixture (具体例): `op-core/tests/fixtures/payload/scan-finding-example.json` /
  `op-core/tests/fixtures/payload/apply-report-example.json`

## optimize 固有の semantic notes (op-core 正本にも存在するが誤読しやすい点)

- `domain` は `"optimize"` 固定。`evidence_grade` が `direct` 以外で `severity: critical` を付けない。
- `recommendation.steps` の最後の要素に **`## 計測計画`** (baseline コマンド・入力規模・期待改善カテゴリ・
  撤退条件) を必ず含める。
- `bulk_group` は optimize 固有の 8 種から選ぶ: `perf-nested-loop-on2` / `perf-loop-io` /
  `perf-repeated-compile` / `perf-unnecessary-clone` / `perf-unbounded-growth` / `perf-bad-parallelism` /
  `perf-bundle-fullimport` / `perf-tauri-ipc-chatty`。
- `post_check_expert` は原則 `null` (optimize は挙動不変が前提)。値を入れる場合は
  `ux-ui-audit-expert` か `security-expert` のみ。
- `blocking: true` は新規変更が既存 perf debt を悪化させている場合のみ。このとき `blocking_reason` 必須。
- apply report の `baseline` / `after` (measurement) は **benchmark 系拡張** — tool
  (`hyperfine | criterion | flamegraph | lighthouse | bundle-visualizer | devtools | custom`) /
  `build: release` 必須 / `warmup` / `runs` / `mean_ms` / `stddev_ms` を含む。
  `input_size` は `string | array` の両方を許容 (単一規模 vs 規模別配列)。
- `commits_added` / `simplify_invoked` / `verification_executed` / `verification_ladder` は
  `_shared/expert-spawn.md` 共通契約 (v14) の apply report 必須項目。optimize 固有ではないが、
  benchmark 系 field と併記して落とさないこと。
- 統計的有意性判定 (`improvement.significance`: `clear | marginal | none | unstable`) の閾値は
  `references/benchmark-protocol.md` の「統計的有意性の判定」節が正本 (ここでは再定義しない)。
- Markdown 形式の報告 (PR description / Issue コメント用) は `templates/benchmark-report.md` を使う。

## schema 同期の責務 (pointer 化後も継続)

payload schema の変更時は **Rust types 正本を起点**に、以下と同期させる (どれか一方だけ変更してはならない):

- `~/.claude/skills/_shared/expert-spawn.md` の canonical schema 節
- `~/.claude/agents/optimize-expert.md` の必須出力節
- `~/.claude/skills/op-scan/SKILL.md` / `~/.claude/skills/op-patrol/SKILL.md` の optimize 参照節
- `~/.claude/skills/op-run/SKILL.md` の apply report 検証節

> schema 違反 (必須フィールド欠落 / enum 不正値) は scan / apply で immediate fail。

---

## 報告で守るべきこと

1. **数値で語る** — 「速くなった」ではなく「3.0x、ratio >= 3 (clear)」
2. **コマンドを残す** — 後で再現できる
3. **環境を残す** — OS / CPU / version で結果が変わる
4. **stddev を書く** — 平均だけでは判定できない
5. **入力 fixture を明記** — 規模 (small / medium / large) を区別
6. **撤退判断を書く** — 撤退しなかった理由 = clear 改善 + 互換性 OK + リスク許容
7. **残課題を残す** — 関連する別 bottleneck は別 Issue で
