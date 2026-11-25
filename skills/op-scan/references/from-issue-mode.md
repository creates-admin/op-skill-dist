# op-scan `--from-issue` モード (Issue 正規化)

人間立て Issue / 古い形式 Issue を、指示書フル版の派生 Issue として再起票する。
既存 Issue を起点に scope を推定 → audit → 再起票する逆向きフローで、severity フィルタは無効。

```
/op-skill:op-scan --from-issue #42
/op-skill:op-scan --from-issue #42 --auto
/op-skill:op-scan --from-issue #42 --domain debug
```

## 1. 元 Issue 取得

`gh api "repos/<owner>/<repo>/issues/$ISSUE_NUM" --jq '{title, body, state, pull_request, labels: [.labels[].name]}'` で取得する。
`pull_request` がある (PR の番号)・`closed`・`superseded-by-scan` ラベル付きならエラーで中断する (二重正規化防止)。

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
  name: "op-skill:op-scan-audit",
  args: {
    mode: "from-issue",
    scope: "<推定 scope>",
    experts: [ { name: "<expert>", model: "<model>" } /* , ... */ ],   // name は素の agent 名
    today: "<YYYY-MM-DD>",
    from_issue_number: <元 Issue 番号>,
    from_issue_title: "<元タイトル>",
    from_issue_body: "<元本文の全文>",
    // extra_directives: 固定文以外の追加指示があるときだけ渡す (任意)
  },
});
// auditOut.result.verdicts は [] (from-issue は refute しない)
```

severity 制約の緩和と引き続き禁止する事項は workflow の from-issue 分岐が固定で注入する。推定 scope は `scope` で渡す。

## 5. 派生 Issue 起票

- 対話モードは op-intake skill の `--from-issue` の入口で受け、手順 0 の作業ディレクトリを作って手順 2〜6 で起票する。`--auto` は `_shared/filing-gate.md` §2・§3 で起票する (派生 Issue は `--auto` でも起票する。`auto-policy.md`「例外」)。severity 例外は同 §1。
- `op scan dedup` で既存 open Issue と重複したら起票せず、元 Issue に「既存 #N と同等のため、そちらで進めてください」とコメントする。
- 本文は `issue-templates.md`「Issue 本文 (指示書フル版)」、marker は同「Issue 本文 hidden marker」。本文に「元 Issue: #<番号>」を自然文で書く。
- ラベル: `auto-report`、`derived-from-issue`、`severity:critical|high|medium|low|n/a`、元 Issue から継承できるもの (`module:xxx` / `bug` / `feature` 等)。
- 検出が複数なら、元 Issue の意図に最も近い 1 件だけを派生 Issue にする (元 1 : 派生 1)。
  他は通常の op-scan 起票として扱う (`derived-from-issue` なし、Critical/High のみ)。

## 6. 元 Issue へのコメント + ラベル

コメント本文 (`--body-file` で渡す):

> 🔍 op-scan が指示書フル版を #${NEW_ISSUE} として起票しました。
>
> この Issue は op-thread で実装可能な形式に正規化された派生 Issue (#${NEW_ISSUE}) に
> 置き換えられます。今後の議論・実装は派生 Issue 側で進めてください。

```bash
op issue comment "$ISSUE_NUM" --body-file "<tmp>"
op issue edit-labels "$ISSUE_NUM" --add "superseded-by-scan"
```

- 元 Issue は close しない (close は人間が判断する)。

## 7. 完了報告

元 Issue (superseded-by-scan 付与済み) / 推定 scope とその信号 / 起動 expert / 派生 Issue / 副次検出を列挙する。対話モードは op-intake 手順 6 の表に添える。
