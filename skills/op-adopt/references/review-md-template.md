<!-- ルールを足すのは、同じ指摘が 2 つ以上の PR で繰り返したときだけ。ルールを足す・消す PR は人が承認する。要らなくなったルールは消す。 -->
<!-- 置き換える値 (置いたらこのコメントを消す):
  What Important means here の 1〜2 行目は、op-skill の重要度の基準 (severity-rubric の Critical / High) を元にしたこの repo の基準の初期値。人が直してよい
  {{important}}: この repo で特に重要とするもの (認証・課金・データ永続化など)。人が決める。無ければ行ごと消す
  {{always}}: 毎回見ること (この repo の CLAUDE.md などの決まりのうち、繰り返し破られたもの)。始めは「なし」
  {{excluded}}: レビューしないパス (生成物・lockfile・ビルド済みバイナリなど) -->
# REVIEW.md

## What Important means here

- Important は、起きる道筋を示せて、次のどれかが確かに起きるもの: データの消失・破壊・不整合な状態の保存、権限の境界を越えるアクセス・秘密の漏洩、主要な操作のクラッシュ・行き止まり、CI・ビルドが壊れる。
- 当たらないもの (好み・読みやすさ・将来のリスクだけ) は Nit。
- {{important}}

## Always check

- {{always}}

## Keep it quiet

- Nit は 1 つの PR で 5 件まで。
- 次のパスはレビューしない: {{excluded}}
- 主張にはファイルと行番号を付ける。
