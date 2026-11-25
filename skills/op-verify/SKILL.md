---
name: op-verify
description: 実機検証ハーネスを導入・実行・育成するスキル。--init は stack (Web / Tauri) を診断し、テンプレートからハーネスと .claude/skills/verify/SKILL.md (どのセッションでも読まれる検証の手順) を expert に作らせ、op verify conformance が通るまで仕上げて PR。通常モードは対象 branch / PR でハーネスを起動し、verify-runner が実機で操作して証跡を残し、停止して結果を記録する。--grow は記録された gap と regression spec 昇格候補を人間が選び、expert がハーネスと verify SKILL.md へ還元して PR。--provision-windows は Windows 検証の環境の不足を見つけて準備を提案し、人間の承認後にスクリプトで行う。起票はしない。「op-verify」「実機検証」「ハーネス導入」「verify harness」「動作確認」等のキーワードで起動。
---

# op-verify: 実機検証ハーネスの導入 / 実機検証 / 育成

ハーネスが無い repo では作り、ある repo では使い、足りなければ育てる (ADR-0033)。
ハーネスの契約は `~/.claude/skills/_shared/verify-harness.md` (対象 repo の `.claude/skills/verify/SKILL.md` は同 §8)、`op-config.yaml` での宣言は `~/.claude/skills/_shared/op-config-schema.md` §14 `verify_harness`。

- Direct Mode 固定 (`~/.claude/skills/_shared/invocation-mode.md`「Direct 固定 skill に op_managed が渡った場合」)。spawn する worker には `op_managed` を渡す。
- ハーネスとテストの変更は feature-expert が worktree で apply → PR する経路だけで行う。司令官はコードを編集しない。マージは人間 (op-merge 可)。
- Issue は起票しない。gap (ハーネスが自動でやらず手作業で補った工程) は完了報告と PR の op-review-state に載せ、`--grow` で還元する。
  検証中に見つかった Critical / High 級の不具合は報告に載せ、`/op-skill:op-report` を案内する。
- 他 skill との境界: op-adopt は未導入を診断して `--init` を案内するだけ。実機検証の段の手順の正本は
  `references/runtime-verify-dispatcher.md`。

## 起動

```
/op-skill:op-verify --init                                   # ハーネスの無い repo に導入する
/op-skill:op-verify [--pr <N> | --branch <name> | --checkout <path>] [--scenario "<確かめること>"]... [--windows]
                                                              # 実機検証 (対象省略時は現在の checkout の HEAD)
/op-skill:op-verify --grow [--pr <N> | --from <verify-runner の返却 JSON>]
                                                              # gap / regression spec 昇格候補をハーネスへ還元する
/op-skill:op-verify --provision-windows [--windows-cache <C:\op-verify>] [--webview2-version <ver>]
                                                              # Windows 検証の環境を準備する (提案 → 承認 → スクリプト)
```

- `--windows` は通常モードで Windows 判定を明示的に当てる (ADR-0035 決定 6)。diff が `windows_paths` に当たらなくても Windows Sandbox を借りて検証する。
  `--init` / `--grow` では使わない。

## フェーズ0: 環境確認

`~/.claude/skills/_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」。GitHub I/O は `~/.claude/skills/_shared/github-channel.md` に従う。
`op verify --help` が失敗する op は古いので、plugin を更新するよう案内して終了する。

base を確定し、以降の fence ではリテラルで書く (`~/.claude/skills/_shared/bash-fence-convention.md`):

```bash
BASE_REF="$(op run base-sha | jq -r '.payload.base_ref | sub("^origin/"; "")')"
git fetch origin "$BASE_REF:refs/remotes/origin/$BASE_REF"
op run base-sha --base-ref "origin/$BASE_REF" | jq -r '.payload.base_sha'   # → BASE_SHA
```

`--provision-windows` は `op-config.yaml` を読まず、フェーズ0 の後に「`--provision-windows`: Windows 検証の環境の準備」へ進む。
`--init` / `--grow` は repo ルートの `op-config.yaml` の `verify_harness` を読む。
通常モードはここでは読まず、通常モードの手順 1 (`references/run.md`) で決めた checkout のルートで判定する (`--pr` の head にだけハーネスがある場合を取りこぼさないため)。

| `verify_harness` | `--init` | `--grow` |
|---|---|---|
| 無い | `--init` へ進む | `--init` を案内して終了 |
| ある | `op verify conformance` を実行する。pass で `.claude/skills/verify/SKILL.md` もあれば「導入済み」と報告して終了。pass で verify SKILL.md だけ無ければ「`--init`: verify SKILL.md だけを足す」へ進む。fail なら理由を示し、`--grow` と同じ apply で直すか人間に聞く | `--grow` へ進む |

テンプレートの場所と一覧は `references/init.md`「テンプレート」。

## `--init`: ハーネスの導入

診断 → 導入計画の人間承認 → feature-expert が worktree で apply → 司令官が `op verify conformance` と verify SKILL.md を確かめる → PR。
手順と spawn prompt は `references/init.md`「手順」。

### `--init`: verify SKILL.md だけを足す

ひな形を埋めた案の人間承認 → apply → 確認 → PR。手順は `references/init.md`「verify SKILL.md だけを足す」。

## 通常モード: 実機検証

checkout を決める → scenarios を組む → `references/runtime-verify-dispatcher.md` を使う → 記録 → worktree は残す。
手順は `references/run.md`。

## `--grow`: ハーネスの育成

候補 (gap / regression spec 昇格 / verify SKILL.md) を集める → 人間が選ぶ → apply → PR。手順と提示の形は `references/grow.md`。

## `--provision-windows`: Windows 検証の環境の準備

手順は `references/provision-windows.md` が正本。worktree・PR・expert の spawn は使わず、司令官が検出 → 提案 → AskUserQuestion → スクリプト実行 → lease / release の確認を行う。

## PR

```bash
git -C "<worktree_path>" push origin "<branch>"
cat > "<worktree_path>.pr-body.md" <<'EOF'
<PR 本文>
EOF
op pr create --base "<BASE_REF>" --head "<branch>" --title "<タイトル>" --body-file "<worktree_path>.pr-body.md"
```

- 本文: stack とテンプレート、置き場所、`op verify conformance` の結果 (司令官が実行したもの)、verify SKILL.md の追加・変更、還元した候補 (`--grow`)、実行した検証 Level。
- `.claude/` のファイルも含めて worktree の commit を push する (公式の `/ship` は使わない)。
- worktree は残す (`~/.claude/skills/_shared/worktree-ops.md`「cleanup タイミング」)。push か PR 作成に失敗したら `--failure` で隔離して報告する。

## 完了報告

形は `references/report.md`。
