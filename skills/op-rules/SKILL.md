---
name: op-rules
description: canonical spec (`.claude/rules/`) の人間向け派生 HTML ビューアを起動する独立 Direct Mode skill。`op rules render` でスナップショット HTML を生成して `file://` で開くか、`op rules serve` でローカル HTTP サーバ (常に最新コード fetch) を立てる。正本は read-only で参照するだけ (write は op-spec 専任)。「op-rules」「rules viewer」「正本ビューア」「正本を俯瞰」「rules render」「rules serve」「spec を眺めたい」等のキーワードで起動。
---

# op-rules: canonical spec ビューア起動

人間が正本 (`.claude/rules/`) を俯瞰するための派生 HTML ビューアを起動する。Direct Mode 固定。

- read-only: 正本を write しない。expert を spawn しない。起票しない。
- 正本の問題に気づいたら `/op-skill:op-spec` へ handoff する (正本 write は op-spec 専任)。

## フェーズ0: 確認

`.claude/rules` が無ければ停止する (viewer の対象がない。先に `/op-skill:op-spec` で正本を起こす)。

## フェーズ1: モード選択

指定が無ければ snapshot で開く。

### 1-A. snapshot (既定)

生成時点の自己完結 HTML。派生物なので既定は repo 外の temp に出し、commit しない (ユーザーが明示パスを指定したらそれを使う)。

```bash
OUT="${OUT:-${TMPDIR:-/tmp}/op-rules-viewer-$(date +%Y%m%d-%H%M%S).html}"
op rules render --out-file "$OUT" && echo "file://$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
```

コード参照は生成時点のもの。コードを変えたら再 render するか 1-B を使う。

### 1-B. live (opt-in)

`op rules serve` は foreground で待ち受け続けるので、skill 内で実行しない。ユーザーに次のどちらかで起動してもらう:

- `! op rules serve` (`!` プレフィックス)
- 別ターミナルで `op rules serve`

起動後 `http://127.0.0.1:7878` を開く (`/code?path=...` で最新コードを表示)。ポート競合時は `--port <N>` で変える。

## フェーズ2: handoff

viewer 上で正本の問題 (古い記述 / 関係の不整合 / provenance の欠落 等) に気づいたら、アノテーション機能で選択 → JSON export し、
その内容を持って `/op-skill:op-spec` を起動するよう案内して終了する。
