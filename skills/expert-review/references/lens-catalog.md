# lens-catalog.md — 7 lens 観点カタログ

<!--
機能概要: review-expert が PR を横断 review する際の 7 lens 観点表と、各 lens の典型 finding 例。
作成意図: 観点を覚えやすく整理し、apply 担当の意図に引きずられず網羅的に PR を見る助けにする。
         各 lens は判断材料であり、機械的に全適用しない。観測事実に基づいて Critical / High と
         判定できる finding だけを残す。
注意点: 観点本体はここに集約。判定軸 (approve / needs-fix / needs-specialist-review / blocked) は
       result-decision.md、出力 schema は finding-schema.md。本ファイルに重複保持しない。
-->

## 全体像 (7 lens)

review-expert は PR 全体を以下 7 lens で横断 review する。
review_mode (`full` / `light-after-security-postcheck`) に応じて Security/Abuse Lens の重みを切り替える。

| # | Lens | 主な観点 | 主担当 expert (post-check / specialist) |
|---|------|---------|---------------------------------------|
| 1 | Security / Abuse | 入力検証・認可・IO・IPC・shell・path・capability・悪用可能性 | security-expert (深掘り再監査) |
| 2 | Workflow / UX | 画面遷移・状態復帰・操作破壊・a11y 波及 | ux-ui-audit-expert (専門 a11y / 状態網羅) |
| 3 | Test / Regression | 変更に対する回帰検証不足・既存テストへの影響 | test-expert (カバレッジ全般) |
| 4 | Compatibility | 保存データ・設定・migration・rollback リスク | compatibility-expert (planned) |
| 5 | Release | 配布・updater・installer・artifact・version 影響 | release-expert (planned) |
| 6 | Spec | Issue 要求・acceptance criteria・scope_in / scope_out 逸脱・過剰実装 | spec-expert (Utility Worker) |
| 7 | Refactor / Maintainability | 構造劣化・過剰抽象化・命名・配置・バグの種 | refactor-expert |

post-check と responsibility が重なる lens (1, 2) は、**post-check 通過後は重複監査しない**。
review_mode が `light-after-security-postcheck` のときは Security/Abuse Lens を軽くする。

---

## 1. Security / Abuse Lens

### 主な観点

- **入力検証**: path canonicalization / encoding / size limit / null byte / `..` rejection / Unicode 正規化
- **認可 / capability**: IPC command の権限境界 / shell 引数の escape / file IO の root 制限 / Tauri capability 追加の妥当性
- **IO / IPC**: `std::fs` / `tokio::fs` / Tauri invoke の境界 / WebView ↔ Rust 間の payload 検証
- **エラーパス**: TOCTOU / privilege drop の漏れ / 失敗時の機密情報漏洩 (error message に path / token / secret が出ていないか)
- **悪用可能性**: 攻撃者視点で「この PR で新たに増えた攻撃面」を想像する

### 典型 finding 例

- 新規 file IO に path canonicalization 漏れ
- `Command::new("sh")` 等で escape されていない user input
- IPC command の権限境界が capability より広い
- error 出力に絶対 path / 認証 token が漏れる
- updater payload の signature 検証スキップ
- `unwrap()` / `expect()` がユーザー入力経路で panic 化
- migration 経路で機密データが平文保存される

### review_mode による重み切り替え

| review_mode | Security/Abuse Lens の扱い |
|-------------|---------------------------|
| `full` | 通常通り、フル監査 (上記すべての観点) |
| `light-after-security-postcheck` | **「PR 全体として新たな攻撃面が増えていないか」のみ軽く**。3.5-B で security-expert が完了済みのため、IPC / file IO / path / capability / shell の Issue 固有再監査は再実行しない |

`light-after-security-postcheck` でも以下は監査対象に残す:
- 3.5-B post-check の対象外だった範囲に新たな攻撃面が増えていないか
- post-check 後に積まれた commit (stale post-check) がないか

### bulk_group 例 (review-expert が推奨する specialist 向け)

| bulk_group | 内容 |
|-----------|------|
| `security:path-traversal-in-export` | file IO の path 検証漏れが散在 |
| `security:unsafe-shell-args` | shell 引数 escape 漏れが散在 |
| `security:capability-overreach` | capability が必要以上に広い |
| `security:error-leak` | error 出力に機密情報が漏れる |

