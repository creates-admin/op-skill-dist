---
name: op-verify
description: 実機検証ハーネスを導入・実行・育成するスキル。--init は stack (Web / Tauri) を診断し、テンプレートからハーネスを expert に作らせ、op verify conformance が通るまで仕上げて PR。通常モードは対象 branch / PR でハーネスを起動し、verify-runner が実機で操作して証跡を残し、停止して結果を記録する。--grow は記録された gap と regression spec 昇格候補を人間が選び、expert がハーネスへ還元して PR。起票はしない。「op-verify」「実機検証」「ハーネス導入」「verify harness」「動作確認」等のキーワードで起動。
---

# op-verify: 実機検証ハーネスの導入 / 実機検証 / 育成

ハーネスが無い repo では作り、ある repo では使い、足りなければ育てる (ADR-0033)。
ハーネスの契約は `~/.claude/skills/_shared/verify-harness.md`、`op-config.yaml` での宣言は `~/.claude/skills/_shared/op-config-schema.md` §14 `verify_harness`。

- Direct Mode 固定 (`~/.claude/skills/_shared/invocation-mode.md`「Direct 固定 skill に op_managed が渡った場合」)。spawn する worker には `op_managed` を渡す。
- ハーネスとテストの変更は feature-expert が worktree で apply → PR する経路だけで行う。司令官はコードを編集しない。マージは人間 (op-merge 可)。
- Issue は起票しない。gap (ハーネスが自動でやらず手作業で補った工程) は完了報告と PR の op-review-state に載せ、`--grow` で還元する。
  検証中に見つかった Critical / High 級の不具合は報告に載せ、`/op-skill:op-report` を案内する。
- 他 skill との境界: op-adopt は未導入を診断して `--init` を案内するだけ。op-run / op-codev の自動の実機検証段は
  `skills/op-run/references/runtime-verify-dispatcher.md` が正本で、本 skill の通常モードも同じ dispatcher を使う。

## 起動

```
/op-skill:op-verify --init                                   # ハーネスの無い repo に導入する
/op-skill:op-verify [--pr <N> | --branch <name> | --checkout <path>] [--scenario "<確かめること>"]... [--windows]
                                                              # 実機検証 (対象省略時は現在の checkout の HEAD)
/op-skill:op-verify --grow [--pr <N> | --from <verify-runner の返却 JSON>]
                                                              # gap / regression spec 昇格候補をハーネスへ還元する
```

- `--windows` は通常モードで Windows 判定を明示的に当てる (ADR-0035 決定 6)。diff が `windows_paths` に当たらなくても Windows Sandbox を借りて検証する。
  `--init` / `--grow` では使わない。

## フェーズ0: 環境確認

