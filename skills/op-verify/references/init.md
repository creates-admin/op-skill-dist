# op-verify `--init` の手順

## テンプレート

テンプレートは `<skill_dir>/templates/` にある。skill_dir はこの skill の Base directory (Skill 読み込み時に表示される絶対パス)。
相対パスは plugin 配布では解決しないため、司令官が絶対パスに解決して expert に渡す。

| パス | 内容 |
|---|---|
| `templates/common/verify-harness.mjs` | start / stop / smoke の本体。run_id による namespace 化・PID の本人確認停止・実 bind ポートの照合・失敗時の自己回収を持つ (契約 §1〜§3) |
| `templates/common/verify-skill.md` | 対象 repo の `.claude/skills/verify/SKILL.md` のひな形 (契約 §8)。冒頭のコメントに置き換える値がある |
| `templates/web/stack.mjs` + `op-config.snippet.yaml` | Web: dev server を空きポートで起動し、Playwright のブラウザを解決する (`driver: playwright`) |
| `templates/tauri-linux/stack.mjs` + `op-config.snippet.yaml` | Tauri Linux: ビルド → Xvfb → tauri-driver (WebKitGTK)。`driver: webdriver`、capabilities を start の JSON の `webdriver_capabilities` で渡す |

## 手順

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
   `.gitignore` に足す行 (`.verify/`)、`.claude/skills/verify/SKILL.md` を置くこと (既にあれば上書きせず、ハーネスを呼ぶ手順との差分を示す。`.claude/` が gitignore されていれば `!.claude/skills/verify/` の例外を足す)。`stack: other` や `blockers` があれば、テンプレートでは足りない点を示して進め方を聞く。
   キャンセルならここで終了する。
3. apply (worktree):

   ```bash
   op run worktree create --task-prefix "verify-init" --base-ref "<BASE_REF>" --base-sha "<BASE_SHA>"
   # → payload の task_id / worktree_path / branch を控える
   ```

   `<skill_dir>` は「テンプレート」のとおり絶対パスに解決して渡す。
   `op-skill:feature-expert` を新規に spawn する (isolation は付けない。model は Opus = `model-selection.md` §5.3 の `integration`)。
   spawn prompt は `spawn-prompt-common.md` §1〜§5 (§2 は apply、フェーズ名 = verify-init-apply) と次を含める:

   ```
   作業ディレクトリ: <worktree_path> (branch <branch>、base <BASE_SHA>)。push はしない。
   指示書: 承認済みの導入計画 (下に貼る) が Issue 指示書に当たる。契約は ~/.claude/skills/_shared/verify-harness.md。
   手本: <skill_dir>/templates/common/verify-harness.mjs と <skill_dir>/templates/<web|tauri-linux>/ (絶対パス)。
     両方の .mjs を計画の置き場所へコピーし、stack.mjs の TODO を計画どおりに直す。op-config.snippet.yaml を op-config.yaml の
     verify_harness 節として足し、コマンドのパスを置き場所に合わせる。.gitignore に計画の行を足す。
     <skill_dir>/templates/common/verify-skill.md を .claude/skills/verify/SKILL.md へコピーし、冒頭のコメントどおりに値を
     verify_harness の宣言から埋めてコメントを消す (既にあるファイルは計画で承認された差分だけ直す)。
   触ってよいもの: ハーネスのファイル、op-config.yaml の verify_harness 節、.gitignore、.claude/skills/verify/SKILL.md、計画で承認された依存の追加。
     アプリのコードやポートの固定をやめるための変更が要るなら実施せず needs_human_decision で返す。
   検証: `op verify conformance --dir <worktree_path>` が exit 0 になるまで直す。最後の出力 JSON を完了報告に含める。
   完了報告は expert-report-schemas.md「修正完了報告 schema」(issue: null / cluster_id: "verify-init")。
   ```

4. 完了後は `~/.claude/skills/_shared/apply-completion-verify.md` に従う
   (`op apply verify-commit --worktree <worktree_path> --base-ref <BASE_REF> --reported-json '<commits_added>'`)。
   続けて司令官が `op verify conformance --dir <worktree_path>` を自分で実行し、exit 0 を確かめる (自己申告だけで PR にしない)。
   `.claude/skills/verify/SKILL.md` も Read し、先頭が `name: verify` の frontmatter で、`{{` とひな形のコメントが残っておらず、
   コマンドが `verify_harness` の start / smoke / stop と一致し、`git -C <worktree_path> ls-files --error-unmatch .claude/skills/verify/SKILL.md` が exit 0 であることを確かめる。
   fail なら failures を添えて同じ expert に 1 回だけ戻す。それでも fail なら `op run worktree cleanup --task-id <task_id> --failure` して報告する。
5. PR: SKILL.md の「PR」の手順で作る。タイトルは `verify(init): <stack> harness`。

verify SKILL.md は `verify_harness` に start / stop / smoke があるときだけ扱う (`verify-harness.md` §8)。

## verify SKILL.md だけを足す

1. ひな形を `verify_harness` の宣言で埋めた案を人間に示して承認を得る (gitignore の例外が要ればそれも)。キャンセルならここで終了する。
2. apply: 「手順」の 3 と同じ手順 (task-prefix `verify-skill`、フェーズ名 verify-skill-apply、model は Sonnet = §5.3 の `extension`)。
   指示書は承認した案。ハーネスと op-config.yaml は触らず、触ってよいものは `.claude/skills/verify/SKILL.md` と `.gitignore` の例外の行だけ。
3. 「手順」の 4 の確認をする。
4. PR: タイトルは `verify(skill): add verify SKILL.md`。