---

## 2. Workflow / UX Lens

### 主な観点

- **画面遷移**: 主要導線が壊れていないか / dead-end / ループに陥らないか
- **状態復帰**: error / failure からリロード以外の手段で復帰できるか / draft 保持
- **操作破壊**: 既存ナビゲーション / ショートカット / フォーム送信フローを壊していないか
- **a11y 波及**: focus / contrast / keyboard / screen reader が **PR で退化していないか** (専門深掘りは ux-ui-audit-expert が 3.5-A で完了済み前提)

### 典型 finding 例

- 主要導線が PR で塞がれた (button が押せない / link が消えた)
- error 後に画面が完全停止しリロード以外で復帰不能
- 確認なしの破壊操作 (削除 / 上書き / 不可逆な状態変更)
- focus が PR で見えなくなった (`outline: none` 等)
- 既存 a11y 対応が誤って削除された

### 3.5-A 通過 PR での扱い

`<!-- op-ux-ui-audit -->` で `audit_result: PASS` または `PASS_WITH_NOTES` が記録されていれば、
ux-ui-audit-expert が UX/UI 専門観点で audit 済み。本 lens は **PR 全体への波及**のみ確認する。

「使いやすさ専門観点 (Applicable States 網羅 / 10 不変条件等)」は ux-ui-audit-expert の主領域。
review-expert は重複監査しない。

---

## 3. Test / Regression Lens

### 主な観点

- **回帰検証不足**: 変更に対するテストが追加されているか / 既存テスト失敗を黙らせていないか
- **既存テストへの影響**: skip / xfail / 削除されたテストの正当性
- **検証コマンド充足**: PR 本文に記録された verification_steps が diff の変更範囲と一致するか
- **Static 検証の実施**: apply PR では `cargo fmt --check` / `clippy` 等の Static 検証が
  **実際に pass しているか追検証する**。PR 本文の「Static: pass」自己申告を鵜呑みにしない。
  `cargo clippy` は line-width / import 整形を見ないため、clippy pass と fmt fail は両立する。
  実際のコマンドは `skills/_shared/project-profile.md` が正本 (スタック別)。
- **テストの質**: テストがゴミテスト化していないか (snapshot 自動更新 / `expect(true).toBe(true)` 等)

### 典型 finding 例

- バグ修正に再現テストがない
- 新機能に正常系テストがない
- 既存テストが skip / xfail に書き換えられた (理由なし)
- diff に Rust 変更があるが `cargo test` の証跡なし
- snapshot テストが意味なく更新されている
- `cargo fmt --check` skip (PR 本文に「Static: pass」と記載があるが fmt --check 未実行、CI fail で発覚)

### bulk_group 例

| bulk_group | 内容 |
|-----------|------|
| `test:missing-regression` | リグレッションテスト欠如 |
| `test:silenced-failures` | テストが skip / xfail で黙らされた |
| `test:verification-mismatch` | diff の変更範囲と verification 記録の不一致 |
| `test:static-check-skipped` | fmt --check / clippy 等の Static 検証が未実行 (自己申告 pass と乖離) |

---

## 4. Compatibility Lens

### 主な観点

- **保存データ**: 設定ファイル / DB schema / cache / 永続化フォーマットの互換性
- **migration**: forward migration / backward rollback / 旧バージョンとの相互運用性
- **設定**: 設定ファイルの破壊的変更 / 既定値の変更 / env var の必須化
- **API 互換性**: 公開 API / IPC contract / file format / on-disk format の互換性

### 典型 finding 例

- DB schema 変更に migration がない
- 設定ファイルの key rename が migration なしで導入された
- updater 適用後に旧バージョンへの rollback ができない
- 永続化フォーマットの互換性が壊れた (format version の bump がない / migration 経路が不明)
- IPC contract の breaking change が IPC version を bump せずに入った

### bulk_group 例

| bulk_group | 内容 |
|-----------|------|
| `compat:missing-migration` | schema / config 変更に migration なし |
| `compat:rollback-broken` | rollback 経路が壊れている |

