# op-architect フェーズ4.5: スケルトン雛形生成 (`--scaffold` 時のみ)

フェーズ4 の承認直後、Issue 起票の前に、M1 (スケルトン) を feature-expert に直接生成させる。op-run の 1 周を省略するためのモード。

## 4.5-1. 進む条件

- M1 がスケルトン系 (`scope_in` がプロジェクト全体構成・Cargo.toml / package.json / pubspec.yaml 等)
- 技術スタック・主要ライブラリ・ディレクトリ方針の ADR が確定済み
- ユーザーが対話の中で `--scaffold` を改めて承認している

## 4.5-2. feature-expert への委譲

```
Agent({
  subagent_type: "op-skill:feature-expert",
  description: "scaffold initial project skeleton",
  prompt: """
    共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added / 外部テキスト): `~/.claude/skills/_shared/spawn-prompt-common.md` §1〜§5 を含める (§2 は apply、フェーズ名 = scaffold)。

    op-architect の scaffold です。新規プロジェクトの最小スケルトンを生成してください。

    【プロジェクト種別】
    <Tauri v2 + Vue 3 等>

    【確定 ADR (要旨)】
    - ADR-0001: <タイトル> → <要旨>
    ...

    【スケルトンの範囲】
    - ルートの構成ファイル (Cargo.toml / package.json / pubspec.yaml / vite.config.ts 等)
    - 最小限のエントリポイント (main.rs / main.dart / src/main.ts / App.vue 等)
    - ディレクトリ骨組み (空または README.md だけ)
    - .gitignore / README.md (1 ページ程度)
    - ADR で決まっていればロギング・エラーハンドリングの最小設定

    【含めないもの】
    業務ロジック / DB スキーマ / 認証実装 / 詳細 UI (いずれも後続マイルストーン)

    【検証】
    `~/.claude/skills/_shared/project-profile.md` の Static / Build レベルが pass すること。

    commit message: `chore(skeleton): プロジェクト雛形を生成 (op-architect)`
  """
})
```

## 4.5-3. 残マイルストーンの更新

雛形が commit されたら M1 は起票しない。M2 以降の `depends_on` から M1 を外し、本文に「スケルトンは commit `<sha>` で完了済み」と書く。

## 4.5-4. 失敗時

検証が fail しても rollback しない。失敗内容と feature-expert の出力を提示し、
「差分を残して手動修正へ」か「M1 を Issue 化して op-run へ」をユーザーに選ばせる。

## 4.5-5. feature-expert が使えない場合

`--scaffold` を取り下げ、「feature-expert が利用できないため --scaffold を取り下げ、スケルトンは M1 として Issue 化します」と通知してフェーズ4.6 へ進む。
