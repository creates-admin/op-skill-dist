# lens-catalog.md — 7 lens 観点カタログ

lens は判断材料であり機械的に全適用しない。観測事実で Critical / High と判定できる finding だけを残す。

| # | Lens (payload の `lens` 値) | 主な観点 | 深掘り担当 |
|---|------|---------|-----------|
| 1 | Security / Abuse | 入力検証・認可・IO・IPC・shell・path・capability・不正利用 | security-expert |
| 2 | Workflow / UX | 画面遷移・状態復帰・操作破壊・a11y 波及 | ux-ui-audit-expert |
| 3 | Test | 回帰検証不足・既存テストへの影響・検証申告の真偽 | test-expert |
| 4 | Compatibility | 保存データ・設定・migration・rollback・API 互換 | compatibility-expert (planned) |
| 5 | Release | 配布・updater・installer・artifact・version | release-expert (planned) |
| 6 | Spec | Issue 要求・acceptance criteria・scope 逸脱・過剰実装・PR 本文整合 | spec-expert (Utility Worker) |
| 7 | Refactor | 構造劣化・過剰抽象化・命名・配置・バグの種 | refactor-expert |

`active_lens_keys` のキーは `security` / `workflow-ux` / `test-regression` / `compatibility` / `release` / `spec` / `refactor-maintainability`。
post-check と重なる lens (1, 2) は、post-check 通過済みなら Issue 固有の再監査をせず PR 全体への波及だけを見る。

## 1. Security / Abuse

観点:
- 入力検証: path canonicalization / encoding / size limit / null byte / `..` 拒否 / Unicode 正規化
- 認可 / capability: IPC command の権限境界 / shell 引数の escape / file IO の root 制限 / Tauri capability 追加の妥当性
- IO / IPC: `std::fs` / `tokio::fs` / Tauri invoke の境界 / WebView ↔ Rust 間 payload 検証
- エラーパス: TOCTOU / privilege drop 漏れ / error message への path・token・secret 漏洩
- 脅威アクター視点で「この PR で新たに増えた露出面」

典型 finding: 新規 file IO の canonicalization 漏れ / `Command::new("sh")` への未 escape 入力 / capability より広い IPC 権限 /
error 出力への絶対 path・token 漏洩 / updater の signature 検証スキップ / ユーザー入力経路の `unwrap()` panic / 機密データの平文保存。

`light-after-security-postcheck` でも次は見る: post-check の対象外だった範囲の新たな露出面、post-check 後に積まれた commit。

## 2. Workflow / UX

観点: 主要導線の破壊・dead-end・ループ / error からリロード以外で復帰できるか・draft 保持 / 既存ナビゲーション・ショートカット・
フォーム送信の破壊 / focus・contrast・keyboard・screen reader が PR で退化していないか。Issue にデザインモックがあれば見た目の目標と照合する。

典型 finding: button が押せない・link が消えた / error 後に復帰不能 / 確認なしの破壊操作 / `outline: none` 等で focus 消失 / 既存 a11y 対応の削除。

review state の `post_checks["ux-ui-audit-expert"]` が PASS / PASS_WITH_NOTES なら、Applicable States 網羅・WCAG 詳細は重複監査しない。

## 3. Test

観点:
- 変更に対するテストの追加 / 既存テストの skip・xfail・削除の正当性
- PR 本文の verification_steps が diff の変更範囲と一致するか
- Static 検証 (`cargo fmt --check` / `clippy` 等) が実際に pass するか。「Static: pass」の自己申告を鵜呑みにしない
  (clippy pass と fmt fail は両立する)。コマンドは `~/.claude/skills/_shared/project-profile.md`
- テストのゴミ化 (snapshot の無意味な更新 / `expect(true).toBe(true)` 等)

典型 finding: バグ修正に再現テストがない / 新機能に正常系テストがない / 理由なき skip・xfail 化 / Rust 変更に `cargo test` の証跡なし /
fmt --check 未実行。

## 4. Compatibility

観点: 設定ファイル・DB schema・cache・永続化フォーマットの互換 / forward migration・rollback / 設定の破壊的変更・既定値変更・env var 必須化 /
公開 API・IPC contract・on-disk format の互換。

