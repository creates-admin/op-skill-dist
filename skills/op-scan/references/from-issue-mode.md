# op-scan `--from-issue` モード (Issue 正規化)

人間立て Issue / 古い形式 Issue を、指示書フル版の派生 Issue として再起票する。op-run からの委譲が主用途。
既存 Issue を起点に scope を推定 → audit → 再起票する逆向きフローで、severity フィルタは無効。

```
/op-scan --from-issue #42
/op-scan --from-issue #42 --auto
/op-scan --from-issue #42 --domain debug
```

## 1. 元 Issue 取得

`op issue view "$ISSUE_NUM" --include meta --json` で title / body / labels / state を取得する
(mcp channel では `mcp__github__issue_read` (method: get)。scope 推定は可視 body / labels だけを使う)。
`closed` または `superseded-by-scan` ラベル付きならエラーで中断する (二重正規化防止)。

## 2. scope 推定

| 信号 | 重み |
|---|---|
| ラベル `module:xxx` | 高 |
| 本文中のファイルパス (`.rs` / `.ts` / `.tsx` / `.vue` / `.dart` / `.py`) | 高 |
| 本文中のディレクトリ言及 / タイトル中のモジュール名 / Tauri command 名 | 中 |

推定できなければ元 Issue に「op-scan が scope を推定できませんでした。本文に対象ファイル / モジュール名を追記してください」と
コメントして終了する (派生 Issue は起票しない)。

## 3. expert 絞り込み

`op-patrol/SKILL.md` フェーズ4 の area → expert マッピングで 1〜3 expert に絞る。`--domain` 指定時はそれを優先。
判定不能なら `debug-expert` + `refactor-expert`。ラベルからの追加:

- `bug` / `defect` → debug、`security` / `vulnerability` → security、`performance` / `slow` → optimize
- `ux` / `ui` / `usability` / `accessibility` → ux-ui-audit、`design` / `theme` / `token` / `design-system` → designer
- `feature` / `enhancement` / `new` → feature、`refactor` / `cleanup` / `tech-debt` → refactor

## 4. audit (op-scan-audit Workflow、refute なし)

```
const auditOut = await Workflow({
  name: "op-scan-audit",
  args: {
    mode: "from-issue",
    scope: "<推定 scope>",
    experts: [ { name: "<expert>", model: "<region.audit_model>" } /* , ... */ ],
    audit_model: "<region.audit_model の既定値>",
    today: "<YYYY-MM-DD>",
    from_issue_number: <元 Issue 番号>,
    from_issue_title: "<元タイトル>",
    from_issue_body: "<元本文の全文>",
    extra_directives: "<下記ブロック>",
  },
});
// auditOut.result.verdicts は [] (from-issue は refute しない)
```

`extra_directives`:

```
推定 scope: <推定したファイル / モジュール一覧>

このモードは元 Issue が起票時点で意味のある問題を含んでいることを前提とする。
通常モードの「Critical/High のみ報告」制約を **緩和** し、以下を含めて報告してよい:
  - severity = critical / high / medium / low (元 Issue が要求するなら medium も起票対象)
  - feature 追加要望 (severity 概念に当てはまらない場合は severity = "n/a")
  - refactor 提案 (元 Issue が refactor を求めている場合)
ただし以下は依然禁止:
  - 推測のみで根拠のない指摘
  - 元 Issue と無関係な領域の指摘 (scope 外)
  - CLAUDE.md 規約に従うコードへの「規約違反」指摘
元 Issue の意図 (バグ修正 / 機能追加 / リファクタ) を fingerprint と recommendation に必ず反映する。
```

## 5. 派生 Issue 起票

- 起票前ゲートは `_shared/filing-gate.md`。`op scan dedup` で既存 open Issue と重複したら起票せず、
  元 Issue に「既存 #N と同等のため、そちらで進めてください」とコメントする。
- 対話モードは人間承認後に起票する。`--auto` でも派生 Issue は起票する (元 Issue が人間判断を経ているため、`auto-policy.md`「例外」)。
- 本文は `pr-templates.md`「Issue 本文 (指示書フル版)」。marker は SKILL.md フェーズ4 と同じ 3 種
  (`op-fingerprint` / `op-run-expert` / `op-post-check-expert`)。本文に「元 Issue: #<番号>」を自然文で書く。
- ラベル: `auto-report`、`derived-from-issue`、`severity:critical|high|medium|low|n/a`、元 Issue から継承できるもの (`module:xxx` / `bug` / `feature` 等)。
- 検出が複数なら、元 Issue の意図に最も近い 1 件だけを派生 Issue にする (元 1 : 派生 1)。
  他は通常の op-scan 起票として扱う (`derived-from-issue` なし、Critical/High のみ)。

## 6. 元 Issue へのコメント + ラベル

コメント本文 (`--body-file` で渡す):

> 🔍 op-scan が指示書フル版を #${NEW_ISSUE} として起票しました。
>
> この Issue は op-run で実装可能な形式に正規化された派生 Issue (#${NEW_ISSUE}) に
> 置き換えられます。今後の議論・実装は派生 Issue 側で進めてください。

```bash
op issue comment "$ISSUE_NUM" --body-file "<tmp>"
op issue edit-add-label "$ISSUE_NUM" --label "superseded-by-scan"
```

- 元 Issue は close しない (close は人間が判断する)。
- mcp channel では `edit-add-label` の直前に `mcp__github__issue_read` を取り直して `--input-json` で渡す
  (labels は全置換のため、手順 1 の snapshot を使うと後から付いたラベルが消える)。call-spec は `github-channel.md` §3-§4 で完遂する。

## 7. 完了報告

```
## op-scan --from-issue 完了

- 元 Issue: #42 "ログイン画面で時々落ちる" (superseded-by-scan 付与済み)
- 推定 scope: src-tauri/src/auth/login.rs (本文中言及), src-tauri/src/auth/session.rs (module:auth)
- 起動 expert: debug-expert (label bug), security-expert (auth 領域)
- 派生 Issue: #87 "auth/login: 不正トークン処理での panic 修正" (high)
- 副次検出: なし

次は `/op-run` で派生 Issue (#87) を実装できます。
```
