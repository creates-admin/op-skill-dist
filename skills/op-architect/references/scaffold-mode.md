<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 (2026-07-29): ADR-0029 Wave B1 で SKILL.md フェーズ4.5 本文から移動 (内容変更なし、verbatim 転記)。
       `--scaffold` 指定時のみ発火する特殊モードであり、デフォルト対話経路では一度も読まれないため
       references/ へ退避。SKILL.md 本文にはフェーズ番号のみ空けたポインタを残す。
-->

<!--
機能概要: `--scaffold` 指定時のみ実行する、プロジェクト雛形生成フェーズ (フェーズ4.5) の全手順。
作成意図: `--scaffold` はデフォルト対話経路では通らない opt-in モードであり、
          本文に置くと `--scaffold` を使わないセッションでも毎回死蔵コンテキストになるため分離。
注意点: 内容は SKILL.md からの verbatim 移動。フェーズ番号「4.5」および内部の
        「4.5-1〜4.5-5」節番号は SKILL.md フェーズ4/4.6 との対応を保つため変更しない。
        「司令官はコードを書かない」原則の例外 (feature-expert 経由でのみ許可) はこのファイルの
        契約であり、変更する場合は CLAUDE.md 側の同原則との整合を確認すること。
-->

# op-architect フェーズ4.5: スケルトン雛形生成 (`--scaffold` モード時のみ)

**いつ読むか**: `/op-architect --scaffold` で起動された場合のみ。フェーズ4 (マイルストーン分解・承認) の
直後、フェーズ4.6 (Design Plan gate) より前に実行する。`--scaffold` 未指定ならこのファイルは読まず
フェーズ4 → フェーズ4.6 (または フェーズ5) へ直接進む。

`--scaffold` 指定時は、Issue 起票の前に**プロジェクト雛形 (1 番目のマイルストーン相当)** を司令官が `feature-expert` に委譲して直接生成する。`op-run` の起動・PR レビューサイクルを 1 周省略でき、ゼロイチで「とにかく動く骨格」が必要なケース向け。

## 4.5-1. 雛形生成の判断

司令官は以下のチェックを通過した場合のみ進む:

- フェーズ4 で **1 番目のマイルストーンがスケルトン系**であること (`scope_in` がプロジェクト全体構成・Cargo.toml / package.json / pubspec.yaml 等)
- 関連 ADR が確定済みであること (技術スタック・主要ライブラリ・ディレクトリ方針)
- ユーザーが対話の中で `--scaffold` を改めて承認していること

## 4.5-2. feature-expert への委譲

```
Agent({
  subagent_type: "op-skill:feature-expert",
  description: "scaffold initial project skeleton",
  prompt: """
    invocation_mode: op_managed

    op-architect から呼ばれた OP-managed Mode 起動です。
    新規プロジェクトの**最小スケルトン**を生成してください。

    共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added):
    `~/.claude/skills/_shared/spawn-prompt-common.md (>=1)` §1〜§4 を参照。
    本フェーズは scaffold apply のため commits_added: [SHA, ...] (1 件以上) を完了報告に必ず含める。

    【プロジェクト種別】
    <Tauri v2 + Vue 3 等>

    【確定 ADR (要旨)】
    - ADR-0001: <タイトル> → <要旨>
    - ADR-0002: <タイトル> → <要旨>
    ...

    【スケルトンの範囲】
    - プロジェクトルートの構成ファイル (Cargo.toml / package.json / pubspec.yaml / vite.config.ts 等)
    - 最小限のエントリポイント (main.rs / main.dart / src/main.ts / App.vue 等)
    - ディレクトリ骨組み (空または README.md だけのディレクトリ)
    - .gitignore / README.md (1 ページ程度)
    - ロギング・エラーハンドリングの最小設定 (ADR で決まっていれば)

    【含めないもの】
    - 業務ロジック (それは後続マイルストーンで実装)
    - DB スキーマ (別マイルストーン)
    - 認証実装 (別マイルストーン)
    - 詳細 UI (別マイルストーン)

    【検証】
    `_shared/project-profile.md` の Static / Build レベルが pass すること:
    - cargo check / cargo fmt / cargo clippy
    - pnpm install && pnpm typecheck && pnpm build
    - flutter analyze
    で構文エラーが出ない最小状態を作る。

    【手順】
    1. 雛形ファイルを作成
    2. 検証コマンドを実行し、pass を確認
    3. `git add` + commit (メッセージ: `chore(skeleton): プロジェクト雛形を生成 (op-architect)`)
    4. 生成ファイル一覧と検証結果を報告

    【完了条件】
    - 検証コマンドが pass
    - 残マイルストーン (#2 以降) が依拠できる骨格になっていること
    - CLAUDE.md 規約 (ネスト・コメント方針) に準拠
  """
})
```

## 4.5-3. 残マイルストーンの依存関係更新

雛形が commit されたら、フェーズ5 で起票する残 Issue (#2 以降) の `depends_on` から「スケルトン Issue」を外し、`## 関連` 節に**「スケルトンは commit `<sha>` で完了済み」** と注記する。スケルトン Issue 自体はフェーズ5 でも起票せず、ADR 文書とコミットログに記録を残すのみ。

## 4.5-4. 失敗時の扱い

検証コマンドが fail したら司令官は雛形生成を **rollback せず**、生成済み差分を残したまま:

- ユーザーに失敗内容と feature-expert の出力を提示
- 続行 (差分を残したまま手動修正へ) / Issue 化 (op-run へ移譲) のいずれかをユーザーが選択

`--scaffold` を選んだ意図は速度なので、雛形 fail でも自動 rollback で振り出しに戻すのは望ましくない。

## 4.5-5. feature-expert が利用できない場合

`feature-expert` agent が未配置 / spawn 失敗の場合は、`--scaffold` を **自動的に取り下げ** (デフォルトモードに格下げ) てユーザーに通知する。司令官が直接スケルトンを書くことは禁止 (司令官はコードを書かない原則を守る):

```
⚠️ feature-expert が利用できないため、--scaffold を取り下げました。
スケルトンはマイルストーン #1 として Issue 化します (フェーズ5 へ進みます)。
```

ユーザーが「司令官が直接書いてよい」と明示承認した場合のみ、司令官が雛形を書く例外を許可する。
