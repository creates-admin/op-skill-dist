# scout の報告からの起票

`--report` 入口 (op-report を含む) の手順 3・5・6 の足し。対象は scout の `result` が `confirmed` の Task だけ。
添字 → Task No. の対応表を手順 3 の前に作る (drafts.json は Task No. 順)。

## 手順 3 の足し: 重複の振り分け

- `MISSING_REQUIRED_INPUT` は `warnings` の指摘どおり drafts.json を直して再実行する (手作業の検索で代替しない)。
- `decision == "block"` は次の順で振り分ける:
  - `matched_draft` あり → 起票せず `merged`。統合先は `matched_draft.draft_index` を対応表で引き直した Task。
  - `matched_existing` あり → `match_priority` が 1〜3 は起票せず `duplicate`。`match_priority == 4` は下の「類似の確認」。
  - どちらも無い → 手順 3 の 2 の中断に代えて、その draft だけ起票せず `failed` (`blocking_reasons` を添える)。
- `matched_draft` が返らず `details.results[i].fingerprint` が他の draft と完全一致する draft は、Task No. が最小のものを残し、残りは `merged` にする。

### 類似の確認

`matched_existing.match_priority == 4` の draft (`merged` のものは代表の判定を引き継ぐので対象外) は、手順 4 の一覧に
`| No. | タイトル案 | 類似する既存 Issue (#N タイトル) |` の表で並べ、起票する番号を聞く。指定されなかった draft は `similar_skipped` にする。

## 手順 4 の足し: 本文の見せ方

controller は本文を Read しない。Project の承認のファイルには本文を `cat` で連結して入れ、Project の外ではファイルのパスを示す。

## 手順 5 の足し: fingerprint の差し込み

本文ファイルは scout が書いた `<INTAKE_DIR>/draft-<No>.md`。controller は Read も書き換えもせず、dedup の envelope の fingerprint を先頭に差し込む:

```bash
test -s "<INTAKE_DIR>/draft-<No>.md" &&
  { printf '<!-- op-fingerprint: %s -->\n' "<details.results[i].fingerprint>"; cat "<INTAKE_DIR>/draft-<No>.md"; } > "<INTAKE_DIR>/draft-<No>.final.md"
```

`draft-<No>.final.md` を手順 5 の marker-lint と `op issue create` に渡す。本文が無い・空、または marker-lint が `pass` 以外なら `lint_blocked`、起票の失敗は `failed`。

## 手順 6 の足し: 結果の伝え方

| result | 出どころ | 伝え方 |
|---|---|---|
| `filed` | 手順 5 | 「起票しました: <Issue URL>」 |
| `duplicate` | 手順 3 | 「既存 Issue と重複しています: #<matched_existing.issue_number>」 |
| `similar_skipped` | 類似の確認 | 「タイトルが類似する既存 Issue #<N> (<existing_title>) があるため見送りました」 |
| `merged` | 手順 3 | 「No.<統合先> と同じ内容のため 1 件にまとめました。統合先の結果: <統合先の伝え方をそのまま埋め込む>」 |
| `lint_blocked` / `failed` | 手順 3・5 | 「起票できませんでした: <blocking_reasons / エラーを 1 行>」 |
| `not_confirmed` | scout | 「実在確認できませんでした: <evidence を 1〜2 行に要約>」 |
| `needs_human_decision` | scout | 「判断が必要です: <options を箇条書き>」→ 人に選んでもらう |

複数の Task は `| No. | 概要 | result | URL / 補足 |` の 1 つの表にする。
