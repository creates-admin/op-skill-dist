# Dynamic Workflow 呼び出し規約 (正本)

各 SKILL.md は本ファイルへの pointer + skill 固有の args / 戻り値フィールドのみを書く。
各 workflow の args / 戻り値 schema の正本は `workflows/op-*.js` 冒頭コメント + `workflows/README.md`。

## §1 capability preflight (hard-fail)

workflow を呼ぶ OP skill は、フェーズ0 で Workflow tool が利用可能かを確認する。利用不可なら即停止し、
旧機構 (single-message spawn 等) へフォールバックしない。workflow を呼ばないモード
(例: op-scan `--from-merged-pr`) では skip してよい。

利用不可時の復旧案内:

> この skill は `<workflow 名>` Dynamic Workflow に依存します。現在のセッションで Dynamic Workflows が
> 利用できません。`claude plugin list` で `op-skill` plugin が `✔ loaded` か確認し、loaded なら
> 新規セッションを開いて SessionStart hook による `~/.claude/workflows/` 再 staging を待ってください
> (ADR-0023)。loaded でなければ plugin の再インストールが必要です。

## §2 戻り値 unwrap: chat-controller は `.result.*` を掘る

controller が Workflow tool を呼ぶと background task として起動し、戻り値は
`{ summary, logs, result: <script の return 値>, agentCount }` にラップされる。`out.findings` 等の
直アクセスは undefined になる。in-script (named workflow 内) の同期戻り値はラップされない。

```
const out = await Workflow({ name: "op-scan-audit", args: { /* ... */ } });
const r = out.result ?? out;   // 以降 r.findings 等を読む
```

戻り値が barrier (全 spawn 完了後に返る)。`run_in_background` + Monitor 待ち合わせは不要、
並列上限のキューイングも runtime が担うので controller は人為 cap しない。

## §3 SKIPPED_PLANNED / silent 除外禁止

- `op core registry-verify --lens registry-agent` で除外された planned / 未登録 expert は
  workflow args の expert list に含めない。
- 除外した expert は `SKIPPED_PLANNED` に保持し、最終報告サマリに必ず併記する。
- fallback (司令官 fallback scan 等) に切り替えた場合も、その事実をサマリと最終報告の両方に明示する。

## §4 args 渡し規約

- bare object で渡す (`args: { ... }`)。`JSON.stringify` した文字列を渡さない
  (script 側 `normalizeArgs()` は両対応だが bare object が正)。
- 必須フィールド欠落は `normalizeArgs()` が throw する。controller は呼び出し前に必須 args を揃える。
- per-run の動的値は controller が確定して注入する: `today` は `date -u +%F`、model は
  `model-selection.md` で確定。workflow / agent 側で `date` 実行・推測をしない。
- markdown を含む string (Issue body 等) はそのまま渡してよい。
