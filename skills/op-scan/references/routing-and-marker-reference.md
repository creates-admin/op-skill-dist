<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 (2026-07-29) — ADR-0029 Wave B1 progressive disclosure: op-scan/SKILL.md 本文から
       Expert Runtime and Routing Metadata Contract / `--domain` の値 / scope 省略時の注意 /
       domain → marker パターン表 を無改変移設した初版 (内容変更なし)。
-->

<!--
機能概要: op-scan の routing / marker lookup 集。scan-time spawn と routing metadata の責務分離契約、
          `--domain` の alias 正規化表、scope 省略 (full-repo) 時のコスト確認 gate、
          domain → marker パターン表 (canonical, op-scan/op-patrol 共通) を集約する。
作成意図: SKILL.md 本文は「毎回・必ず・順序が重要」な主経路のみを保持し (ADR-0029 決定2)、
          参照時にのみ引く lookup / 契約宣言を本ファイルへ分離する。
注意点: 読むタイミングは SKILL.md 本文の pointer に従う — `--domain` 指定時 / scope 省略時 /
        フェーズ1 installed check で planned expert の扱いを判断するとき / フェーズ4 で marker 値の
        補完・妥当性確認が要るとき。詳細契約の正本は従来どおり `skills/_shared/runtime-contract.md` /
        `skills/_shared/markers/labels-and-markers.md` (本ファイルは op-scan 固有の対応 point)。
-->

# op-scan routing / marker reference (Contract + `--domain` + domain→marker 表)

本ファイルは `skills/op-scan/SKILL.md` からの pointer 先 (ADR-0029 Wave B1 分離)。

## Expert Runtime and Routing Metadata Contract

/**
 * 機能概要: op-scan の scan-time spawn と Issue routing metadata の責務分離契約 (pointer のみ)。
 * 作成意図: 「scan で出力した recommended_expert / hidden marker = apply/fix 担当の確定」と
 *           誤読されないように scope を切る。詳細契約は `_shared/runtime-contract.md` を正本とする。
 * 注意点: planned expert を runtime spawn してはならない。op-scan 側でローカル列挙しない。
 */

op-scan の scan-time spawn と Issue routing metadata は責務が分離されている。
詳細契約は `skills/_shared/runtime-contract.md` を正本とする。本節は op-scan
固有の対応 point のみ示す。

- scan-time に runtime spawn 可能な expert は **active expert に限定**する。正本リストは
  `skills/_shared/active-expert-registry.md`
- planned expert (`env-expert` / `release-expert` / `compatibility-expert`) は
  scan-time / apply-time のいずれでも runtime spawn しない (`_shared/planned-experts.md`)。
  Utility Worker (`scout` / `spec-expert`) も op-scan の routing 対象外で scan-time に spawn しない
- Issue 本文に書き出す hidden marker (`op-run-expert` / `op-post-check-expert` ほか) と
  ラベル (`pro-*` / `needs:*` / `severity:*` ほか) は **routing recommendation** であり、
  op-run の apply/fix spawn を authorize しない。op-run は `runtime-contract.md` の
  判定優先順位で実 spawn 先を独立に再解決する
- `review-expert` は op-run フェーズ4 の global review 専任。op-scan は spawn せず、
  routing 値としても指定しない

---

### `--domain` の値

`--domain` には expert 名 (suffix `-expert` を省略してよい) をカンマ区切りで指定する:

```
debug, refactor, optimize, security, ux-ui, design, test, feature
```

alias マッピング:
- `ux` → `ux-ui` (使いやすさ番人、ux-ui-audit-expert を起動)
- `ui` → `ux-ui` (使いやすさ番人、ux-ui-audit-expert を起動)
- `ux-ui-audit` → `ux-ui` (suffix -audit を省略可)
- `designer` → `design` (suffix -er を省略可、designer-expert を起動)
- `theme` / `token` → `design` (designer-expert を起動)

つまり `--domain debug,ui,theme` は `--domain debug,ux-ui,design` と等価。

旧 ui-refactor-expert / ux-audit-expert への参照は op-scan 側で自動的に ux-ui-audit-expert に解決する。

> **責務分離**: `ux-ui` は **使いやすさ・a11y・必須 state** を見る (ux-ui-audit-expert)。
> `design` は **token / 共通 component / 視覚秩序** を見る (designer-expert)。
> 同一画面で両方が指摘を返すことはあり得る (例: focus 不可視 + token bypass) — その場合は両方起票してよい (フェーズ2 の重複統合ロジックで処理)。

