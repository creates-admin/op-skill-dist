# Runtime Contract

OP runtime の共有境界 (spawn 可否 / marker と実行権限の関係 / apply・post-check の解決結果) の正本。
各 OP skill の具体手順は各 SKILL.md に置く。

## 1. Canonical Sources

spawn 可能な expert は `active-expert-registry.md`、planned は `planned-experts.md`、marker / label は
`markers/labels-and-markers.md`、model 選択は `model-selection.md`。他ファイルと矛盾したら `_shared` の正本が勝つ。

## 2. Active Registry and Agent Frontmatter Relationship

`agents/*.md` frontmatter は agent⇔skill の機械的 linkage であり、spawn 可否の根拠にしない。
frontmatter と registry が矛盾したら contract error として停止し、人間の修正を求める (自動解決しない)。

## 3. Runtime Spawn Rule

expert を spawn する OP skill は spawn 直前に本契約で解決する。registry に無い expert は spawn しない。
解決の戻り値は apply/fix 用 (§3-A) と post-check 用 (§3-B) で別。

### 3-A. Apply / Fix Runtime Resolution

戻り値 (内部 enum) は次のいずれか:

- registry の active expert
- `needs_human_decision`
- abort / safe no-op

planned expert・unregistered expert を spawn target として返さない。planned-skip は apply/fix の解決結果にならない。

### 3-B. Post-check Runtime Resolution

戻り値 (内部 enum) は次のいずれか:

- active post-check expert (registry の Issue post-check 列が yes のもの)
- `null` (post-check 不要が明示されている)
- planned-skip (planned post-check expert が指定された場合)
- `needs_human_decision`
- abort / safe no-op

planned-skip は、要求 expert が planned / 利用不可であり、PR コメントに「post-check 未実施」と自然文で明示し、
検証が行われたと偽らず、検証成功と区別できる場合のみ有効。

### 3-C. Internal Enum vs GitHub Label

内部処理 (関数戻り値・dispatch key・sentinel 比較) は snake_case の `needs_human_decision` を使い、
GitHub へ label を付ける境界でのみ `needs:human-decision` に変換する。GitHub label を読んで分岐する場合も
境界で snake_case に正規化してから内部へ渡す。

## 4. Runtime Owner Rule

scan-time spawn は `op-scan`、patrol-time spawn は `op-patrol`、apply/fix spawn は `op-run` が解決する。
Issue / PR marker は routing metadata であり、後段 skill の spawn を認可しない。要求 expert が op-scan / op-patrol
由来でも、apply/fix spawn の最終解決は `op-run` が行う。

## 5. Spawn Context Separation

scan-time / patrol-time / apply-fix / review の各 spawn context は権限を継承しない。
ある context で出した marker を別 context の実行権限として扱わない。

## 6. Planned Expert Rule

planned expert は roadmap / 設計メモ / Issue・PR の routing metadata / planned-skip の記録には書いてよいが、
`subagent_type` 等の spawn 引数や apply/fix の fallback destination にしない。個別ルールは `planned-experts.md`。

## 7. Unregistered Expert Rule

registry にも `planned-experts.md` にも無い expert は spawn invalid。許される処理は次の 3 つのみ:

- 明示 mapping による active expert への normalize (mapping 元と先を記録する)
- `needs_human_decision`
- contract error で abort

黙って active expert に置換しない。

## 8. No-Apply Rule

no-apply expert (registry の Runtime apply 列が no) は apply/fix executor にできず、commit / push させない。
apply target として要求されたら active apply expert / `needs_human_decision` / 文書化された advisory-only 経路のいずれかへ normalize する。

## 9. Routing Metadata Rule

Issue / PR marker、cluster annotation、scan finding の推奨 expert 名、`recommended_expert`、`op-run-expert`、
`op-post-check-expert` はすべて routing metadata であり実行権限ではない。
下流 skill が §3・§6〜§8 を適用して spawn 可否を再判定する。

## 10. Reclassification Metadata Rule

再分類 (例: `release-expert` → `debug-expert`) は schema field `reclassified_from` / `reclassified_to` /
`reclassification_reason` が正本。PR 本文には再分類を自然文で書く。

## 11. Review 結果とマージ

op-run の review 結果 (`pro-reviewed` ラベル / review state 文書) は人間がマージ判断する際の参考シグナル。
op-run はマージしない。マージは人間が `/op-skill:op-merge` (監査・順序付け・マージ) または GitHub で行う。