典型 finding: schema 変更に migration がない / config key rename に migration がない / updater 後に rollback 不能 /
format version の bump なしの互換破壊 / IPC breaking change に version bump がない。

## 5. Release

観点: installer / package / artifact 構成 / updater の経路・signature・rollback / 配布物の依存・asset・config /
version 表記の整合 (Cargo.toml / package.json / pubspec.yaml / installer)。

典型 finding: asset の同梱漏れ / updater の URL pattern 未追従 / version bump 漏れ・不整合 / artifact 構成と CI / release pipeline の不整合。

## 6. Spec

観点: Issue 要求の充足 / acceptance criteria / scope_out への越境・scope_in の漏れ / 要求外の追加実装 / PR 本文と diff の一致。

典型 finding: acceptance criteria の一部未実装 / scope_out のファイル変更 / 要求外の大規模 refactor 混入 /
PR 本文に書かれた変更が diff にない / PR タイトルの規則違反 (`feat:` / `fix:` 等の prefix)。

## 7. Refactor

観点: 対象 repo の既定ネスト上限 (repo の CLAUDE.md 定義。なければ 2 階層) 超過 / 関数 100 行超 / 責務混線 /
過剰抽象化 (1 関数 1 ファイル・不要な interface / generic) / 命名・配置の不統一 / 暗黙の副作用・非対称な dispose。

典型 finding: ネスト上限超過 / 同責務の重複 (3 箇所以上) / 既存規則と異なる命名 / 層が増えただけの抽象化。

CLAUDE.md の規約 (ネスト上限 / コメントポリシー / フォルダ階層 / アンチパターン) は本 lens の絶対基準。

## severity の目安

| Lens | Critical | High |
|------|---------|------|
| Security / Abuse | 露出面拡大 / 認可破壊 / 機密漏洩 | 入力検証漏れ / capability 過剰 / IPC 検証欠如 |
| Workflow / UX | 主要導線の完全停止 / 復帰不能 | 操作破壊 / a11y 退化 |
| Test | bug fix のリグレッションテスト欠如 | 検証コマンド漏れ / silenced failure |
| Compatibility | rollback 不能 / 既存データ破壊 | migration 欠如 / version bump 漏れ |
| Release | installer の致命的破壊 | version 不整合 / artifact 漏れ |
| Spec | scope_out の重大越境 / acceptance criteria の重大未達 | 過剰実装 / PR 本文と diff の不一致 |
| Refactor | バグの種 (副作用 / dispose 漏れ) | ネスト超過 / 命名不統一 |

基準は `~/.claude/skills/_shared/severity-rubric.md`。Medium 以下は原則出さない。Spec / Refactor lens で PR の品質要件未充足を伴うものは Medium でも残してよい。

## recommended_fix_expert の提案

提案であり、最終決定は op-run の判定優先順位 1-8 (op-run skill の review-fix-loop §4.5-2)。

| Lens | recommended_fix_expert | requires_post_check | 条件付きの第二候補 |
|------|----------------------|--------------------|-------------------|
| Security / Abuse | security-expert | security-expert | debug-expert (security-expert が unavailable の場合のみ) |
| Workflow / UX (state / recovery / flow / a11y 実装) | feature-expert | ux-ui-audit-expert | designer-expert (token / visual の同時修正が混じる場合) |
| Workflow / UX (visual / component / token / layout) | designer-expert | ux-ui-audit-expert | — |
| Test | test-expert | null | 仕様不明確なら needs-specialist-review |
| Compatibility | compatibility-expert (planned) | null | debug-expert / refactor-expert |
| Release | release-expert (planned) | null | 方針判断は `needs_human_decision`。build / packaging / artifact / config 構造が主題なら誤分類として debug-expert / refactor-expert へ再分類 (`handoff-boundaries.md` §7-2) |
| Spec | spec-expert (Utility Worker) | null | feature-expert |
| Refactor | refactor-expert | null | debug-expert (バグの種) |

- `review-expert` / `ux-ui-audit-expert` は指定しない。UX/UI の修正は visual 系なら designer-expert、state / flow / a11y 実装なら feature-expert。
- planned expert・`spec-expert` は op-run が spawn 前に正規化する (`~/.claude/skills/_shared/planned-experts.md` / `active-expert-registry.md`)。