**scope 省略時の注意**: 大規模 repo での全体 scan は重く、ノイズも増える。
さらに **token コストが跳ねる** ことに注意する。scope 省略の full-repo は 1 区画として
complexity が `complex` / `critical` 判定に倒れやすく、`region.audit_model`
(model-selection.md §5.2: single/typical→sonnet, complex/critical→opus) が
**全 expert 一律 Opus** に解決される (full-repo × Opus 7 体 ≈ 1.39M tokens を観測)。
op-patrol は区画 (region) ごとに `region.audit_model` を per-region 解決するため、
広域監査でコストを抑えたいなら op-patrol が適切 (op-scan に区画自動分割は実装しない = op-patrol の責務)。

以下のいずれかを推奨:
- 監査したい範囲がはっきりしている → scope を指定 (区画が小さくなれば sonnet に落ちてコスト減)
- 観点だけ絞りたい → `--domain` を指定
- 「どこを見るべきか」自体を agent に任せたい → `op-patrol` を使用 (repo map と Patrol Ledger に基づく区画選定、per-region model 解決でコスト最適)

> **コスト確認 (対話モードのみ)**: scope 省略で対話起動した場合は、上記コスト構造を 1 回だけ
> 提示し「full-repo Opus で続行 / scope を絞る / op-patrol に切替」の選択肢をユーザーに確認する。
> **`--auto` / 非対話では確認を挟まず警告ログ出力のみ** に留め、自動フローを止めない
> (CLAUDE.md 不変則3)。過剰警告を避けるため警告は scope 省略時のみ・1 回に限定する。

---

#### domain → marker パターン表 (canonical, op-scan/op-patrol 共通) {#domain-marker-patterns}

<!-- op-scan/op-patrol 間の複製を避けるため canonical 節として明確化 (Issue #318 Stage 1)。
     op-patrol/SKILL.md は Stage 2 (Issue #371) で本節への pointer 1 行に短縮済み。 -->

各 domain で op-scan が書き出す `op-run-expert` / `op-post-check-expert` の標準値:

| domain | op-scan-expert | op-run-expert | op-post-check-expert | 補足 |
|--------|---------------|---------------|----------------------|------|
| `debug` | debug-expert | debug-expert | `null` | post-check 不要 |
| `refactor` | refactor-expert | refactor-expert | `null` | 通常 |
| `refactor` | refactor-expert | refactor-expert | security-expert | file IO / path / capability / shell / secret 系 |
| `refactor` | refactor-expert | refactor-expert | ux-ui-audit-expert | UI state / user flow / a11y / visual 系 |
| `optimize` | optimize-expert | optimize-expert | `null` | post-check 不要 |
| `security` | security-expert | security-expert | security-expert | 検出も post-check も同 expert (op-run の判定優先順位 1-8 で apply を debug-expert に回す場合あり) |
| `ux-ui` | ux-ui-audit-expert | designer-expert | ux-ui-audit-expert | 使いやすさ番人 → 美しさ番人 で実装 |
| `design` | designer-expert | designer-expert | ux-ui-audit-expert | UI files を触る場合 |
| `design` | designer-expert | designer-expert | `null` | 非 UI 配置 (token / config) |
| `test` / `feature` (UI 影響なし) | test/feature-expert | test/feature-expert | `null` | additive 検出 |
| `feature` (UI 影響あり) | feature-expert | feature-expert | ux-ui-audit-expert | silent な UX 退化防止 |
| `env` (planned) | env-expert | env-expert | env-expert | routing metadata only。runtime spawn しない |

> `feature` (UI 影響あり) の post-check が `ux-ui-audit-expert` 必須である理由: feature-expert 単独では
> UI 状態 / a11y / 復帰可能性 / 画面遷移の silent な退化を検知できないため。以降「silent な UX 退化防止」は
> 本注記への言及に留める (Single Canonical Source Rule)。

refactor の post-check 選択条件詳細は
`skills/expert-refactor/references/post-check-policy.md` を参照する。
planned expert (env / release / compatibility) と Utility Worker (spec-expert) は scan-time / apply-time
いずれでも runtime spawn しない。fallback / `needs_human_decision` 化は
`skills/_shared/runtime-contract.md` および `skills/_shared/planned-experts.md` の規約に従う
(op-scan 側でハードコードしない)。
