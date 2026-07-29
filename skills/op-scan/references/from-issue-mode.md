<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 (2026-07-29) — ADR-0029 Wave B1 progressive disclosure: op-scan/SKILL.md 本文から
       `--from-issue` モード詳細節を無改変移設した初版 (内容変更なし)。
-->

<!--
機能概要: op-scan `--from-issue` モード (Issue 正規化) の全手順。元 Issue 取得 / scope 推定 /
          expert 絞り込み / from-issue audit (severity フィルタ無効) / 派生 Issue 起票 /
          元 Issue へのコメント + ラベル / 完了報告を集約する。
作成意図: 特殊モード全体 (毎回は通らない経路) のため SKILL.md 本文から分離 (ADR-0029 決定2)。
注意点: `--from-issue #N` 指定時 (op-run フェーズ1.5 からの委譲呼び出し含む) のみ読む。
        通常 scan では読まない。enrichment (SKILL.md 本体 フェーズ2-4) / dedup / Marker Publish
        Validate の契約は本モードでも SKILL.md 本体の該当節が正本。
-->

# op-scan `--from-issue` モード詳細 (Issue 正規化)

本ファイルは `skills/op-scan/SKILL.md` からの pointer 先 (ADR-0029 Wave B1 分離)。

## `--from-issue` モード詳細 (Issue 正規化)

人間立て Issue / 古い形式 Issue を **指示書フル版に正規化した派生 Issue** として再起票するモード。
op-run のフェーズ1.5 から委譲呼び出しされることを主用途とするが、単独でも使える。

```
/op-scan --from-issue #42
/op-scan --from-issue #42 --auto              # 承認スキップ
/op-scan --from-issue #42 --domain debug      # 起動 expert を絞る
```

### なぜ別モードか

通常 op-scan は「コードを起点に問題を検出 → 起票」だが、`--from-issue` は
「**既存 Issue を起点に scope を推定 → audit → 指示書フル版で再起票**」という
逆向きフロー。severity / Patrol Finding Policy 等の前提も異なるため、
通常モードと混在させずに専用モードとして分離する。

### 1. 元 Issue 取得

`op issue view "$ISSUE_NUM" --include meta --json` で title / body / labels / state を 1 fetch で取得する。
内部実装は ADR-0005 の `FetchSession::pull_issue_meta` / `pull_issue_comments`
(`crates/op/src/commands/issue.rs`)。`--include` で取得対象を絞れる
(`meta` / `comments` / `both`、default は `both`)。

state が `closed` / 既に `superseded-by-scan` ラベル付きならエラーで中断する
(同じ Issue を二重正規化しない)。

mcp channel では `op issue view` が fail-closed するため、司令官が `mcp__github__issue_read`
(method: get) で直接取得する。hidden marker は sanitize されるが、scope 推定は可視 body / labels
のみに依存するため成立する (marker 依存の照合はしない、`github-channel.md` §6)。

### 2. scope 推定

元 Issue から以下の手順で scope を推定する。

| 信号 | 抽出方法 | 重み |
|------|---------|-----|
| ラベル `module:xxx` | `gh issue view --json labels` | 高 (確定的) |
| 本文中のファイルパス | `grep -oE '[a-zA-Z0-9_/-]+\.(rs\|ts\|tsx\|vue\|dart\|py)'` で抽出 | 高 |
| 本文中のディレクトリ言及 | `grep -oE 'src[/-][a-zA-Z0-9_/-]+/'` 等 | 中 |
| タイトル中のモジュール名 | `auth`, `export`, `login` 等のキーワード照合 | 中 |
| ラベル `area:xxx` | op-patrol 由来の area ラベル | 中 |
| 本文中の Tauri command 名 | `#[command]`, `invoke('xxx')` | 中 |

**scope 推定不能** (上記すべて空) の場合:
- 元 Issue にコメントで「op-scan が scope を推定できませんでした。本文に対象ファイル / モジュール名を追記してください」と返信
- 終了 (派生 Issue は起票しない)

### 3. expert 絞り込み

scope が推定できたら、`op-patrol` の **area → expert マッピング** (op-patrol/SKILL.md フェーズ4) を流用して
1〜3 expert に絞る。`--domain` 指定時はそれを優先。
判定不能なら `debug-expert` + `refactor-expert` の 2 体で進める。

