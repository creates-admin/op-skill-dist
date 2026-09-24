# Runtime Contract

OP runtime の共有境界 (spawn 可否 / marker と実行権限の関係 / apply・post-check の解決結果) の正本。
各 OP skill の具体手順は各 SKILL.md に置く。

## 1. Canonical Sources

spawn 可能な expert は `active-expert-registry.md`、planned は `planned-experts.md`、marker / label は
`markers/labels-and-markers.md`、model 選択は `model-selection.md`。他ファイルと矛盾したら `_shared` の正本が勝つ。

## 2. Active Registry and Agent Frontmatter Relationship

`agents/*.md` frontmatter は agent⇔skill の機械的 linkage であり、spawn 可否の根拠にしない。
registry との整合は `op core registry-verify`。矛盾は contract error として停止し、自動解決しない。

## 3. Runtime Spawn Rule

registry に無い expert は spawn しない。apply / post-check の expert 解決は `op run expert-resolve` が行う
(出力: `apply_expert` / `post_check_expert` / `needs_human_decision` / `normalization_log`)。

### 3-A. Apply / Fix Runtime Resolution

解決結果は active expert / `needs_human_decision` / abort のいずれか。planned・unregistered expert を spawn target にしない。

### 3-B. Post-check Runtime Resolution

解決結果は active post-check expert (registry の Issue post-check 列が yes) / `null` (post-check 不要が明示されている) /
planned-skip / `needs_human_decision` / abort のいずれか。
planned-skip は、PR コメントに「post-check 未実施」と自然文で明示し、検証成功と区別できる場合のみ有効。

### 3-C. Internal Enum vs GitHub Label

内部処理は snake_case の `needs_human_decision`、GitHub label は `needs:human-decision`。変換はラベルを付ける / 読む境界でのみ行う。

## 4. Routing Metadata Rule

Issue / PR marker、cluster annotation、scan finding の推奨 expert 名、`recommended_expert`、`op-run-expert`、
`op-post-check-expert` はすべて routing metadata であり実行権限ではない。scan-time / patrol-time / apply-fix / review の
spawn context は権限を継承しない。scan-time spawn は `op-scan`、patrol-time は `op-patrol`、apply/fix は `op-run` が解決する。

## 7. Unregistered Expert Rule

registry にも `planned-experts.md` にも無い expert は spawn invalid。許される処理は、明示 mapping による active expert への
normalize (mapping 元と先を記録する) / `needs_human_decision` / contract error で abort のみ。黙って active expert に置換しない。

## 8. No-Apply Rule

no-apply expert (registry の Runtime apply 列が no) は apply/fix executor にできず、commit / push させない。
apply target として要求されたら active apply expert か `needs_human_decision` へ normalize する。

## 10. Reclassification Metadata Rule

再分類 (例: `release-expert` → `debug-expert`) は schema field `reclassified_from` / `reclassified_to` /
`reclassification_reason` が正本。PR 本文には再分類を自然文で書く。