---

## 5. Release Lens

### 主な観点

- **配布**: installer / package / artifact 構成への影響
- **updater**: 自動更新の経路 / signature 検証 / rollback 経路
- **artifact**: 配布物に含まれる依存・asset・config の変更
- **version**: semver / version 表記の整合性 / cargo / npm / pubspec / installer の version bump

### 典型 finding 例

- installer に含めるべき asset が漏れた
- updater が新 binary を取得できない (URL pattern 変更未追従)
- version bump 漏れ (Cargo.toml / package.json / pubspec.yaml の不整合)
- artifact 構成変更が CI / release pipeline と不整合

### bulk_group 例

| bulk_group | 内容 |
|-----------|------|
| `release:version-mismatch` | version 表記が不整合 |
| `release:asset-missing` | 配布物に必要 asset が漏れ |

---

## 6. Spec Lens

### 主な観点

- **Issue 要求充足**: PR が Issue の要求をすべて実装したか
- **acceptance criteria**: success_criteria を実装が満たすか
- **scope_in / scope_out**: scope_out への侵入がないか / scope_in の漏れがないか
- **過剰実装**: Issue が要求していない機能を勝手に追加していないか
- **PR 本文整合**: PR 本文の記述と diff が一致するか

### 典型 finding 例

- Issue が要求した acceptance criteria の一部が実装されていない
- Issue scope_out に明記されたファイルへの変更
- Issue が要求していない大規模 refactor が混入
- PR 本文に「○○を実装」と書かれているが diff に該当変更がない
- PR タイトルが規則違反 (`feat:` / `fix:` 等の prefix が ない / 命名規約違反)

### bulk_group 例

| bulk_group | 内容 |
|-----------|------|
| `spec:scope-out-violation` | scope_out への侵入 |
| `spec:over-implementation` | Issue 要求外の追加実装 |
| `spec:pr-body-mismatch` | PR 本文と diff の不一致 |

---

## 7. Refactor / Maintainability Lens

### 主な観点

- **構造劣化**: ネスト 3 階層超過 / 関数 100 行超過 / 責務混線
- **過剰抽象化**: 1 関数 1 ファイル / interface / impl 形式分離 / 不要な generic
- **命名・配置**: 一貫性のない命名 / 既存ディレクトリ規則からの逸脱
- **バグの種**: 暗黙の副作用 / 非対称な dispose / 後で踏みやすい罠

### 典型 finding 例

- ネストが CLAUDE.md 規約 (if 3 階層 / for 2 階層) を超過
- 同じ責務のコードが 3 箇所に散在 (DRY 違反)
- 既存命名規則と異なる命名で導入された (例: snake_case / camelCase 混在)
- 不要な抽象化が複雑性を増した (層が増えただけで価値がない)

### CLAUDE.md 規約との関係

