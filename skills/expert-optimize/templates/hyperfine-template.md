# hyperfine template — CLI / command の Before / After 計測

<!--
機能概要: hyperfine による CLI / build / pipeline 全体の wall-clock 計測テンプレ。
作成意図: apply mode の Before / After 計測を即用意するための雛形。
注意点: hyperfine は warmup と min-runs の機能を備えるが、本テンプレでは明示する。
       Windows / WSL では drop_caches が使えないので cold cache 計測は限定的。
-->

## 前提

- `hyperfine` のインストール:
  - Linux: `cargo install hyperfine` または `apt install hyperfine`
  - Windows: `winget install hyperfine` または `cargo install hyperfine`
  - macOS: `brew install hyperfine`
- 計測対象は **release build**:
  - Rust: `cargo build --release`
  - Node: `npm run build` 後の dist
  - Tauri: `cargo build --release --bin <app>` で sidecar binary

---

## 1. baseline 取得 (Before)

### 単純な single command

```bash
hyperfine \
  --warmup 3 \
  --runs 10 \
  --export-json target/bench/baseline.json \
  --export-markdown target/bench/baseline.md \
  './target/release/app input/sample-large.json'
```

### 入力規模ごとに baseline

```bash
hyperfine \
  --warmup 3 \
  --runs 10 \
  --parameter-list size small,medium,large \
  --export-markdown target/bench/baseline-by-size.md \
  './target/release/app input/sample-{size}.json'
```

---

## 2. Before / After 比較

### Before / After binary を別名で保存しておくパターン (推奨)

`git checkout` を hyperfine 内に入れるとノイズが増えるため、
**事前に before / after の binary を別名でビルドして並べる** のが安定。

```bash
# 1. Before binary を保存
git stash  # apply 中の変更を退避
cargo build --release --bin app
cp target/release/app target/bench/before
git stash pop  # 変更を復元

# 2. After binary をビルド
cargo build --release --bin app
cp target/release/app target/bench/after

# 3. 比較
hyperfine \
  --warmup 3 \
  --runs 10 \
  --export-markdown target/bench/result.md \
  --export-json target/bench/result.json \
  './target/bench/before input/sample-large.json' \
  './target/bench/after input/sample-large.json'
```

### 入力規模 × Before/After

```bash
hyperfine \
  --warmup 3 \
  --runs 10 \
  --parameter-list size small,medium,large \
  --export-markdown target/bench/before-after-by-size.md \
  './target/bench/before input/sample-{size}.json' \
  './target/bench/after input/sample-{size}.json'
```

---

## 3. cold / warm cache 区別 (I/O 影響時)

### Linux

```bash
# cold: OS page cache を毎回クリア
hyperfine \
  --warmup 0 \
  --runs 10 \
  --prepare 'sync && echo 3 | sudo tee /proc/sys/vm/drop_caches' \
  './target/bench/after input/large.idml'

# warm: warmup 込み (定常状態)
hyperfine \
  --warmup 3 \
  --runs 10 \
  './target/bench/after input/large.idml'
```

### Windows / WSL

drop_caches が使えないので簡易的に:

```bash
# cold proxy: 入力ファイルを毎回 copy で touch
hyperfine \
  --warmup 0 \
  --runs 10 \
  --prepare 'cp input/large-source.idml input/large-fresh.idml' \
  './target/bench/after input/large-fresh.idml'
```

> 厳密な cold 計測は Linux native でのみ可能。WSL は file system 越しなので注意。

---

## 4. setup / cleanup の使い分け

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

## 5. shell 起動オーバーヘッドを除く

```bash
# command 内で複雑な shell 構文を書くとき
hyperfine \
  --warmup 3 \
  --runs 10 \
  --shell=none \
  './target/bench/after input.json'  # shell 経由なし、直接 exec
```

---

## 6. 結果の確認・export

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

---

## 7. 安定化 tips

```bash
# warmup を増やす (CPU governor / cache が安定するまで待つ)
hyperfine --warmup 5 --runs 20 ...

# CPU governor を performance に固定 (Linux)
sudo cpupower frequency-set -g performance

# 他プロセスの干渉を抑える
# - browser, IDE, antivirus を止める
# - laptop は AC 接続、低消費電力モード OFF

# baseline を 2 回取って差分が誤差内か確認 (ベンチ自体の信頼性)
hyperfine --warmup 3 --runs 10 \
  './target/bench/before input.json' \
  './target/bench/before input.json'
# 同じ binary なら差は誤差内のはず
```

---

## 8. 出力例 (Markdown export)

```markdown
| Command | Mean [ms] | Min [ms] | Max [ms] | Relative |
|:---|---:|---:|---:|---:|
| `./target/bench/before input/sample-large.json` | 250.3 ± 8.1 | 240.1 | 268.5 | 3.05 ± 0.13 |
| `./target/bench/after input/sample-large.json` | 82.1 ± 3.0 | 78.4 | 87.9 | 1.00 |
```

そのまま PR description に貼り付け可能。

---

## 9. 失敗パターン (避ける)

- **debug build で計測**: `cargo run` のまま hyperfine → 数倍遅い結果になる
- **warmup なし**: cold cache の偏差が大きい
- **runs 1 回のみ**: 統計値が出ない (hyperfine は最低 10 推奨)
- **mean が 1 ms 未満の関数を hyperfine**: hyperfine の精度限界 (criterion を使う)
- **入力 fixture が毎回変わる**: 再現性なし
- **Before / After で異なる入力**: 比較不能
- **system noise を放置**: Browser / IDE 動作中、antivirus scan 中で計測
- **Windows native で drop_caches 想定**: 動かない (Linux 限定機能)

---

## 10. apply mode での標準シーケンス

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
#    → benchmark-protocol.md / risk-and-rollback.md
```