`~/.claude/skills/_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」。GitHub I/O は `~/.claude/skills/_shared/github-channel.md` の channel 判定に従う。
`op verify --help` が失敗する op は古いので、plugin を更新するよう案内して終了する。

base を確定し、以降の fence ではリテラルで書く (`~/.claude/skills/_shared/bash-fence-convention.md`):

```bash
BASE_REF="$(op run base-sha | jq -r '.payload.base_ref | sub("^origin/"; "")')"
git fetch origin "$BASE_REF:refs/remotes/origin/$BASE_REF"
op run base-sha --base-ref "origin/$BASE_REF" | jq -r '.payload.base_sha'   # → BASE_SHA
```

`--init` / `--grow` は repo ルートの `op-config.yaml` の `verify_harness` を読む。
通常モードはここでは読まず、手順 1 で決めた checkout のルートで判定する (`--pr` の head にだけハーネスがある場合を取りこぼさないため)。

| `verify_harness` | `--init` | `--grow` |
|---|---|---|
| 無い | `--init` へ進む | `--init` を案内して終了 |
| ある | `op verify conformance` を実行する。pass なら「導入済み」と報告して終了。fail なら理由を示し、`--grow` と同じ apply で直すか人間に聞く | `--grow` へ進む |

テンプレートは `<skill_dir>/templates/` にある。skill_dir はこの skill の Base directory (Skill 読み込み時に表示される絶対パス)。
相対パスは plugin 配布では解決しないため、司令官が絶対パスに解決して expert に渡す。

| パス | 内容 |
|---|---|
| `templates/common/verify-harness.mjs` | start / stop / smoke の本体。run_id による namespace 化・PID の本人確認停止・実 bind ポートの照合・失敗時の自己回収を持つ (契約 §1〜§3) |
| `templates/web/stack.mjs` + `op-config.snippet.yaml` | Web: dev server を空きポートで起動し、Playwright のブラウザを解決する (`driver: playwright`) |
| `templates/tauri-linux/stack.mjs` + `op-config.snippet.yaml` | Tauri Linux: ビルド → Xvfb → tauri-driver (WebKitGTK)。`driver: webdriver`、capabilities を start の JSON の `webdriver_capabilities` で渡す |

## `--init`: ハーネスの導入

1. 診断 (read-only): `op-skill:feature-expert` を exploration-only で spawn する (model は Sonnet)。
   spawn prompt は `~/.claude/skills/_shared/spawn-prompt-common.md` §1〜§5 (§2 は exploration-only) と次を含める:

   ```
   ~/.claude/skills/_shared/verify-harness.md を Read し、この repo に契約どおりのハーネスを置くための材料を集める。
   返却 (JSON のみ):
     { "stack": "web | tauri | other",
       "targets": [ { "name": "<target 名>", "launch": "<起動コマンド>", "port_option": "<ポートの渡し方 (引数 / 環境変数)>",
                      "fixed_port_sources": ["<ポートを固定している箇所 file:line>"] } ],
       "auth": "<ログインが要るか、要るなら dev 用のログイン手段>",
       "playwright": "<依存にあるか・版>", "tauri": "<ビルドコマンドと実行ファイルのパス。tauri 以外は null>",
       "placement": "<scripts の置き場所の候補 (repo の慣習)>", "existing_e2e": "<既存 E2E の有無と置き場所>",
       "blockers": ["<テンプレートのままでは契約を満たせない事情>"] }
   ```

2. 導入計画を人間に提示して承認を得る: 使うテンプレート、置き場所 (既定 `scripts/verify/`)、target 名と起動コマンド、
   ポートの渡し方、認証の扱い、追加する依存 (Playwright が無ければ devDependency に足すか)、smoke で見る要素、
   `.gitignore` に足す行 (`.verify/`)。`stack: other` や `blockers` があれば、テンプレートでは足りない点を示して進め方を聞く。
   キャンセルならここで終了する。
3. apply (worktree):

   ```bash
   op run worktree create --task-prefix "verify-init" --base-ref "<BASE_REF>" --base-sha "<BASE_SHA>"
   # → payload の task_id / worktree_path / branch を控える
   ```

   `op-skill:feature-expert` を新規に spawn する (isolation は付けない。model は Opus = `model-selection.md` §5.3 の `integration`)。
   spawn prompt は `spawn-prompt-common.md` §1〜§5 (§2 は apply、フェーズ名 = verify-init-apply) と次を含める:

   ```
   作業ディレクトリ: <worktree_path> (branch <branch>、base <BASE_SHA>)。push はしない。
   指示書: 承認済みの導入計画 (下に貼る) が Issue 指示書に当たる。契約は ~/.claude/skills/_shared/verify-harness.md。
   手本: <skill_dir>/templates/common/verify-harness.mjs と <skill_dir>/templates/<web|tauri-linux>/ (絶対パス)。
     両方の .mjs を計画の置き場所へコピーし、stack.mjs の TODO を計画どおりに直す。op-config.snippet.yaml を op-config.yaml の
     verify_harness 節として足し、コマンドのパスを置き場所に合わせる。.gitignore に計画の行を足す。
   触ってよいもの: ハーネスのファイル、op-config.yaml の verify_harness 節、.gitignore、計画で承認された依存の追加。
     アプリのコードやポートの固定をやめるための変更が要るなら実施せず needs_human_decision で返す。
   検証: `op verify conformance --dir <worktree_path>` が exit 0 になるまで直す。最後の出力 JSON を完了報告に含める。
   完了報告は expert-spawn「修正完了報告 schema」(issue: null / cluster_id: "verify-init")。
   ```

4. 完了後は `~/.claude/skills/_shared/apply-completion-verify.md` に従う
   (`op apply verify-commit --worktree <worktree_path> --base-ref <BASE_REF> --reported-json '<commits_added>'`)。
   続けて司令官が `op verify conformance --dir <worktree_path>` を自分で実行し、exit 0 を確かめる (自己申告だけで PR にしない)。
   fail なら failures を添えて同じ expert に 1 回だけ戻す。それでも fail なら `op run worktree cleanup --task-id <task_id> --failure` して報告する。
5. PR: フェーズ「PR」の手順で作る。タイトルは `verify(init): <stack> harness`。

## 通常モード: 実機検証

1. checkout を決める。

   | 指定 | checkout |
   |---|---|
   | `--pr <N>` / `--branch <name>` | head を fetch し、`git worktree add --detach "$HOME/cwork/worktrees/<repo>/verify-<pr-N か branch>-<YYYYMMDD-HHMMSS>" <head SHA>` で作る (`skills/op-run/references/global-review-spawn.md` の review worktree と同じ作り方。fork PR は対象外) |
   | `--checkout <path>` | そのパス |
   | 省略 | 現在の checkout |

   checkout のルートの `op-config.yaml` の `verify_harness` を読む (dispatcher の起動条件の節と同じく検証対象 checkout の宣言で判定する)。
   無ければ `--init` を案内して終了する (作った worktree のパスは報告する)。

   `--pr` / `--branch` で作った worktree には依存が入っていないため、ハーネスを起動する前に checkout のルートで入れる。
   パッケージマネージャは lockfile で判定する (`~/.claude/skills/_shared/project-profile.md`「検証コマンド (スタック別)」):
   `pnpm-lock.yaml` → `pnpm install --frozen-lockfile` / `yarn.lock` → `yarn install --frozen-lockfile` / `package-lock.json` → `npm ci`。
   lockfile が無ければ入れない。失敗したら verify-runner を spawn せず、stderr の末尾を添えて `needs_human_decision` で報告する。
   `--checkout` と省略時は人間の checkout なので入れない。

2. scenarios を組む: `--scenario` があればそれ。無ければ PR 本文の `Fixes #N` の Issue の成功条件と diff から組み、人間に確認する。
   組めなければ空にする (verify-runner が diff の触れた画面の描画と主要操作だけを確かめる)。
