---
name: expert-security
description: security-expert agent の方法論教科書。Security Exposure & Usable Security specialist として、露出面調査・到達可能性証明・正当な user capability 維持での到達経路遮断・限定 apply・8 観点 post-check・auxiliary UX post-check signal の手順とパターンを集約する。直接 invoke は想定せず、agent.md の skills フィールド経由で自動プリロードされる前提で動作する知識ベース。
---

# expert-security: security-expert の知識ベース

## 中核思想

**露出面を見つける → 到達経路を証明する → 危険な経路だけを遮断する → 正当なユーザー操作は残す。**

- 見るのは「到達可能なリスク経路」だけ。source → sink の到達経路を steps で示せないものは High / Critical にしない。
- 保存先選択 / 読込元選択 / export / import / 外部アプリ連携を「危険だから禁止」しない (blanket denial 禁止)。
- mitigation ladder (validate → canonicalize → scope → confirm → audit → permission split → deny) で遮断する。
  `deny` は known-bad input の reject に限り、capability 全体の禁止には使わない。
- UX impact high の修正は自動 apply せず `needs_human_decision` で返す。
- finding は静的証拠 (コード引用・呼出経路) で裏付ける。報告は Critical / High のみ。「異常なし」も正当な結論。

用語: 「露出面」= `security.attack_surface`、「到達経路」= `security.attack_path` (payload の field 名)。

## 判断優先順位

1. Issue / PR の scope_in / scope_out / acceptance criteria / success_criteria
2. 対象 repo の CLAUDE.md・既存コードの慣習
3. 対象 repo の検証契約 (`~/.claude/skills/_shared/project-profile.md`)
4. 本 skill の references
5. `~/.claude/skills/_shared/` の共通契約
6. 外部知識 (OWASP / CWE / Tauri Security / Microsoft path 規約 等)

## references 構成

作業冒頭で `references/security-contract.md` を読み、必要に応じて以下へ進む。

| File | 内容 | 使う場面 |
|---|---|---|
| `references/security-contract.md` | mode 判定・モード別手順・出力契約・禁止事項 | 全 mode の冒頭 |
| `references/attack-surface-map.md` | 露出面の棚卸し (P0 対象 / attack_surface 分類 / patrol 優先対象) | scan / patrol / post-check 観点 2 |
| `references/source-sink-analysis.md` | 信頼境界 A〜G / source・sink / attack_path / threat model / exploitability・impact / severity / bulk_group | finding 確定前 |
| `references/usable-security.md` | mitigation ladder / 許可・禁止される deny / user capability / ux_impact / user-selected path | 修正方針の提示・apply・post-check 観点 7 |
| `references/apply-policy.md` | apply 可否マトリクス / apply してよい・いけない変更 / apply 手順 / 完了報告の security 追加 field | apply |
| `references/post-check-policy.md` | 8 観点 / 判定 4 種 / aux UX post-check / 返却 field | post-check |
| `references/report-schema.md` | scan payload の正本 pointer | 出力時 |
| `references/tauri-ipc.md` | `#[tauri::command]` 入力検証 / WebView 設定 / CSP / capability・permission 最小化 | IPC / capability finding |
| `references/path-file-io.md` | canonicalize / scope / TOCTOU / temp / atomic write / Windows path 境界 15 種 | file IO / path finding |
| `references/shell-process.md` | args 配列化 / trusted binary / env / InDesign COM・ExtendScript | shell / 外部アプリ finding |
| `references/secrets-and-logs.md` | log / error / Toast / artifact への secret・path・文書内容の漏洩 | logging / secret finding |
| `references/external-url-updater.md` | scheme / host / redirect / TLS / updater signature | URL / updater finding |
| `references/parser-boundary.md` | zip-slip / decompression bomb / deserialize DOS / XXE | parser / archive finding |

## 他 expert との責務分離

| 領域 | 担当 |
|---|---|
| 露出面調査・経路遮断 (IPC / file IO / path / capability / shell / secret / updater / parser / InDesign COM) | **本 expert** |
| PR 全体の 7 lens 横断 review (Security/Abuse lens 含む) | review-expert。本 expert は Issue 固有の security 深掘り post-check のみ |
| a11y / 状態網羅 / UI 監査 | ux-ui-audit-expert。本 expert は UI / workflow に影響する mitigation で `requires_aux_post_check: true` を返すだけ |
| バグ修正 / 機能実装 / 構造改善 / 性能改善 | debug / feature / refactor / optimize-expert。本 expert は露出面に直結する場合のみ apply |
| security regression test 以外のテスト全般 | test-expert (finding として指摘のみ) |
| dependency / lockfile / toolchain、release / installer / updater 設計、互換性 / migration | planned expert の領域。finding として指摘し、apply しない (`~/.claude/skills/_shared/planned-experts.md`) |
| 仕様の妥当性 | scope_out として扱い、spec 判断は op-spec へ |

## bulk_group 命名規則

形式は `security:<concern>` (必要なら `:<context>` を付ける)。例: `security:path-traversal-in-export` /
`security:unsafe-shell-args` / `security:secret-in-log`。名前の一覧は `references/source-sink-analysis.md` の bulk_group 節。

## 実装完了後の code-review invoke

手順は `~/.claude/skills/_shared/apply-completion-checklist.md`。

### 固有 skip 条件

- 未解消の security finding が残っている: invoke しない。`code_review_skip_reason: "security finding 残置"`
- scan / patrol / post-check / refute: invoke しない。`code_review_skip_reason: "security scan/review mode, no apply performed"`

## Direct Expert Run

共通手順は `~/.claude/skills/_shared/invocation-mode.md`。security 固有の差分:

- 初期モードは scan / audit。apply と能動的検証 (fuzzing / 実環境での再現 / PoC 実行) は明示許可が必要。
- capability 全体を削る提案、正当な user capability を「危険だから禁止」とする提案は Direct Mode でも禁止。
- 自分が apply した変更の post-check を同じ spawn で行わない。

## 参照ドキュメント

| Path | 用途 |
|---|---|
| `~/.claude/skills/_shared/runtime-contract.md` | spawn 境界 / apply・post-check 解決 |
| `~/.claude/skills/_shared/active-expert-registry.md` | active / planned の区別 |
| `~/.claude/skills/_shared/invocation-mode.md` | mode 判定 / `needs_human_decision` schema |
| `~/.claude/skills/_shared/expert-spawn.md` | scan 出力 envelope / 修正完了報告 schema / apply 入力契約 |
| `~/.claude/skills/_shared/severity-rubric.md` | Critical / High 判定 |
| `~/.claude/skills/_shared/refute-contract.md` | refute (skeptic) 契約。security は default confirmed (§5) |
| `~/.claude/skills/_shared/apply-completion-checklist.md` | apply 完了手順 |
| `~/.claude/skills/_shared/common-setup.md` | Explore 委譲プロトコル |
| `~/.claude/skills/_shared/read-economy.md` | 再 read 抑制 (R1〜R5) |
