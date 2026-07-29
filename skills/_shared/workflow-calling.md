<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 初版 (breaking change なし)。各 SKILL.md に重複転写されていた Dynamic Workflow 呼び出し
       boilerplate (capability preflight / .result unwrap / SKIPPED_PLANNED / args 規約) を
       Single Canonical Source Rule に従い本ファイルへ一本化 (Wave A2)。
-->

<!--
機能概要: op-* skill 群が Dynamic Workflow (Workflow tool、workflows/op-*.js) を呼ぶ際の
         共通呼び出し規約 (preflight / 戻り値 unwrap / silent 除外禁止 / args 渡し) を定義する。
作成意図: 同一 boilerplate が op-scan / op-patrol / issue-enrichment / op-spec-patrol に重複転写され、
         一部呼び出し元には既知の落とし穴 (.result ラップ) が未記載という drift があった。正本を 1 箇所に集約する。
注意点: 各 workflow の args / 戻り値 schema の正本は各 `workflows/op-*.js` 冒頭コメント +
       `workflows/README.md` の契約表。本ファイルは「呼び方の共通規約」のみを扱う。
-->

# Dynamic Workflow 呼び出し規約 (正本)

**本ファイルが Dynamic Workflow 呼び出し規約の正本。** 各 SKILL.md は本ファイルへの pointer +
skill 固有の args / 戻り値フィールドのみを記載する (Single Canonical Source Rule)。

## §1 capability preflight (hard-fail)

workflow を呼ぶ経路を持つ OP skill は、起動直後 (フェーズ0) に Workflow tool (Dynamic Workflows) が
当該セッションで利用可能かを確認する。利用不可なら **即停止 (hard-fail)** し、旧機構 (single-message
spawn 等) へフォールバックしない (ADR-0009 決定5: フォールバック非保持 / fail-fast)。

- **なぜ hard-fail か**: capability 不在で warning + 続行すると silent に zero-findings となり
  「実行したが何も無かった」と誤認させる (= より悪い)。
- **schema_version チェックとは別レイヤー**: schema mismatch は forward-compat 判断のため warning に
  留める (CLAUDE.md 不変則2) が、capability 不在は処理そのものが実行不能なため hard-fail する。
- **対象外の経路**: workflow を呼ばないモード (例: op-scan `--from-merged-pr`) では本 preflight を skip してよい。

利用不可時の actionable message (復旧案内、ADR-0023 準拠):

> この skill は `<workflow 名>` Dynamic Workflow に依存します。現在のセッションで Dynamic Workflows が
> 利用できません。`claude plugin list` で `op-skill` plugin が `✔ loaded` か確認し、loaded なら
> 新規セッションを開いて SessionStart hook による `~/.claude/workflows/` 再 staging を待ってください
> (ADR-0023)。loaded でなければ plugin の再インストールが必要です。

(`scripts/install-local.sh` は deprecated のため案内しない。)

## §2 戻り値 unwrap: chat-controller は `.result.*` を掘る (#644-A)

chat Claude (controller) が Workflow tool を呼ぶと **background task として起動**し、task-notification の
出力ファイルに `{ summary, logs, result: <script の return 値>, agentCount }` 形式で **`result` にラップ**
されて返る。script の return フィールド (`findings` / `regions` / `enriched_issue` 等) への直アクセスは
**silent undefined (空振り)** になる (2026-06-02 実走由来の既知の躓き)。in-script (named workflow 内) の
同期戻り値はラップされず、経路が異なる点に注意。

防御的 unwrap の骨格例 (1 つのみ、フィールド名は各 skill 固有):

```
const out = await Workflow({ name: "op-scan-audit", args: { /* ... */ } });
const r = out.result ?? out;   // background task 経路は result ラップ、in-script 経路は素通し
// 以降 r.findings / r.verdicts 等を読む (out.findings 直アクセス禁止)
```

**戻り値が barrier**: workflow runtime が全 spawn の完了を保証して返すため、旧来の
`run_in_background: true` + Monitor 待ち合わせは不要。spawn の並列管理 (16 並列上限の透過
キューイング) も workflow runtime が担い、controller は人為 cap しない。

## §3 SKIPPED_PLANNED / silent 除外禁止

- installed check (`op core registry-verify --lens registry-agent`) で除外された planned / 未登録 expert は
  workflow args の expert list (`args.experts` / `expert_list` 等) に **含めない**。
- 除外した expert は `SKIPPED_PLANNED` 配列に保持し、**最終報告サマリに必ず併記する** (silent 除外禁止)。
- silent に「該当観点が見られた」ように振る舞ってはならない。fallback (司令官 fallback scan 等) に
  切り替えた場合も、その事実をサマリと最終報告の両方に明示する。

## §4 args 渡し規約

- **bare object で渡す** (`args: { ... }`)。`JSON.stringify` した文字列を渡さない。Workflow tool 経由では
  args が script に JSON 文字列で到着するため各 script の `normalizeArgs()` が
  `typeof args === "string" ? JSON.parse(args) : args` で両対応するが、**bare object が正**。
- Workflow input に schema 強制は無い。必須フィールド欠落は `normalizeArgs()` が throw して早期失敗する
  (fail-fast)。controller は呼び出し前に必須 args を揃える。
- **per-run の動的値は controller が確定して args 注入する** (F2 対策): `today` は controller が
  `date -u +%F` で確定、model は controller が `model-selection.md` で確定して渡す。workflow / agent 側で
  `date` 実行・推測をしない (script 本体は不変、動的値だけ args で差し替え。ADR-0009 決定6)。
- markdown を含む string (Issue body 等) は args にそのまま渡してよい (backtick / code fence も保持される)。

## 出典 / 関連正本

- `workflows/README.md` — workflow 一覧・args / 戻り値契約表・named 解決の session 内 stale 注意 (正本)
- `op-tools/docs/adr/0009-dynamic-workflows-for-op-fanout.md` — 決定5 (フォールバック非保持) / 決定6 (args 構造注入)
- `op-tools/docs/adr/0023-workflow-plugin-distribution.md` — plugin 配布 + SessionStart hook staging (復旧案内の根拠)