3. dispatcher を controller = op-verify として使う (`skills/op-run/references/runtime-verify-dispatcher.md`)。
   - 起動条件の節の diff 判定はしない (人間が明示して起動したため)。ハーネスの有無の扱いは手順 1 で済んでいる
   - Windows 判定: `--windows` があるか、checkout の `verify_harness.runtime` が `windows` か、
     `git -C <checkout> diff --name-only <BASE_SHA>...HEAD` が `verify_harness.windows_paths` に当たれば当たりとする
   - 当たれば段全体を「lease → try { 検証 } finally { release }」の形で進める。手順と fence は同 dispatcher 1.1 と 4 章が正本で、ここでは書き直さない
     1. lease: 同 dispatcher 1.1 を `CHECKOUT=<checkout>`、`LEASE_HOLDER=opverify-<YYYYMMDD-HHMMSS>` (手順 4 の session と同じ値) で実行する
     2. try: `RV_LEASE_ABORT` が空なら verify-runner を spawn し、返却を下の順に処理する。空でなければ spawn せず、同 dispatcher 1.1 のとおり「結果が得られない」で記録して `RV_LEASE_ABORT` を報告に載せる
     3. finally: try がどの経路で終わっても、同 dispatcher 4 章 (保留 stop の引き取り → Windows の返却) を実行する。release の非 0 は報告に載せる
   - Sandbox 内で WebDriver と対象アプリを起動する手順が未配線のあいだは、借りられても windows_endpoint の WebDriver が応答しない。
     verify-runner はその分を `requires_runtime` (`windows unavailable`、未配線と分かる `detail` 付き) で返し、正当な skip として扱う
   - 当たらなければ lease を取らず、windows_endpoint も windows の理由も渡さない
   - verify-runner の spawn は同 dispatcher の spawn の節どおり (`subagent_type: "op-skill:verify-runner"`、model `opus`、Fable は使わない。windows_endpoint / windows の理由 / windows_provision も同節の表どおり)
   - 返却は同 dispatcher の skip の扱いの節 → 証跡の実在確認の節 → 保留 stop の引き取りの節の順に処理する
   - 結果の値は同 dispatcher の state 記録の節の表で 1 件に確定させる
