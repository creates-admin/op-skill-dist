---
name: op-rules
description: canonical spec (`.claude/rules/`) の人間向け派生 HTML ビューアを起動する独立 Direct Mode skill。`op rules render` でスナップショット HTML を生成して `file://` で開くか、`op rules serve` でローカル HTTP サーバ (常に最新コード fetch) を立てる。正本は read-only で参照するだけ (write は op-spec 専任)。「op-rules」「rules viewer」「正本ビューア」「正本を俯瞰」「rules render」「rules serve」「spec を眺めたい」等のキーワードで起動。
---

<!--
schema_version: 1
last_breaking_change: 2026-06-26
notes: v1 (2026-06-26) 初版。ADR-0020 (op-tools/docs/adr/0020-op-rules-render-human-discoverability.md, Accepted)
       で実装された `op rules render` / `op rules serve` (M1-M4) を skill 駆動の起動口として薄くラップする。
       op-tools primitive は実装済み (Issue #838-841 由来)。本 skill は markdown のみ・op-tools 変更なし・
       新 active expert なし・expert spawn なし・ADR 不要 (既存 read-only CLI の純 composition、op-codev/op-report 前例)。
-->

<!--
機能概要: canonical spec (`.claude/rules/`) の人間向け発見性を担う派生 HTML ビューアを起動する
         独立 Direct Mode skill。`op rules render` (スナップショット HTML を file:// で開く) と
         `op rules serve` (127.0.0.1 限定 HTTP サーバ、常に最新コード fetch) の薄いラッパー。
作成意図: ADR-0020 で `op rules render` を実装したが、どの OP skill にも workflow にも自動配線されておらず
         「人間が CLI を覚えて手で叩く」状態だった。viewer は本来「正本を俯瞰したい人間」のための
         on-demand ツールなので、slash で発見・起動できる薄い skill 起動口を与え、skill 駆動化する。
         op-spec / op-spec-patrol からはこの skill を指す soft pointer のみを置き、ロジックは重複させない
         (Single Canonical Source Rule)。
注意点: Direct Mode 固定 (人間起動)。read-only — 正本 (`.claude/rules/`) は一切 write しない
         (正本 write は op-spec が human align 後にのみ行う、ADR-0017 / ADR-0020 決定4)。
         viewer で気づいた正本の問題は注釈 (M4) → `/op-spec` へ handoff してそちらで修正する。
         新 active expert を増やさない / expert を spawn しない (op CLI primitive を呼ぶだけ)。
         render のスナップショット HTML は派生物ゆえ既定で repo 外 (temp) に出力し commit しない。
-->

# op-rules: canonical spec ビューア起動

/**
 * 機能概要: `.claude/rules/` の正本群を人間が俯瞰するための派生 HTML ビューアを起動する
 *           独立 Direct Mode skill。op rules render (snapshot) / op rules serve (live) の薄いラッパー。
 * 作成意図: ADR-0020 で実装済みの viewer が skill/workflow へ未配線だったため、
 *           slash で発見・起動できる人間向けの起動口を与える。正本 write は持たない (op-spec 専任)。
 * 注意点: read-only。正本を write しない。新 expert を spawn しない。snapshot HTML は非 commit。
 */

---

## このスキルの位置づけ

正本 (`.claude/rules/`) は機械 (Claude / expert) が path-scoped frontmatter で **native auto-inject** して
読むため HTML を必要としない。一方で正本が flat 大規模化すると **人間が「どこに何があるか」を探しにくくなる**
(ADR-0020 発見性問題)。本 skill はその人間向け発見性を担う read-only 派生ビューアの起動口である。

| skill | 役割 | 正本への mutation |
|-------|------|------------------|
| `op-spec` | 正本を対話で育てる (cultivation) | あり (human align 後のみ write、不変則7 例外) |
| `op-spec-patrol` | 正本を巡回し drift 検出 | mechanical fix のみ (第3例外) |
| **op-rules (本スキル)** | 正本を **俯瞰する派生ビューアを起動** | **なし (read-only)** |

op-rules の責務:

- **DO**: `op rules render` / `op rules serve` の起動、出力先 (`file://` / `http://`) の案内、
  注釈 → `/op-spec` への handoff 案内
- **DON'T**: 正本 write、enrichment / 起票、expert spawn、自動配線 (人間が明示起動する Direct Mode 固定)

---

## 参照ドキュメント

- `~/.claude/skills/_shared/invocation-mode.md` — Direct Mode 判定 (本スキルは Direct Mode 固定)
- `op-tools/docs/adr/0020-op-rules-render-human-discoverability.md` — viewer の設計意図・正本 (`op rules render`)
- `skills/op-spec/SKILL.md` — viewer で気づいた正本の問題の handoff 先 (正本 write 専任)

---

## フェーズ0: 環境確認

### 0-1. Invocation Mode 判定 (Direct Mode 固定)

`_shared/invocation-mode.md` に従って判定する。本スキルは **Direct Mode 固定**。
spawn prompt に `invocation_mode: op_managed` が混入していた場合は契約違反として停止し、ユーザーに報告する。

### 0-2. git / op binary / 正本ディレクトリ確認

```bash
# git リポジトリ判定
git rev-parse --is-inside-work-tree 2>/dev/null \
  || { echo "not a git repo — op-rules は既存リポジトリ上で動作します"; exit 1; }

# op binary 鮮度確認 (op rules render/serve に必要)
if command -v op >/dev/null 2>&1; then
  op version --json 2>/dev/null | jq -r '"op binary: " + .version'
else
  echo "[op binary] 見つかりません (cargo install --path op-tools/crates/op で配置してください)"; exit 1
fi

# 正本ディレクトリ確認 (ADR-0017 W1a で新設、無ければ viewer の対象が無い)
RULES_DIR=".claude/rules"
if [ -d "$RULES_DIR" ]; then
  COUNT=$(find "$RULES_DIR" -maxdepth 1 -name '*.md' ! -name '_*' ! -name '00-*' 2>/dev/null | wc -l)
  echo "[rules] $RULES_DIR に feature 正本 ${COUNT} 件"
else
  echo "[rules] $RULES_DIR が無い (ADR-0017 正本未導入) — viewer の対象がありません"; exit 1
fi
```

---

## フェーズ1: モード選択

「**スナップショット (既定)**」と「**ライブサーバ**」のどちらで viewer を開くかをユーザーに確認する
(指定済みならそのまま)。

| モード | コマンド | 性質 | 主用途 |
|-------|---------|------|--------|
| **snapshot (既定)** | `op rules render --out-file <path>` | 生成時点の自己完結 HTML。`file://` で直接開ける。外部依存ゼロ | サッと俯瞰 / 共有 / オフライン閲覧 |
| **live** | `op rules serve --port 7878` | 127.0.0.1 限定 HTTP サーバ。`/code` で常に最新コードを fetch | コードと突き合わせながら継続的に見る |

### 1-A. snapshot モード (既定)

スナップショット HTML を **repo 外の temp** に生成し (派生物ゆえ commit しない)、`file://` URL を案内する。
ユーザーが明示パスを指定した場合はそれを使う。

```bash
# 出力先: 既定は temp (非 commit)。明示パスがあれば OUT に代入してこの行を飛ばす。
OUT="${OUT:-${TMPDIR:-/tmp}/op-rules-viewer-$(date +%Y%m%d-%H%M%S).html}"

op rules render --out-file "$OUT" \
  || { echo "op rules render 失敗 — op binary / 正本ディレクトリを確認してください"; exit 1; }

echo "viewer を生成しました。ブラウザで開いてください:"
echo "  file://$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
```

> 注: スナップショット内のコード参照は **生成時点のスナップショット** (ADR-0020 決定5(a))。
> コードを変更したら再 render するか、最新性が要るなら 1-B (serve) を使う。

### 1-B. live モード (opt-in)

127.0.0.1 限定の HTTP サーバを立てる。**フォアグラウンドで待ち受ける** (Ctrl-C で停止) ため、
ユーザー自身に起動してもらうのが安全 (セッションをブロックしない)。
「`! op rules serve` のように `!` プレフィックスで起動するか、別ターミナルで実行してください」と案内する。

```bash
# このコマンドは待ち受け続けるので、ユーザーに直接実行してもらう (skill 内で foreground 実行しない):
#   op rules serve --port 7878
# 起動後、ブラウザで以下を開く:
#   http://127.0.0.1:7878
```

ポート競合時は `--port <別番号>` を案内する。`/code?path=...` は repo ルート配下のソースを最新で返す
(path traversal は CLI 側が正規化して repo ルート外を拒否)。

---

## フェーズ2: handoff (正本の問題に気づいたら)

viewer は read-only であり、**正本を直接編集しない** (ADR-0020 決定4)。viewer 上で正本の問題
(古い記述 / 関係の不整合 / provenance の欠落 等) に気づいた場合の正規ルートは:

- M4 アノテーション機能でドラッグ選択 → JSON export し、その内容を `/op-spec` へ持ち込む
- `/op-spec` が human align を経て正本を write する (正本 write は op-spec 専任、不変則7 例外)

op-rules はここで「`/op-spec` を起動して reconcile してください」と案内して終了する。
**op-rules 自身は正本を write しない。**

---

## 制約

- **Direct Mode 固定** — 人間が `/op-rules` で明示起動する。OP-managed 経路 (自動 spawn) はない。
- **read-only** — 正本 (`.claude/rules/`) を一切 write しない。snapshot HTML も派生物ゆえ既定で非 commit。
- **新 active expert を増やさない / expert を spawn しない** — op CLI primitive (`op rules render` / `op rules serve`) を呼ぶだけ。
- **op-tools 変更なし** — viewer ロジックは ADR-0020 で実装済み。本 skill は markdown の薄い起動口に徹する。
- **正本の修正は op-spec へ委譲** — viewer で気づいた問題は `/op-spec` へ handoff する。
