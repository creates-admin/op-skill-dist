# op-spec: consolidate (層の正本に散った業務の決まりを機能の正本へ移す)

層の正本に散った 1 つの機能の業務の決まりを、文言を変えずに機能 (2 つ以上の機能に共通なら業務領域) の正本へ移す。1 機能 1 PR。

1. 機能を 1 つ選ぶ。移し元は機能地図のその行の `specs` (層の正本)。
2. 移し先の正本が無ければ、先に SKILL.md 2-4 の lazy 構築で作る (同じ PR に含める)。
3. `references/spec-expert-spawn-template.md` で `mode: consolidate` の spec-expert を spawn し、`trim_plan[]` を受け取る (`spec_path` は移し先、`consolidate_from` は移し元、`code_scope` は移し先の `paths`)。
4. `trim_plan[]` を段落ごとの表 (移し元の節 / 抜粋 / 区分 / action / 移し先 / `pointer_needed`) で見せる。
5. `ask` の段落と、区分・移し先・`pointer_needed` に異論が出た段落は人に聞いて決める。
6. 移す文言の一覧 (原文・移し元・移し先・1 行を残すか) を必ず見せ、承認を得てから write する。
7. 原文を一字一句変えずに移し先の節へ追記し、移し元の層の正本から削除する。`pointer_needed: true` の段落だけ、元の位置に `[[<feature>/<section>]]` の 1 行を残す。
8. 移した文言が移し先に一字一句あり、移し元に残っていないことを `grep -F` で確かめる (下の bash。改行コードの CR は除いて比べ、記号だけの行は飛ばし、移し元は行全体の一致で見る。不一致が 1 件でもあれば非 0 で終わる)。
   短い行 (表の行など) は移し元の別の箇所に元から同じ形であると「移し元に残っている」と出るので、`grep -nxF` で位置を見て移した箇所でなければ合格とする。
9. `_index.md` の機能地図の該当行の正本列に移し先のキーを足す。
10. `op spec-patrol list-specs --json` で両方の正本の `chars`、`op spec-patrol check-links --json` で残した 1 行の参照切れが無いことを確かめる。

```bash
: "${MOVED:?移した原文 1 段落を保存したファイル}" "${TO:?移し先の正本}" "${FROM:?移し元の層の正本}"
NG=0
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}"
  [[ "$line" =~ ^[[:space:][:punct:]]*$ ]] && continue
  grep -qF -- "$line" <(tr -d '\r' < "$TO") || { echo "移し先に無い: $line"; NG=1; }
  grep -qxF -- "$line" <(tr -d '\r' < "$FROM") && { echo "移し元に残っている: $line"; NG=1; }
done < "$MOVED"
[ "$NG" -eq 0 ]
```

## PR

`references/spec-pr.md` (mode `consolidate`)。