4. 記録: `--pr` なら、同 dispatcher の op-run での結果の扱いの節の state push と同じ entry を PR の op-review-state に push する
   (write-id と session は `opverify-<YYYYMMDD-HHMMSS>`。label は遷移しない)。それ以外は完了報告だけに載せる。
5. 1 で作った worktree は残す (証跡が checkout 内に置かれうるため)。パスを報告し、片付けは人間 (`git worktree remove`) に任せる。

## `--grow`: ハーネスの育成

1. 候補を集める。
   - gap: `--from` の JSON の `gaps[]`、`--pr <N>` なら `op review state pull --pr <N>` の `post_checks["verify-runner"].gaps`、
     どちらも無ければこの会話の通常モードの完了報告の `gaps[]`
   - regression spec 昇格候補: `--from` の JSON かこの会話の通常モードの完了報告の `scenarios[]` のうち、人間が繰り返し確かめたいと言うもの
     (契約 §6: 昇格は人間の承認を経たものだけ。網羅的な spec スイートは作らない)。
     op-review-state の記録には `scenarios[]` が残らないため、`--pr` で起動してこの会話に通常モードの報告も無いときは gap だけを候補にする
2. 提示して選んでもらう:

   ```
   ## op-verify --grow 候補

   | id | 種別 | 工程 / シナリオ | 手作業で補ったこと | ハーネスに足すこと |
   |---|---|---|---|---|
   | G1 | gap | ... | ... | ... |
   | S1 | spec | ... | - | regression spec に昇格 |

   どれを還元しますか?  1. すべて  2. id を選択 (例: G1, S1)  3. キャンセル
   ```

3. apply: `--init` の 3〜4 と同じ手順 (task-prefix `verify-grow`、フェーズ名 verify-grow-apply、model は Sonnet = §5.3 の `extension`)。
   指示書は選ばれた候補の JSON。触ってよいものはハーネスのファイル・op-config.yaml の verify_harness 節・regression spec
   (既存 E2E の置き場所に置き、start 済みの run に対して通ることを確かめる)。conformance が exit 0 であることは同じく必須。
4. PR: タイトルは `verify(grow): <要約>`。

## PR

```bash
git -C "<worktree_path>" push origin "<branch>"
cat > "<worktree_path>.pr-body.md" <<'EOF'
<PR 本文>
EOF
op pr create --base "<BASE_REF>" --head "<branch>" --title "<タイトル>" --body-file "<worktree_path>.pr-body.md"
```

- 本文: stack とテンプレート、置き場所、`op verify conformance` の結果 (司令官が実行したもの)、還元した候補 (`--grow`)、実行した検証 Level。
- worktree は残す (`~/.claude/skills/_shared/worktree-ops.md`「cleanup タイミング」)。push か PR 作成に失敗したら `--failure` で隔離して報告する。

## 完了報告

```
## op-verify <init | 実機検証 | grow>
- 対象: <repo / PR #N / branch / checkout>
- 結果: <PR URL と conformance の結果 | pass / pass_with_notes / block / needs_human_decision / skipped (skip_reason)>
- シナリオ: <name: pass / fail (expected / actual / repro_steps)>
- 証跡: <実在を確かめたパス>
- 未検証の範囲: <requires_runtime の scope と reason>
- gap: <step / manual_workaround / suggestion> (あれば `/op-skill:op-verify --grow` を案内)
- stop / 後片付け: <stop の exit と stderr 末尾、Windows を借りたときは release の exit と `RV_LEASE_ABORT`、残した worktree のパス>
```
