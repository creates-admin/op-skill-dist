<!-- ルールを足すのは、同じ指摘が 2 つ以上の PR で繰り返したときだけ。ルールを足す・消す PR は人が承認する。要らなくなったルールは消す。 -->
<!-- 置き換える値 (置いたらこのコメントを消す):
  {{important}}: この repo で特に重要とするもの (認証・課金・データ永続化など)。人が決める。無ければ行ごと消す
  {{always}}: 毎回見ること (この repo の CLAUDE.md などの決まりのうち、繰り返し破られたもの)。始めは「なし」
  {{excluded}}: レビューしないパス (生成物・lockfile・ビルド済みバイナリなど) -->
# REVIEW.md

## What Important means here

- Important は OP の重要度の基準 (`~/.claude/skills/_shared/severity-rubric.md`) の Critical / High に当たるもの。当たらないものは Nit。
- {{important}}

## Always check

- {{always}}

## Keep it quiet

- Nit は 1 つの PR で 5 件まで。
- 次のパスはレビューしない: {{excluded}}
- 主張にはファイルと行番号を付ける。
