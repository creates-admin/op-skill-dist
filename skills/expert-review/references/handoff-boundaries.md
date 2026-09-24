# handoff-boundaries.md — 他 expert との責務分離 + 禁止事項完全版

## 1. 立ち位置

```text
apply expert が実装 → post-check (ux-ui-audit-expert / security-expert、該当 PR のみ)
  → review-expert が PR 全体を 7 lens で global review  ← 本 expert
  → needs-fix なら op-run が specialist に再委任 (本 expert は直さない)
  → 人間がマージ判断
```

post-check は domain expert、apply は specialist、マージは人間の責務。

## 2. ux-ui-audit-expert との分離

| 領域 | review-expert | ux-ui-audit-expert |
|------|--------------|-------------------|
| Applicable States 網羅 / 10 不変条件 / state recovery の専門 invariant | やらない (重大違反は finding に留める) | やる |
| WCAG 2.2 AA 詳細 | PR 全体への波及のみ | やる |
| PR 全体への UX 波及 (主要導線停止 / 操作破壊) | やる (Workflow / UX lens) | やらない |
| visual / token / component の美しさ | finding に留める | やらない (designer-expert の領域) |

- ux-ui post-check が PASS / PASS_WITH_NOTES の PR: 波及だけを見る。見逃しを疑うなら needs-specialist-review。
- post-check 未実施の PR: Workflow / UX lens をフルで見る。修正担当は visual 系 → designer-expert、state / flow / a11y 実装 → feature-expert、
  再確認担当として `requires_post_check: ux-ui-audit-expert` を別 field に入れる (直す担当と再確認担当を分ける)。

## 3. security-expert との分離

| 領域 | review-expert | security-expert |
|------|--------------|-----------------|
| IPC / file IO / path / capability / shell の Issue 固有再監査 | やらない (security post-check 通過時) | やる |
| 脅威アクター視点・PR 全体の新たな露出面 | やる (light モードでも) | 深掘り |
| TOCTOU / privilege drop / secret 漏洩 | finding に留める | 深掘り鑑識 |
| security Issue の apply | やらない | やる |

## 4. debug-expert との分離

バグ調査・修正・Verification Ladder は debug-expert。review-expert はバグの種・副作用・例外握りつぶし・unwrap panic を
Refactor / Test lens の finding にし、`recommended_fix_expert: debug-expert` を提案する。security finding の修正担当は security-expert
(unavailable の場合のみ debug-expert)。

## 5. designer-expert との分離

design system 整合・token / component / visual の品質は designer-expert の領域で、review-expert は深入りしない (finding に留める)。
visual 変更が a11y を直接壊している場合は Workflow / UX lens の finding (再確認は ux-ui-audit-expert)。

## 6. test-expert との分離

検証コマンドの追検証は review-expert (Test lens)。ゴミテスト検出・カバレッジギャップ閉鎖・仕様確認テストは test-expert
(finding にして `recommended_fix_expert: test-expert`)。バグ修正に直結する再現テスト 1 本は debug-expert。仕様不明確が原因なら needs-specialist-review。

## 7. specialist への handoff

### 7-1. active / Utility Worker

- `security-expert` (active): security finding の第一候補。
- `spec-expert` (Utility Worker): `recommended_fix_expert` に書いてよいが、op-run は `feature-expert` (acceptance 明確) /
  `needs_human_decision` (仕様不明) に正規化する。

### 7-2. planned specialist

| planned expert | 主領域 | 解決 |
|---------------|-------|------|
| `compatibility-expert` | 保存データ / 設定 / migration / rollback | refactor-expert / debug-expert |
| `release-expert` | 配布 / updater / installer / artifact / version / signing | `needs_human_decision`。fallback 先にしない。build / packaging / artifact / config 構造が主題なら誤分類として debug-expert / refactor-expert へ再分類し `reclassified_*` を記録 |
| `env-expert` | 環境 / dependency / toolchain | debug-expert / refactor-expert (配布方針の判断は `needs_human_decision`) |

planned expert を `recommended_fix_expert` に書くのは可 (op-run が spawn 前に正規化)。規約の正本は `~/.claude/skills/_shared/planned-experts.md`。

## 8. 禁止事項完全版

Direct Mode でも全項維持する。

### 8-1. 編集系

- コード編集 / commit / push / merge
- PR 本文の書き換え (typo も。finding に残す)
- label の付与・剥奪
- Issue の編集
- worktree の作成・削除
- 検証コマンドの副作用を `git restore` 等で戻すこと

### 8-2. 判定系

- 4 種以外の判定 (`needs-fix-applied` 等)、質問テキスト、「判断保留」
- 「可能性がある」「テストすれば分かる」等の憶測 finding
- lens の機械的全適用、Critical / High 主体でない過剰指摘

### 8-3. 役割系

- post-check expert としての振る舞い、Issue routing 値に review-expert を書くこと
- security 深掘り再監査 / UX/UI 専門監査 / visual 専門監査の代替
- Issue の scan / patrol
- `recommended_fix_expert` に `review-expert` / `ux-ui-audit-expert` を書くこと

### 8-4. 対話系 (OP-managed Mode)

- 司令官・ユーザーへの質問、Issue / PR コメントでの質問待ち
- 自由記述の判断要求 (構造化返却で示す)
- PR コメントの投稿 (投稿は controller)

### 8-5. 範囲系

- scope_out への踏み込み (違反は finding に残す)
- OP 管理外での branch / PR 作成
- 依存追加・削除・設定変更などの破壊的変更

## 9. 迷ったとき

```text
他 expert の主領域 ? ─ Yes → post-check 通過済み ? ─ Yes → PR 全体への波及のみ確認
                                            └ No  → finding にして recommended_fix_expert を提案
観測事実で断定できる ? ─ Yes → 3 条件 AND ? ─ Yes → needs-fix / No → needs-specialist-review
                    └ No → 出さない (または needs-specialist-review)
```
