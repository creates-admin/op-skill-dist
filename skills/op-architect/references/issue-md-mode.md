# op-architect `--issue-md` モード

`--issue-md` 指定時、またはユーザー確認のうえ起票失敗から切り替えた場合に、Issue を起票せず Markdown に書き出す。

```
docs/issues/initial/
├── 001-skeleton-tauri-vue.md
├── 002-db-sqlite-schema.md
└── ...
```

各ファイルはフェーズ5-1 と同じ本文に、YAML フロントマターでタイトル・ラベル・依存を持たせる:

```markdown
---
title: "スケルトン: Tauri + Vue プロジェクト雛形作成 (initial)"
labels: [auto-report, op-architect, pro-feature-expert, milestone:initial, module:bootstrap]
depends_on: []   # ファイル名で参照 (例: ["001-skeleton-tauri-vue"])
---

## 概要
...
```

- 番号が無いので `op-depends-on` marker は書かず、依存はフロントマターの `depends_on` と `## 依存` (ファイル名) で表す。
- 書き出し前にフェーズ5-3 と同じ起票予定表を提示して承認を得る。
- 利用者は後から手動で起票するか、別の op-architect / エージェントに起票させる。
