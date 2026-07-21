<!--
schema_version: 1
last_breaking_change: 2026-05-21
notes: v1 (2026-05-21) — 初版。op-run フェーズ 1.5 (Issue 健全性チェック) の
       threshold / symptom keyword list / structure section 判定 /
       parse 正規表現 / classification matrix を決定論化した正本。
       SKILL.md フェーズ 1.5 への反映は op-run wave 全面書き換え時に持ち越す (Fixes #260)。
       Rust 実装 (op-core::run::issue_health) との 1:1 一致を不変則とする。
-->

# Issue 健全性判定ポリシー (issue-health-policy)

<!--
機能概要: op-run フェーズ 1.5 の Issue 健全性判定 (complete / partial / insufficient) の
         threshold / keyword / section 判定 / classification matrix を集約する正本。
作成意図: op-run/SKILL.md フェーズ 1.5 に健全性判定の決定論的基準が存在しなかったため、
         Rust CLI (op run issue-health) 実装に合わせて明文化する。
         prose と Rust 実装の drift を防ぐため、変更は必ず両方に同期する。
注意点: classification matrix の全 9 セルは Rust テスト (op-core/tests/run_issue_health.rs)
        で網羅される。matrix の変更は schema_version bump + テスト更新が必要。
-->

## 1. 入力スキーマ

```json
{
  "issue_number": <整数>,
  "title": "<Issue タイトル>",
  "body": "<Issue 本文 (markdown 全文)>",
  "labels": ["<ラベル名>", ...]
}
```

フィールドはすべて必須。`body` が空文字列の場合は `insufficient` 判定 (fail-closed)。

## 2. 出力スキーマ

```json
{
  "version": 1,
  "payload": {
    "health": "complete|partial|insufficient",
    "missing_sections": ["概要", "触ってよいファイル", "完成定義"],
    "word_count": <整数>,
    "char_count": <整数>,
    "next_action": "implement|delegate_to_op_scan|return_to_author",
    "rationale": "<判定理由の説明>"
  }
}
```

`health` と `next_action` の対応:

| health | next_action |
|--------|-------------|
| `complete` | `implement` |
| `partial` | `delegate_to_op_scan` |
| `insufficient` | `return_to_author` |

## 3. threshold 表

| 指標 | 境界値 | 判定方向 |
|------|--------|---------|
| word count | `>= 30` | 30 未満で質的 threshold 不足とみなす |
| char count | `>= 100` | 99 以下で `insufficient` 確定 (fail-closed) |

**fail-closed 規則**:

- `char_count < 100` の場合、他の指標に関わらず必ず `insufficient` を返す。
- `word_count < 30` の場合、symptom keyword および section 充足と組み合わせて判定を下げる方向で使う (下記 matrix 参照)。

`word_count` 算出: 本文全体を whitespace (スペース・タブ・改行) で分割して非空トークン数を数える。

`char_count` 算出: Unicode コードポイント単位の文字数。Rust では `body.chars().count()` を使う。

## 4. 「症状記述あり」keyword 判定

以下のキーワードのいずれかが body または title に含まれる場合に「症状記述あり」と判定する。
大文字・小文字は区別しない (`to_lowercase()` で正規化)。

### 症状 keyword リスト (固定 enum — 拡張は別 PR)

```
エラー
落ちる
動かない
動作しない
失敗
クラッシュ
パニック
想定
期待
おかしい
ならない
できない
しない
でない
壊れ
壊れる
```

英語 keyword (大文字小文字不問):

```
error
fail
failed
failure
crash
panic
broken
wrong
unexpected
not working
doesn't work
```

### 判定ロジック

```
symptom_present = body.to_lowercase() + " " + title.to_lowercase()
                  に上記 keyword のいずれかが含まれる
```

## 5. 「指示書節欠損」判定

以下の 3 セクション見出しを「必須構造節」と定義する。

| 節名 | 必須 |
|------|------|
| `概要` | はい |
| `触ってよいファイル` | はい |
| `完成定義` | はい |

### parse 対象正規表現 (見出し h1 / h2 / h3 両対応)

各節の存在を検出するために以下の正規表現を使う。行頭マッチ (`^` または `\n` の後)。

```
# または ## または ### に続いて 概要 / 触ってよいファイル / 完成定義 を含む行
```

Rust での正規表現例:

```rust
// 概要
Regex::new(r"(?m)^#{1,3}\s*概要").unwrap()

// 触ってよいファイル
Regex::new(r"(?m)^#{1,3}\s*触ってよいファイル").unwrap()

// 完成定義
Regex::new(r"(?m)^#{1,3}\s*完成定義").unwrap()
```

欠落した節は `missing_sections` 配列に名前を入れて返す。

### 節充足スコア

| 充足節数 | 節充足レベル |
|---------|------------|
| 3/3 | `full` |
| 1/3 または 2/3 | `partial` |
| 0/3 | `empty` |

## 6. classification matrix (3×3)

行: symptom_level (symptom keyword の有無)
列: section_level (節充足レベル)

|  | section: full | section: partial | section: empty |
|--|---------------|-----------------|----------------|
| **symptom: present** | `complete` | `partial` | `partial` |
| **symptom: absent** | `partial` | `partial` | `insufficient` |

**ただし fail-closed 規則が最優先**:

`char_count < 100` の場合、matrix の結果に関わらず `insufficient` を上書きする。

`word_count < 30` の場合、matrix の結果を 1 段階下げる方向で適用する:
- `complete` → `partial`
- `partial` → `insufficient`
- `insufficient` → `insufficient` (変化なし)

### 判定手順 (step by step)

1. `char_count` を計算。`< 100` なら即 `insufficient` を返す (以降 step 不要)。
2. `word_count` を計算。
3. symptom keyword を検出 → `symptom_present: bool`。
4. 各必須節を正規表現で検出 → `missing_sections: Vec<String>`。
5. `section_level` を算出 (3 - missing_sections.len() で充足節数 → full/partial/empty)。
6. matrix で `raw_health` を決定。
7. `word_count < 30` なら `raw_health` を 1 段階 down-grade。
8. 最終 `health` を返す。

## 7. `rationale` フィールドの生成

`rationale` はデバッグ・監査用の説明文。以下の情報を日本語 1〜3 文で含む。

- `char_count` / `word_count` の実測値
- `missing_sections` があれば列挙
- symptom keyword の有無
- `char_count < 100` / `word_count < 30` のダウングレードが発生した場合はその旨

例:
```
「本文 45文字 / 12単語 — char_count < 100 のため fail-closed で insufficient。missing_sections: [概要, 触ってよいファイル, 完成定義]」
```

## 8. 既存 Issue との互換性

本ポリシー v1 は **現在の Issue に retroactively insufficient 判定を与えることを想定していない**。
op-run フェーズ 1.5 での使用時は、op-run controller が「op-source marker あり」Issue を
fully-instructed として先に除外してから本 CLI に渡す運用を想定する。

sanity check: `gh issue list` で取得した Issue 群を流したとき、100% が insufficient になる場合は
policy の keyword リストまたは threshold が過剰に厳しい可能性を検討する。

## 9. バージョン管理

本ファイルを変更する場合:

- `schema_version` を bump する
- `last_breaking_change` を更新する
- `notes` に変更内容を記録する
- Rust 実装 (`op-core::run::issue_health`) のテストを更新し、1:1 一致を再確認する
- `op-tools/docs/implementation-order.md` の `_shared/issue-health-policy.md` への参照を確認する
