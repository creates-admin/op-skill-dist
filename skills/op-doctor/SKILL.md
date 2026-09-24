---
name: op-doctor
description: コードでなく「環境・依存・toolchain・lockfile・CI・OSV」の repo 健康診断を行う独立 OP skill。6 項目を診断して OP Doctor Report を出し、Critical/High のみ Issue を起票する。Direct Mode 固定。「op-doctor」「健康診断」「環境診断」「doctor」「依存チェック」「toolchain」「lockfile」等のキーワードで起動。
---

# op-doctor: 環境・依存・toolchain の repo 健康診断

repo の環境健全性を診断し、OP Doctor Report を出力する。コードの欠陥は見ない (op-scan / op-patrol の責務)。
診断は read-only。人間起動専用 (`~/.claude/skills/_shared/invocation-mode.md`「Direct 固定 skill に op_managed が渡った場合」)。

## 起動

```text
/op-skill:op-doctor                          # 6 項目を診断 → Report 表示 → 承認後に Critical/High を起票
/op-skill:op-doctor --auto                   # Critical/High を自動起票 (auto-policy 準拠)
/op-skill:op-doctor --check deps,lockfile    # 診断項目を限定 (項目名は下表の --check 名)
```

## 診断 6 項目

| # | `--check` 名 | 内容 | 判定方法 |
|---|-------------|------|---------|
| 1 | `env` | toolchain version / 必須コマンドの存在 | `op doctor env` の `toolchains[]` / `commands[]` |
| 2 | `commands` | build・test・lint・audit コマンドの存在 | `op doctor env` の `commands[]` |
| 3 | `deps` | 依存脆弱性 / OSV / supply-chain risk | security-expert を spawn |
| 4 | `lockfile` | package manager と lockfile の整合 | `op doctor env` の `lockfiles[]` |
| 5 | `toolchain` | 宣言 (rust-toolchain / .nvmrc 等) と実体 version の乖離 | controller が `toolchains[].version` と宣言を突き合わせる (深い互換推論は debug-expert) |
| 6 | `ci-local` | CI (`.github/workflows`) で使うコマンドと local で使えるコマンドの差 | controller が CI 定義と `commands[].present` を比較 (失敗 RCA は debug-expert) |

CLI は `op doctor env` のみ。項目 5 / 6 は controller がその生データから導出する。

## フェーズ0: 環境確認

`~/.claude/skills/_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」に従う。gh channel で未認証なら中断する。

## フェーズ1: 決定論 inventory

```bash
op doctor env --json [--dir <path>]   # toolchains[] / lockfiles[] / commands[] (read-only、severity 判定なし)
```

- `toolchains[].present` = version probe が成功した (壊れた shim は false)。
- `commands[].present` = PATH 上に存在するだけ (exit code は問わない)。同一ツールで両者が食い違うことがある。

OK / WARN / FAIL と severity は controller がフェーズ3で判定する。

## フェーズ2: expert 深掘り (該当 finding があるときのみ)

| トリガー | spawn する expert |
|---------|------------------|
| `deps` を診断する | `op-skill:security-expert` (依存マニフェスト + lockfile path を渡す) |
| コマンド失敗 / toolchain 互換の深い推論が要る | `op-skill:debug-expert` (失敗コマンドと出力、`toolchains[]` を渡す) |
| tool install policy / org policy 等の方針判断 | spawn せず `needs_human_decision` |

spawn prompt は `~/.claude/skills/_shared/spawn-prompt-common.md` §1〜§5 (exploration-only variant) を含め、返却は `expert-spawn.md` の canonical schema。
env-expert は spawn しない。routing 値に env-expert が出たら `~/.claude/skills/_shared/planned-experts.md` の substitute に normalize する。

## フェーズ3: OP Doctor Report

```text
=== OP Doctor Report ===
対象 repo: <owner/repo>  診断日時: <RFC3339>

[1] env inventory ........... OK | WARN | FAIL | SKIPPED
[2] command matrix .......... ...
[3] deps + OSV summary ...... SKIPPED (cargo audit / pnpm audit が PATH に無い)
[4] lockfile 整合 ........... ...
[5] toolchain drift ......... ...
[6] CI-local 不一致 ......... ...

--- Critical / High findings (起票候補) ---
- [High] <summary> (項目: deps, 担当: security-expert)

--- Medium / Low (起票しない、参考) ---
- [Medium] <summary>
```

- severity は `~/.claude/skills/_shared/severity-rubric.md` で判定する。
- 診断ツールが PATH に無い項目は FAIL にせず SKIPPED (理由付き) とする。

## フェーズ4: 起票

起票は `~/.claude/skills/_shared/filing-gate.md` に従う (対話は Report 提示後の承認、`--auto` は同 §1)。Critical / High のみ起票し、Medium 以下は Report に記すだけ。
marker とラベルは `pr-templates.md`「domain → marker / ラベル表」(deps 系は `security`、toolchain / command / CI 系は `debug` の domain で扱う)。
