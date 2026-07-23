# hyperfine template — CLI / command の Before / After 計測 (即使う雛形)

<!--
機能概要: hyperfine による CLI / build / pipeline 全体の wall-clock 計測の「そのまま使う」雛形集。
作成意図: apply mode の Before / After 計測を即用意するための雛形。基本パターン (単発計測 /
         Before-After 比較 / cold-warm 区別) と禁止事項の説明は references/benchmark-protocol.md
         が正本のため、本ファイルは protocol に無い追加オプション雛形と、apply mode の
         標準シーケンスのみを持つ (verbatim 重複解消)。
注意点: hyperfine は warmup と min-runs の機能を備えるが、本テンプレでは明示する。
       Windows / WSL では drop_caches が使えないので cold cache 計測は限定的
       (詳細は references/benchmark-protocol.md 「hyperfine の使いどころ」節)。
-->

## 前提

基本的な install / release build 前提、単発計測・Before/After 比較・cold/warm cache 区別の
コマンド例は `references/benchmark-protocol.md` の「hyperfine の使いどころ」節が正本。
本ファイルはそこに無い **追加オプション雛形** と **apply mode の標準シーケンス** のみを扱う。

---

## 1. setup / prepare / cleanup の使い分け

```bash
hyperfine \
  --warmup 3 \
  --runs 10 \
  --setup 'mkdir -p tmp/work' \
  --prepare 'rm -rf tmp/work/* && cp -r input/large/* tmp/work/' \
  --cleanup 'rm -rf tmp/work' \
  './target/bench/after tmp/work'
```

- `--setup`: 全 run の最初に 1 回 (環境準備)
- `--prepare`: 各 run の前に毎回 (前提条件リセット)
- `--cleanup`: 全 run の最後に 1 回 (片付け)

---

## 2. shell 起動オーバーヘッドを除く

```bash
# command 内で複雑な shell 構文を書くとき
hyperfine \
  --warmup 3 \
  --runs 10 \
  --shell=none \
  './target/bench/after input.json'  # shell 経由なし、直接 exec
```

---

## 3. 結果の export

```bash
# Markdown 表 (PR description 貼付用)
hyperfine ... --export-markdown result.md
cat result.md

# JSON (機械処理用)
hyperfine ... --export-json result.json
jq '.results[] | {command, mean, stddev}' result.json

# CSV
hyperfine ... --export-csv result.csv
```

出力例 (Markdown export、そのまま PR description に貼り付け可能):

```markdown
| Command | Mean [ms] | Min [ms] | Max [ms] | Relative |
|:---|---:|---:|---:|---:|
| `./target/bench/before input/sample-large.json` | 250.3 ± 8.1 | 240.1 | 268.5 | 3.05 ± 0.13 |
| `./target/bench/after input/sample-large.json` | 82.1 ± 3.0 | 78.4 | 87.9 | 1.00 |
```

---

## 4. apply mode での標準シーケンス

```bash
# 1. Before の binary を保存 (まだ apply 前)
cargo build --release --bin app
mkdir -p target/bench
cp target/release/app target/bench/before

# 2. baseline 取得
hyperfine \
  --warmup 3 \
  --runs 10 \
  --parameter-list size small,medium,large \
  --export-markdown target/bench/baseline.md \
  './target/bench/before input/sample-{size}.json'

# 3. 改善実装 (Edit ツールで)

# 4. After の binary を保存
cargo build --release --bin app
cp target/release/app target/bench/after

# 5. 比較
hyperfine \
  --warmup 3 \
  --runs 10 \
  --parameter-list size small,medium,large \
  --export-markdown target/bench/result.md \
  --export-json target/bench/result.json \
  './target/bench/before input/sample-{size}.json' \
  './target/bench/after input/sample-{size}.json'

# 6. 結果を確認
cat target/bench/result.md

# 7. 統計判定 (clear / marginal / none / unstable)
#    → references/benchmark-protocol.md 「統計的有意性の判定」節 / references/risk-and-rollback.md
```

---

## 禁止事項・安定化 tips

基本パターン (単発計測・Before/After 比較・cold/warm cache) の禁止事項・環境ノイズ抑制 tips は
`references/benchmark-protocol.md` の「禁止事項」「ベンチマーク環境ノイズの抑制」節が正本
(ここでは再定義しない)。