ラベルからの追加ヒント:
- `bug` / `defect` → debug-expert を必ず含める
- `security` / `vulnerability` → security-expert を必ず含める
- `performance` / `slow` → optimize-expert を必ず含める
- `ux` / `ui` / `usability` / `accessibility` → ux-ui-audit-expert を必ず含める
- `design` / `theme` / `token` / `design-system` → designer-expert を必ず含める
- `feature` / `enhancement` / `new` → feature-expert を必ず含める
- `refactor` / `cleanup` / `tech-debt` → refactor-expert を必ず含める

> ラベルが `ux` と `design` の両方を含む場合 (例: 「使いにくい上にダサい」) は、両方の expert を spawn する。
> 結果統合は SKILL.md 本体 フェーズ2-1 の重複ルールに従う (使いやすさ優先)。

### 4. read-only audit (op-scan-audit Workflow、severity フィルタ無効化)

選定した expert を `op-scan-audit` workflow へ `mode: "from-issue"` で委譲する。元 Issue の番号 / タイトル / 本文を
structured args で渡し、severity フィルタ緩和等の追加指示は `args.extra_directives` に組み立てて注入する
(workflow が `buildAuditPrompt` の末尾に結合する)。**from-issue mode は refute stage を skip する**
(人間 Issue の正規化であり偽陽性除去は不適切、`auditOut.result.verdicts` は `[]`)。

```
const auditOut = await Workflow({
  name: "op-scan-audit",
  args: {
    mode: "from-issue",
    scope: "<Phase 2 で推定した scope>",
    experts: [ { name: "<Phase 3 で選定した expert>", model: "<region.audit_model>" } /* , ... */ ],
    audit_model: "<region.audit_model の fallback 既定値>",
    today: "<YYYY-MM-DD>",                 // date -u +%F
    from_issue_number: <元Issue番号>,
    from_issue_title: "<元タイトル>",
    from_issue_body: "<元本文の全文>",
    extra_directives: "<↓ severity 緩和ブロックを controller が組み立てる>",
  },
});
// auditOut.result.findings = 派生 Issue 化する候補。auditOut.result.verdicts は from-issue では [] (refute skip)。
```

`extra_directives` に組み立てる severity 緩和ブロック (旧 spawn テンプレ追加指示と同内容):

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

### 5. 派生 Issue 起票 (指示書フル版)

`_shared/pr-templates.md` の **指示書フル版** で起票する。本文冒頭に hidden marker:

> **enrichment 経路の遵守**: `--from-issue` 経路でも、派生 `issue_draft` は通常モードと同じく
> SKILL.md 本体 フェーズ 2-4 (enrichment) を必ず通す (proposal 3.7.1 不変則)。`--no-enrichment` 指定時のみ
> skip。block 判定なら派生 Issue を起票せず、元 Issue に「enrichment で block されました」と
> コメント返信する (元 Issue 本体・`superseded-by-scan` ラベルは触らない、二重正規化保護は維持)。

```markdown
<!-- op-fingerprint: <domain>:<normalized_title>:<primary_file>:<symbol> -->
<!-- op-source: op-scan -->
<!-- op-mode: from-issue -->
<!-- op-derived-from: #<元Issue番号> -->
<!-- op-domain: <debug | refactor | optimize | security | ux-ui | design | test | feature> -->
<!-- op-scan-expert: <検出した expert agent 名> -->
<!-- op-run-expert: <apply 担当 expert (canonical schema の recommended_runner を転写)> -->
<!-- op-post-check-expert: <ux-ui-audit-expert | security-expert | null> -->
```

> `op-domain` 値の domain 列挙・expert マッピング詳細は `skills/op-scan/references/routing-and-marker-reference.md` §domain → marker パターン表 を参照。

> `op-post-check-expert` の null 出力義務は SKILL.md 本体 フェーズ4 § `必須 marker (全 Issue 共通)` を参照。

ラベル:
- `auto-report` (op-run が拾う)
- `derived-from-issue` (派生 Issue であることを示す)
- `severity:critical|high|medium|low|n/a` (適切なもの)
- 元 Issue から継承可能なラベル (例: `module:xxx`, `bug`, `feature`)