CLAUDE.md (user's global directives) は本 lens の **絶対基準**として扱う。
ネスト上限 / コメントポリシー / フォルダ階層 / アンチパターンに違反する diff は finding 対象。

### bulk_group 例

| bulk_group | 内容 |
|-----------|------|
| `refactor:nest-over-limit` | ネスト上限超過 |
| `refactor:duplicate-logic` | 同責務の重複 |
| `refactor:naming-inconsistency` | 命名不統一 |

---

## lens 別 severity の目安

| Lens | Critical | High | Medium / Low |
|------|---------|------|-------------|
| Security / Abuse | 攻撃面拡大 / 認可破壊 / 機密漏洩 | 入力検証漏れ / capability 過剰 / IPC 検証欠如 | 通常 finding に出さない |
| Workflow / UX | 主要導線完全停止 / 復帰不能 | 操作破壊 / a11y 退化 (focus 削除等) | 通常 finding に出さない |
| Test / Regression | リグレッションテスト欠如 (bug fix で) | 検証コマンド漏れ / silenced failure | 通常 finding に出さない |
| Compatibility | rollback 不能 / 既存データ破壊 | migration 欠如 / version bump 漏れ | 通常 finding に出さない |
| Release | installer 致命的破壊 | version 不整合 / artifact 漏れ | 通常 finding に出さない |
| Spec | scope_out 重大侵入 / acceptance criteria 重大未達 | 過剰実装 / PR 本文 vs diff 不一致 | 軽微な記述ズレは Notes |
| Refactor | バグの種 (副作用 / dispose 漏れ等) | ネスト超過 / 命名不統一 | 軽微な好みは finding に出さない |

severity は `~/.claude/skills/_shared/severity-rubric.md` に従う。
review-expert は **Critical / High 主体** で finding を出し、Medium 以下のノイズは出さない。
ただし Spec / Refactor lens で「PR の品質要件未充足」を伴うものは Medium でも残してよい (PR 本文の体裁等)。

---

## 司令官 (op-run) への提案 — 同 lens 内 specialist の推奨

review-expert は finding ごとに `recommended_fix_expert` を提案する (op-run の判定優先順位 1-8 で最終決定)。

| Lens | 第一候補 (apply = recommended_fix_expert) | requires_post_check | 第二候補 (条件) |
|------|----------------------------------------|--------------------|---------------|
| Security / Abuse | security-expert (active) | security-expert | debug-expert (security-expert が unavailable な場合のみ fallback) |
| Workflow / UX (state / recovery / flow / a11y 実装) | feature-expert | ux-ui-audit-expert | designer-expert (token / visual の同時修正が混じる場合) |
| Workflow / UX (visual / component / design token / layout pattern) | designer-expert | ux-ui-audit-expert | — |
| Test / Regression | test-expert | null | spec-expert (仕様不明確時は spec-expert へ先) |
| Compatibility | compatibility-expert (planned) | null | debug-expert / refactor-expert (fallback) |
| Release | release-expert (planned) | null | release / installer / distribution 方針判断は `needs_human_decision`。build / packaging failure / artifact / config 構造整理が主題の場合のみ debug-expert / refactor-expert に **誤分類の再分類** (release-expert を経路に残す fallback は禁止) |
| Spec | spec-expert (Utility Worker) | null | feature-expert (実装観点) |
| Refactor / Maintainability | refactor-expert | null | debug-expert (バグの種なら) |

**`recommended_fix_expert` には `ux-ui-audit-expert` / `review-expert` を指定しない**。
- `ux-ui-audit-expert`: 検出 + post-check 専任、apply を持たない。UX/UI 系の apply 担当は visual / component / token / layout pattern なら `designer-expert`、state / recovery / flow / a11y 実装なら `feature-expert`。再確認担当として `requires_post_check: ux-ui-audit-expert` を別フィールドで指定する。
- `review-expert`: 監査専任 (self-review 禁止)。

- **active expert**: `security-expert` は Phase 2 で実装済み。security domain finding は第一候補として `security-expert` を提案する
- **planned expert** (`compatibility-expert` / `release-expert` / `env-expert`) は実装後に有効。planned 期間中は op-run が spawn 前に正規化する。
  - `compatibility-expert` / `env-expert` は active fallback (`debug-expert` / `refactor-expert`) または `needs_human_decision` に置き換える
- **Utility Worker** (`spec-expert`) は active だが op-run routing 対象外 (op-spec 専用 worker)。recommended_fix に現れても op-run は spawn 前に `feature-expert` (acceptance 明確) / `needs_human_decision` (仕様不明) に正規化する (`op-run-expert: spec-expert → feature-expert`)。
  - `release-expert` は **fallback destination として扱わない**。release / installer / updater / distribution / signing / versioning 方針判断は `needs_human_decision`。build / packaging failure / artifact / config 構造整理が主題なら release-expert の fallback ではなく **誤分類の再分類** として `debug-expert` / `refactor-expert` に付け直す
  - canonical な正規化ルールは `~/.claude/skills/_shared/expert-spawn.md` の Planned Expert Notice を参照

`recommended_fix_expert` はあくまで提案。op-run が以下の優先順位で最終決定する。

```text
1. Issue / PR の scope_in / scope_out
2. 変更ファイルのドメイン
3. finding の lens
4. failure mode / 失敗種別
5. required post-check
6. review-expert の recommended_fix_expert (参考)
7. ownership / 直前に修正した expert
8. 不明なら needs-specialist-review または blocked
```