検出が複数になった場合 (audit で副次的問題が見つかった場合):
- 元 Issue の **本来の意図に最も近い検出を 1 件のみ派生 Issue 化**
- それ以外の検出は通常の op-scan 起票として別ラベル (`auto-report` のみ、`derived-from-issue` なし) で起票
- 派生 Issue は元 Issue 1 件 → 派生 Issue 1 件の 1:1 対応を保つ (op-merge の連動 close を単純化するため)

### 6. 元 Issue へのコメント + ラベル

元 Issue へのコメント本文は固定テンプレで生成する (派生 Issue 番号 `${NEW_ISSUE}` を埋め込む)。
本文を `--body-file` 経由で渡し、生成中の文字列 escape 事故を避ける:

> 🔍 op-scan が指示書フル版を #${NEW_ISSUE} として起票しました。
>
> この Issue は op-run で実装可能な形式に正規化された派生 Issue (#${NEW_ISSUE}) に
> 置き換えられます。今後の議論・実装は派生 Issue 側で進んでください。
>
> 派生 Issue がマージされたら、op-merge がこの Issue を一緒に close するか確認します。

op CLI 呼び出し手順:

- `op issue comment "$ISSUE_NUM" --body-file "<tmp>"` でコメント投稿
- `op issue edit-add-label "$ISSUE_NUM" --label "superseded-by-scan"` でラベル付与 (close しない)

`op issue edit-add-label` は内部で gh issue edit --add-label を 1 invocation = 1 FetchSession で呼ぶ。
ラベル `superseded-by-scan` の repo への新規作成 (gh label create) は op CLI 経由では行わない
(gh CLI 側で repo 設定済の前提)。未設定時の挙動は gh エラー → SKILL.md 側で対話案内。

mcp channel では `op issue edit-add-label` の**直前に fresh な `mcp__github__issue_read` (method: get)
を取り直して** `--input-json` で渡す (手順 1 の snapshot を再利用しない — `issue_write` の labels は
**全置換 semantics** のため、古い素材だと取得後に付いた label が silent に消える)。emit された
call-spec は `github-channel.md` §3-§4 の protocol (verbatim 実行 → read-back → ingest) で完遂する
(comment は従来どおり)。

**元 Issue を自動 close しない理由**:
- 人間が立てた Issue を機械が勝手に close するのは強い権限
- 派生 Issue の実装中に元 Issue 側で議論が続く可能性がある
- close は op-merge の連動 close フェーズでユーザー判断を仰ぐ

### 7. 完了報告 (--from-issue 専用)

```
## op-scan --from-issue 完了

### 入力
- 元 Issue: #42 "ログイン画面で時々落ちる"

### 推定 scope
- src-tauri/src/auth/login.rs (本文中言及)
- src-tauri/src/auth/session.rs (label module:auth から推定)

### 起動 expert
- debug-expert (label `bug` から)
- security-expert (auth 領域のため)

### 起票結果
- 派生 Issue: #87 "auth/login: 不正トークン処理での panic 修正"
  - severity: high
  - fingerprint: debug:panic-on-invalid-token:src-tauri/src/auth/login.rs:verify
  - 元 Issue: #42 (superseded-by-scan ラベル付与済み)

### 副次検出 (別 Issue として起票)
- なし

次は `/op-run` で派生 Issue (#87) を実装可能です。
```

### `--from-issue` 時の注意

- **severity フィルタ無効化** は `--from-issue` モードでのみ。通常モード / `--auto` / op-patrol の policy には影響しない
- **副次検出は 1:1 維持のため別 Issue 化**。派生 Issue (`derived-from-issue` ラベル) は 1 元 → 1 派生
- **fingerprint 重複判定は通常通り**。派生 Issue が既存 open Issue と被ったら起票せず、元 Issue にコメントで「既存 #N と同等のため、そちらで進めてください」と返信
- **scope 推定不能なら静かに終了**。元 Issue にコメントで scope 追記を依頼するのみ
- **元 Issue が既に closed / superseded-by-scan ラベル付きなら中断**。二重正規化を防ぐ
- **--auto 時も派生 Issue は起票する** (元 Issue が起票時点で人間判断を経ているため)
- **enrichment フェーズ (2-4) は走る**。`--no-enrichment` 指定時のみ skip。`--strict-enrichment` / `--with-cross-review` も通常モードと同様に有効
