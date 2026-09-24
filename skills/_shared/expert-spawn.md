# expert subagent spawn 規約

op-* skill が Agent tool で expert subagent を spawn するときの prompt 構造・出力 schema・独立性確保ルール。
review 系 spawn は別 worktree + 別ロールで行う (同一 context 内でロールを名乗るだけは禁止)。

## 関連ドキュメント

- `_shared/invocation-mode.md` — Direct / OP-managed の対話可否と `needs_human_decision` schema
- `_shared/spawn-prompt-common.md` — spawn prompt 共通必須ブロック (§1〜§4) の正本
- `_shared/runtime-contract.md` — spawn 可否 / planned expert / routing metadata / reclassification の正本
- `_shared/active-expert-registry.md` / `_shared/planned-experts.md` — active / planned expert の正本
- `_shared/markers/labels-and-markers.md` — hidden marker / label の正本
- `_shared/model-selection.md` — model 選択と `task_complexity` の正本

## Shared Runtime Boundary

Issue / PR marker は routing metadata であり spawn を認可しない。spawn してよいのは registry の active expert のみ。
planned expert (`env-expert` / `release-expert` / `compatibility-expert`) は `subagent_type` に渡さず、op-run が spawn 前に
active expert または `needs_human_decision` へ正規化する。`release-expert` は fallback destination にもしない。
Utility Worker (`scout` / `spec-expert`) は op-run の routing から spawn しない (`spec-expert` は `feature-expert` へ正規化)。

review 契約 (7 lens 手順 / `review_result` 判定 / needs-fix 3 条件 / lens → 再委任先) の正本は expert-review skill、
op-run の dispatch 判定優先順位 1-8 の正本は op-run skill の `references/review-fix-loop.md` §4.5-2。本ファイルの review 節は要約。

## expert agent と用途 (spawn 規約上の住み分けのみ)

- `review-expert` = PR 全体の独立 global review 専任 (修正・push しない)。post-check expert に指定しない
  (`<!-- op-post-check-expert: review-expert -->` 禁止)
- post-check として spawn してよいのは `ux-ui-audit-expert` (op-run フェーズ3.5-A) と `security-expert` (フェーズ3.5-B) のみ。
  `post_check_expert` に planned expert が現れても routing metadata であり spawn 許可ではない
- UX/UI は ux-ui-audit-expert (使いやすさ) と designer-expert (美しさ) の二人体制。衝突時は使いやすさを優先する
- 脅威アクター視点は review-expert の Security/Abuse Lens、深掘りは security-expert

## Plugin scoped-name 規約 (subagent_type の前置)

plugin 内 component は `op-skill:` prefix 付きで登録される。Agent tool の `subagent_type` に bare 名を渡すと
`Agent type '<name>' not found` で失敗する (自動補完なし)。

### 規約

- active expert 9 体と utility worker (`scout` / `spec-expert`) を spawn するときは `subagent_type: "op-skill:<name>"` を渡す
- bare 名が正本。`op run expert-resolve` 出力 / registry / marker 値 / fingerprint / `apply-prompt-directives.md` の
  `${EXPERT}` 節 lookup / payload の `expert` field はすべて bare 名。前置は `subagent_type` 引数の境界でのみ行う
- 動的 spawn (ClusterOrchestrator の apply / review 等) は `"op-skill:" + <resolved bare expert>` で組み立てる

### 前置しない例外

- built-in agent (`general-purpose` / `Explore` / `Plan`) は bare のまま渡す
- planned expert はそもそも spawn しない
- `claude --agent <name>` CLI フラグは bare 名で解決するが、Agent tool の `subagent_type` とは別

## expert spawn は subagent であること (teammate 化させない)

- 戻り値契約 (ClusterSummary 等) を持つ skill を回す環境では `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` を設定しない
- spawn に個体名を付けない。識別は `description` (例: `"ClusterOrchestrator: c1"`) で行う。prompt で「teammate として」「チームを作って」と要求しない
- teammate は戻り値を返さない (idle 通知 + mailbox) ため、teammate 化した時点で戻り値契約が壊れる
- `run_in_background` は既定に委ね、CO 配下も同期直列に固定しない。`In-process teammates cannot spawn background agents` が返った場合のみ `false` で再送する

## spawn の3パターン

### パターン1: scan 用 (read-only audit)

```
Agent({
  subagent_type: "op-skill:<domain>-expert",
  model: "<model-selection.md §5.2 by area complexity (single/typical→sonnet, complex/critical→opus)>",  ← fable 禁止
  description: "scan: <domain>",
  prompt: """
    <spawn-prompt-common.md §1 / §2 (exploration-only) / §4 を全文>

    あなたは <domain>-expert です。<scope> を read-only で audit してください。
    <... prompt 規約 (共通) に従う ...>

    作業対象のパスが決まったら、対応する `.claude/rules/<feature>.md` を **Read ツールで**開いてから着手すること (cat / grep では正本が読み込まれない)。

    Return the required canonical schema JSON. Do not mix question text into the JSON output.
  """
})
```

- worktree 不要。並列 spawn 可
- 出力は Critical/High 候補のみ。Medium/Low は返さない
- `requires_runtime` / `inferred` / low confidence の finding は `manual_review_bucket` で返す (`_shared/auto-policy.md`)

### パターン2: apply 用 (worktree 内で実装)

```
Agent({
  subagent_type: "op-skill:<domain>-expert",
  model: "<model-selection.md §5.3 by task_complexity (routine/extension→sonnet, design/integration/api-design→opus)>",
                                    ← §7.2 の承認を得た cluster のみ "fable"
  isolation: "worktree",            ← 必須
  description: "apply: cluster-<id>",
  prompt: """
    <spawn-prompt-common.md §1 / §2 (apply) / §4 を全文>

    あなたは <domain>-expert です。worktree <path> の branch <name> で Issue #<N> を実装してください。
    <... prompt 規約 (共通) に従う ...>

    作業対象のパスが決まったら、対応する `.claude/rules/<feature>.md` を **Read ツールで**開いてから着手すること (cat / grep では正本が読み込まれない)。

    Do not stop and wait for commander or user replies.
    Return the required apply report and commit. Do not push.
  """
})
```

- ブランチ名・触ってよいファイル一覧を prompt で明示する。push は司令官が後段で行う
- op-run (OP-managed) では controller が ClusterOrchestrator を spawn し、apply → PR → post-check → review → round 管理は
  その中で完結して ClusterSummary のみ返す (正本: op-run skill の `cluster-orchestrator-directives.md`)

### パターン3: review 用 (独立性確保が最重要)

```
Agent({
  subagent_type: "op-skill:review-expert",
  model: "opus",                    ← §7.1 narrow opt-down 適用時は sonnet。fable 禁止
  isolation: "worktree",            ← apply とは別 worktree で PR ブランチを checkout
  description: "global review PR #<N>",
  prompt: """
    invocation_mode: op_managed

    あなたはこの PR を書いていない独立 reviewer (review-expert) です。
    <... 「review 用 prompt の独立性確保節」テンプレを含める ...>

    作業対象のパスが決まったら、対応する `.claude/rules/<feature>.md` を **Read ツールで**開いてから着手すること (cat / grep では正本が読み込まれない)。

    You must not ask interactive questions.
    You must not modify code, commit, or push.
    Return one of: approve / needs-fix / needs-specialist-review / blocked.
    Return the review as structured reviews[] (`op help payload review-finding`).
    Do not post any PR comment yourself — the ClusterOrchestrator records the result.
    Do not produce free-form question text.
  """
})
```

- main の context・apply の worktree から完全分離する
- 判定は verdict 4 値に閉じる。判断不能・scope 外・人間判断要は `blocked` verdict (+ finding) で表す
  (§4 の fallback 5 択は review phase では使わない)

### 正本 (.claude/rules) の Read (ADR-0017 注記)

- 全 spawn prompt に上記テンプレの「`.claude/rules/<feature>.md` を Read ツールで開いてから着手」の 1 行を含める
- 正本の本文は spawn prompt に注入しない
- 正本は `paths:` に該当するファイルを Read ツールで開いたときだけ auto-inject される。untracked の正本は worktree に
  伝播しない。注入時に HTML コメントは除去されるため、正本の指示を `<!-- -->` 内に書かない

## model / task_complexity routing

OP-managed では controller が `Agent({ model })` で model を明示する。意味論・mapping・優先順位の正本は `_shared/model-selection.md`。

| field | 値 | 用途 |
|---|---|---|
| `model` | `"opus"` \| `"sonnet"` \| `"haiku"` / `"fable"` (承認済み write spawn のみ) | `Agent({ model })` に渡す。OP-managed では agent frontmatter `model:` より優先 |
| `task_complexity` | `routine` \| `extension` \| `design` \| `integration` \| `api-design` | apply spawn の prompt に埋める |

決定経路: `task_complexity` (apply、`model-selection.md` §2) または区画 complexity (scan / patrol) →
§5 mapping → `--quality` / `OP_QUALITY` override → (write phase のみ) §7.2 Fable gate → `Agent({ model })`。

- controller は `fable` を自動選択しない (worker の天井は Opus)
- `fable` は op-run apply / op-codev implement で §7.2 の人間承認を得た spawn のみ。read-only spawn (scan / review /
  post-check / investigation / refute / Utility Worker) は承認があっても禁止
- `model_overrides.*: fable` は無効値 (mapping 値で spawn し warning)
- Direct Mode は agent frontmatter `model:` が既定。degrade は `model-selection.md` §9

## prompt 規約 (共通)

すべての spawn prompt は以下を含む。1 と 7 は `_shared/spawn-prompt-common.md` §1 / §4 で充足する。

```
1. invocation_mode  — `op_managed`
2. ロール宣言       — あなたは <expert>。○○の専門家
3. タスク定義       — 何をするか (1〜2 文)
4. 入力             — 対象ファイル / Issue / PR 番号
5. 制約             — 触ってよい範囲 / 触ってはいけない範囲 / 並列タスクが触る範囲
6. 出力契約         — 何を返すか (フォーマットを明示)
7. 不足情報の扱い   — 質問せず assumptions / needs_human_decision / blocked として返す
8. 完了条件         — どうなったら終わりか
```

prompt 冒頭に「あなたはこのコードを <書いた / 書いていない>」を明記する (review は「書いていない」)。

### op CLI helper 活用推奨例

- `op core fingerprint --plain --domain <d> --title <t> --file <f> [--symbol <s>]` — finding の `op-fingerprint` 値を生成 (`--file` の `:LINE` は除去される)
- `op core extract-pr-markers --input-json - [--from-body]` — merged PR の body / comments / commit message から marker を決定論抽出 (review / refactor-expert)。`## 残存リスク / follow-up` 等の自然文は抽出されないので別途読む
- `op help envelope scan-dedup` — 自分の finding が dedup でどう処理されるかを確認

## scan 出力契約 (canonical schema)

全 expert の scan / patrol 出力はこの schema に従う。op-scan は `_shared/pr-templates.md` の指示書テンプレに直接マッピングする。

### scan 出力 envelope 契約

1. 応答は `{"findings": [ <scan-finding>, ... ]}` の JSON object。裸の配列にしない
2. 0 件なら `{"findings": []}`。自然文で代替しない
3. JSON 以外のテキスト (説明 / 前置き / 見出し / YAML / fence 外の補足) を付けない。investigation_candidates / ignored_noise を自然文で追記しない
4. spawn 入力に `candidate_report: true` が明示された場合のみ、代わりに次を返してよい。指定が無ければ confirmed 0 件でも `{"findings": []}` のみ

   ```json
   {
     "confirmed_findings": [ /* <scan-finding> */ ],
     "investigation_candidates": [ /* 昇格できなかった候補 */ ],
     "ignored_noise": [ /* 意図的に無視した検出 */ ]
   }
   ```

5. `allow_text_tail` (JSON 末尾の補足を許可) / `allow_level_1` (Level 0 固定の例外、`_shared/severity-rubric.md`) は controller が明示注入しない限り false

scan-finding (配列要素) の schema:

```json
{"findings": [
  {
    "title": "<60 文字以内、症状の要約>",
    "severity": "critical | high",
    "severity_reason": "<到達経路・観測可能な被害・影響範囲 (severity-rubric.md)>",
    "domain": "debug | refactor | optimize | security | ux-ui | design | test | feature | env",
    "files": ["path/to/file.ext:LINE"],
    "symbols": ["<関数名 / コンポーネント名 / 型名>"],
    "summary": "<2-3 文の問題説明>",
    "evidence": "<該当コード 5-10 行>",
    "evidence_grade": "direct | inferred | requires_runtime",
    "reproduction_hint": "<再現条件 / 確認方法>",

    "hypothesis": "<根本原因仮説>",
    "excluded_hypotheses": ["<否定した仮説: 否定根拠>"],
    "scope_in": ["path/to/touchable.ext"],
    "scope_out": ["<触ってはいけない範囲 / 別 Issue で扱う領域>"],

    "recommendation": {
      "type": "fix | refactor | optimize | test | feature | investigation",
      "steps": ["<実装手順 1>", "<実装手順 2>"]
    },
    "verification_steps": ["<修正後に確認すべき項目>"],
    "success_criteria": ["<修正完了の判定条件>"],
    "gotchas": ["<apply で踏みやすいミス>"],

    "bulk_group": "<カテゴリ ID | null>",
    "confidence": "high | medium",
    "requires_dynamic_verification": true,
    "scope_origin": "explicit_paths | changed_files | patrol_sample",

    "recommended_runner": "debug-expert | refactor-expert | optimize-expert | security-expert | ux-ui-audit-expert | designer-expert | test-expert | feature-expert | env-expert",
    "post_check_expert": "ux-ui-audit-expert | security-expert | env-expert | null",

    "reclassified_from": "<元の expert 名>",
    "reclassified_to": "<再分類後の active expert 名 | needs_human_decision>",
    "reclassification_reason": "<1 行理由>",

    "design_principle_violated": "<design のみ: Scan Mode 観点 1〜9>",
    "bypass_count": "<design のみ>",
    "affected_screens": "<design のみ>",
    "candidate_count": "<design のみ: 一次 grep の raw 件数>",
    "excluded_count": "<design のみ: 除外件数>",
    "confirmed_bypass_count": "<design のみ: candidate_count - excluded_count>",
    "exclusion_summary": "<design のみ: 除外 allowlist の 1 行説明>"
  }
]}
```

### フィールドの必須性

| フィールド | 必須 | 備考 |
|-----------|-----|------|
| title / severity / severity_reason / domain | ✓ | severity_reason は `severity-rubric.md` に従う |
| files / symbols | ✓ | 最低 1 件 |
| summary / evidence | ✓ | evidence は静的に観測したコード断片 |
| evidence_grade | ✓ | `direct` 以外で Critical を付けない |
| reproduction_hint | `requires_runtime` のとき必須 | |
| hypothesis / scope_in / scope_out | ✓ | apply の context 継承に必要 |
| recommendation.type / .steps | ✓ | additive (test / feature) は steps を計画として詳細化、`optimize` は steps に measurement_plan を含める |
| verification_steps / success_criteria / gotchas | ✓ | apply / review の合否判定基盤 |
| excluded_hypotheses | 推奨 | |
| bulk_group | 任意 | 5 件以上同 group ならバッチ Issue 化 |
| scope_origin | optional | `patrol_sample` 由来では付与を推奨 |
| recommended_runner | ✓ | op-scan / op-patrol が `op-run-expert` marker に転写。planned 値は op-run が spawn 前に正規化。security domain は `security-expert` または `debug-expert` |
| post_check_expert | ✓ | 不要なら明示的に `null`。security domain は必ず `security-expert`。`review-expert` は指定不可 |
| reclassified_from / _to / reclassification_reason | 再分類時のみ | 3 つ揃えて記録。`recommended_runner` は再分類後の値。PR marker はこの field の mirror (`runtime-contract.md` §10) |
| design_principle_violated | design domain で必須 | |
| bypass_count / affected_screens / candidate_count / excluded_count / confirmed_bypass_count / exclusion_summary | design domain で推奨 | 数え方は `expert-design` の scan-finding-policy.md |

### domain extension: refactor 拡張フィールド

`domain: "refactor"` の finding は refactor 拡張フィールド (`finding_type` / `execution_mode` / `direct_apply_safe` /
`safe_first_step` / `proposed_stages` / `blocking` / `affected_paths` / debt 追跡 field 等) を持つ。
正本は `op help payload refactor-finding` と expert-refactor skill の `references/report-schema.md`。
op-scan / op-patrol はこれを必須転写対象として `pr-templates.md` の「🧱 Refactor Execution Control」節に展開する。
refactor domain の `post_check_expert` は `ux-ui-audit-expert` / `security-expert` / `null` のみ。他の検証要件は
`recommended_followup_experts` で返す。

### domain extension: security 拡張フィールド

`domain: "security"` の finding は `security` / `threat_model` / `usable_security` / `post_check` 拡張を必須で持つ。
正本は `op help payload security-finding` と expert-security skill の `references/report-schema.md`。
op-scan / op-patrol は Issue 本文の Threat Model / Source-Sink / Usable Security 節に転写する。

- apply 担当が security / debug いずれでも post-check は `security-expert` (op-run フェーズ3.5-B)
- mitigation が UI / workflow に影響する場合、security-expert は `requires_aux_post_check: true` +
  `aux_post_check_experts: [ux-ui-audit-expert]` を返し、op-run が ux-ui-audit-expert post-check を追加実行する

### severity の判定

判定基準は `_shared/severity-rubric.md` (到達経路 → 観測可能な被害 → 分類)。

### 「可能性がある」を出力する条件

曖昧表現の代わりに evidence_grade を使う。

- `direct` — 静的に確認可能 (コード読みで証拠が揃う)
- `inferred` — 周辺コードからの推論 (High が上限)
- `requires_runtime` — 実行時検証が必要 (High が上限、reproduction_hint 必須)

### バッチ可能性判定 (bulk_group)

同一 expert + 同一カテゴリの検出を `bulk_group` で関連付ける。同じ `bulk_group` が 5 件以上なら op-scan は
バッチ Issue (`_shared/pr-templates.md` のバッチテンプレ) を生成する。命名規則は各 expert の SKILL.md。
例: `security:path-traversal-in-export` / `design:hardcoded-color`。

### 実装計画の埋め込み (additive 検出)

「追加 (add)」を要求する検出は `recommendation` に構造化された実装計画を含める。対象:

- `test-expert`: テスト不足 → 追加テスト計画
- `feature-expert`: 仕様の穴 → 機能追加計画
- `ux-ui-audit-expert`: state 欠如 / 復帰導線不足 / 確認ダイアログ不足 → 追加実装計画 (`recommended_runner: designer-expert`)。
  designer-expert 単独で完結しない場合 (state machine / API retry / auth flow / draft 保持等) は co-run が必要な expert を
  `gotchas` に明記する (`expert-ux-ui-audit/references/scan-finding-policy.md` の co-run 判定節)
- `designer-expert`: トークン化不足 / 共通 component 未利用 / design system 構造的負債 → 移行計画 (`recommended_runner: designer-expert`)
- `optimize-expert`: 計測未整備 → ベンチ追加計画

```markdown
## <種類> 計画

### 対象
- ファイル / 関数: `path::name`
- 現状: <現状を 1 行で>

### 追加するもの
| # | 名前 | 内容 / 入力 | 期待 / 効果 |
|---|------|-----------|------------|
| 1 | ... | ... | ... |

### 必要な前提・依存
- 既存の <fixture / コンポーネント / モジュール> を再利用
- 新規 <作る場合のみ列挙>

### 推定規模
- 追加 LoC: 約 N 行
- 追加ファイル: N 個
- 副作用: <なし or 列挙>

### 受入条件
- <条件 1>
- <条件 2>
```

fix 型 (debug / refactor / security) の `recommendation` は修正の方向性 1〜3 文でよい。

## scan scope mode 契約 (3 モード)

worker は探索前に scope mode を確定させる。

| mode | 起点 | 探索範囲 | 主な呼び出し元 |
|---|---|---|---|
| `explicit_paths` | controller が指定したファイル・ディレクトリ | 指定範囲とその直接の呼び出し境界 | op-scan (path 指定あり)、op-run の investigation |
| `changed_files` | `git diff` / PR diff / staged files | 変更ファイル + 直接の呼び出し境界のみ | op-scan (差分 audit)、PR 起点の audit |
| `patrol_sample` | repo 全体 (指定なし) | risk-weighted sampling で選んだ範囲、budget 内 | op-patrol、指定も差分も無い op-scan |

### 優先順位と決定規則

1. `explicit_paths` が最優先。指定があれば他に落とさない
2. 指定が無く差分起点があれば `changed_files`
3. どちらも無い場合のみ `patrol_sample`
4. 完全ランダム探索は禁止。`patrol_sample` は risk-weighted sampling とする

### controller の注入 (推奨) と worker 側 fallback

- controller は spawn prompt に `scope_mode` を注入する (推奨)。`explicit_paths` / `changed_files` は対象 path 集合
  (または diff 取得手段)、`patrol_sample` は budget (最大 N ファイル) も渡す
- 未注入なら worker は `explicit_paths` として扱う。path 指定も差分起点も無ければ上記規則で自ら確定させる。注入値が優先

### worker 側の義務

- finding に由来 mode を `scope_origin` で付与する (特に `patrol_sample`)
- `patrol_sample` では Medium / Low を報告しない。静的証拠だけで Critical / High と断定できるものだけを confirmed に入れる
- `patrol_sample` のサンプリング優先順位は expert ごとに各 expert の L1 / L2 側で定義する

## investigation report schema (フェーズ 2-A)

op-run フェーズ 2-A で各 expert が返す。競合検出ロジックは `_shared/clustering.md` Stage 2。

```json
{
  "issue": 42,
  "cluster_id": "auth-debug-1",
  "suspected_root_cause": "<根本原因仮説>",
  "files_read": ["src/auth/login.rs", "src/lib.rs"],
  "files_likely_to_modify": ["src/auth/login.rs", "Cargo.toml"],
  "risk_files": ["Cargo.toml"],
  "needs_serialization": true,
  "reason": "<直列化が必要な理由>",
  "e2e_verification_plan": {
    "uses_existing_steps": true,
    "existing_steps_ref": "Issue #42 §verification_steps",
    "additional_steps": [
      { "step": "<Issue 本文に不足する検証ステップ>", "tool": "cargo test | bun run dev + curl | claude-in-chrome | tmux | skip" }
    ],
    "verification_tool_primary": "cargo test",
    "skip_reason": null
  }
}
```

### investigation report フィールドの必須性

| フィールド | 必須 | 備考 |
|-----------|------|------|
| `issue` / `cluster_id` / `suspected_root_cause` / `files_read` | ✓ | |
| `files_likely_to_modify` | ✓ | 司令官が cluster 間の積集合で競合検出する |
| `risk_files` | ✓ | global_conflict_files に該当するもの |
| `needs_serialization` | ✓ | true なら司令官が直列化する |
| `reason` | `needs_serialization: true` 時必須 | |
| `e2e_verification_plan` | ✓ | 下記 |

`e2e_verification_plan` は Issue 本文の `verification_steps` を一次ソースとし、`additional_steps` は不足分のみ (0 件なら `[]`)。

| フィールド | 必須 | 備考 |
|-----------|------|------|
| `uses_existing_steps` | ✓ | |
| `existing_steps_ref` | `uses_existing_steps: true` 時必須 | `"Issue #N §verification_steps"` 形式 |
| `additional_steps` | ✓ | |
| `verification_tool_primary` | ✓ | `cargo test` / `bun run dev + curl` / `claude-in-chrome` / `tmux` / `skip` |
| `skip_reason` | `verification_tool_primary: "skip"` 時必須 | unit test のみで十分な理由を 1 文 |

## 修正完了報告 schema

op-run フェーズ 2-C で apply expert が返す完了報告の正本。

```json
{
  "issue": 42,
  "cluster_id": "auth-debug-1",
  "status": "completed | blocked | partial",
  "modified_files": ["src/auth/login.rs"],
  "commits_added": ["<SHA1>", "<SHA2>"],
  "verification_executed": ["<実行した検証ステップ>"],
  "verification_results": {
    "level1_lint_type": "pass | fail | skip",
    "level2_unit_test": "pass | fail | skip",
    "level3_build": "pass | fail | skip"
  },
  "happy_path_tests_added": ["<test_xxx_when_yyy>"],
  "assumptions": [],
  "needs_human_decision": { "required": false },
  "blocked_actions": [],

  "code_review_invoked": true,
  "code_review_result": "pass | warning | skip",
  "code_review_skip_reason": null,
  "code_review_effort": "low | medium | high | xhigh | max | auto | null",

  "self_review_result": "pass | needs_fix | skip",
  "self_check_blocked": false
}
```

### 修正完了報告 フィールドの必須性

| フィールド | 必須 | 備考 |
|-----------|------|------|
| `issue` / `cluster_id` / `status` | ✓ | |
| `modified_files` | `status: completed` 時必須 | |
| `commits_added` | ✓ | SHA 文字列の配列 (`string[]`)。apply は 1 件以上、exploration-only spawn は `[]`。object でラップしない (`[{"sha": ...}]` は不可)。短縮 SHA (7 桁以上) 可 |
| `verification_executed` / `verification_results` | ✓ | Verification Ladder Level 1〜3 |
| `code_review_invoked` | ✓ | apply Run Mode では原則 `true`。`false` が正当なのは (a) exploration-only spawn、(b) expert 固有 skip 条件に該当し `code_review_skip_reason` に理由を書いた場合のみ (mode 表は `apply-completion-checklist.md` §1、skip 条件は §5)。手動 fallback を `true` と報告する条件は同ファイル「手動 fallback の発動条件」 |
| `code_review_result` | `code_review_invoked: true` 時必須 | |
| `code_review_skip_reason` | `code_review_result: "skip"` 時、または apply Run Mode で `code_review_invoked: false` 時に必須 | |
| `code_review_effort` | optional | spawn 時に渡した effort の転写 (`model-selection.md` §5.5) |
| `self_review_result` / `self_check_blocked` | op-run 経路かつ `status: completed` 時必須 | 欠落時は fail-closed (PR 作成へ進まない)。`blocked` / `partial` は対象外。`self_check_blocked: true` なら完了扱いせず人間 gate / 再委任へ。Direct apply は省略可 |
| `assumptions` / `needs_human_decision` | 推奨 | |
| `blocked_actions` | `needs_human_decision.required: true` 時必須 | |

### controller 検証規約

apply spawn 完了後、controller は `commits_added` が空でないことを確認する。空なら
`_shared/apply-completion-verify.md` の手順 (git log 実測 → SendMessage retry / worktrees-failed 隔離) に従う。
exploration-only spawn の `[]` は違反ではない。

### 完了報告の長さ目安 / 圧縮ルール (producer 側)

- summary 系: 2〜4 文。diff を逐語再掲しない
- `assumptions[]`: 各 1 文、5 項以内
- `verification_*`: コマンド名 + pass/fail/skip のみ。失敗時のみ要旨 1〜2 文
- `needs_human_decision` / `blocked_actions[]`: 各 1〜2 文
- ファイル全文・ログ全文を貼らない。空でよいフィールドを散文で埋めない (consumer 側は `_shared/read-economy.md`)

## apply 入力契約 (Issue 指示書)

op-run から渡される Issue 本文は `_shared/pr-templates.md` の指示書フォーマットに従う。apply agent は以下を読んで判断する。

| Issue 節 | apply での扱い |
|---------|--------------|
| 観測された挙動 / Evidence | 静的観察結果 (実行時検証は agent 自身が行う) |
| scan が立てた仮説 | 出発点の仮説。鵜呑みにせず自分でも検証 |
| 除外した仮説 | 再検証不要。ただし見落とした角度がないか確認 |
| 触ってよいファイル | このリスト外を編集しない |
| 触ってはいけないファイル | 別タスク / 影響範囲外 / 競合 |
| 必須検証項目 | 完了報告で全項目の pass を明示 |
| 成功条件 | 達成できなければ完了扱いしない |
| 既知の落とし穴 | apply 中に意識する |
| 🧱 Refactor Execution Control (refactor のみ) | `immediate_refactor` + `direct_apply_safe=true` のみ direct apply、`staged_refactor` / `architecture_debt` は `safe_first_step` のみ (1 stage = 1 PR)、`needs_spec_decision` または `needs_human_decision.required=true` は実装せず block を返す |

指示書節が無い Issue の場合:

- Direct Mode: 古い形式である旨を示し、scan 再起票か手動補完を確認してよい
- OP-managed Mode: 停止しない。`assumptions[]` に「指示書節欠如のため canonical schema の最低項目から推定」と記録し、
  `needs_human_decision` に「scan 再起票 / 現 Issue 本文だけで進行 / 別 Issue 化」を返す。Issue コメントは起こさない

## review 用 prompt の独立性確保節 (テンプレ, review-expert)

review-expert は監査専任 (コード編集・commit・push 禁止)。needs-fix の修正は op-run が specialist expert に再委任する。

```
あなたはこの PR を書いていない独立 reviewer (review-expert) です。
以下の手順を必ず守ること:

1. base ref を `gh pr view <N> --json baseRefName --jq '.baseRefName'` で解決し、$BASE_REF として固定する
2. **変更前ファイル (origin/${BASE_REF} 側) を `git show "origin/${BASE_REF}:<path>"` で先に読む**。
   current tree (Read / Grep / cat) の参照は diff 確認 (手順 4) の前まで禁止。
   詳細は `evidence-policy.md` の base-first evidence procedure を参照。
3. PR 本文と関連 Issue を読み、変更が「なぜ必要か」を自分で推論する
4. `git diff "origin/${BASE_REF}...HEAD"` (triple-dot) を見て推論とのズレを探す
5. 7 lens で検証 (詳細は expert-review skill):
   Security / Workflow-UX / Test / Compatibility / Release / Spec / Refactor
6. review_result を決定: approve / needs-fix / needs-specialist-review / blocked
7. needs-fix / needs-specialist-review / blocked のとき、各 finding を `op help payload review-finding` の
   形で **構造化返却する** (OP-managed では PR への記録は controller が行う)。
   全体 review_result は最重値で決定。

self-review にならないよう外部監査の立場を最後まで保つこと。
```

### needs-fix の機械的判定 (3 条件 AND) — pointer

`needs-fix` = same-pr 内で修正できる AND 単一 expert で完結する AND 既知パターンの修正。1 つでも欠ければ
`needs-specialist-review`、scope_out / 人間判断要 / loop 上限超過 / Issue 再設計要なら `blocked`。
正本: expert-review skill の `references/result-decision.md`。

### review-expert の禁止事項

- コード編集 / commit / push (PR 本文の typo 修正も含む。typo は finding に残す)
- `needs-fix-applied` 判定の使用
- post-check expert としての振る舞い

### op-run による Review Fix Loop と再委任 — pointer

`recommended_fix_expert` は提案であり、最終判断は op-run が判定優先順位 1-8 で行う
(正本: op-run skill の `references/review-fix-loop.md` §4.5-2 / expert-review skill の `references/handoff-boundaries.md` /
lens → expert 対応は expert-review skill の `references/lens-catalog.md`)。
`ux-ui-audit-expert` / `review-expert` は `recommended_fix_expert` / `recommended_apply_expert` に指定しない。planned expert は
spawn 前に正規化し、再分類は `reclassified_*` field に記録する。

### needs-specialist-review の handoff

specialist は finding の妥当性 / 影響範囲 / 修正方針 / same-pr 可否を判断して返す。controller が review state 文書の
`specialist_reviews[]` に `op review state push` (`specialist_review` payload) で記録する。op-run の分岐:

- `same-pr-fixable` → 判定優先順位 1-8 に戻り、`recommended_apply_expert` を参考に再委任
- `new-issue` → 別 Issue 化し、本 PR では blocked finding 扱い
- `blocked` → `pro-review-blocked` で人間判断待ち

### review-expert の出力 (必須)

field 定義の正本は `op help payload review-finding`。
OP-managed (op-run) では review-expert は構造化 `reviews[]` を返すのみで投稿しない。記録は ClusterOrchestrator が
review state 文書へ行う (approve は `op review publish-approval`、それ以外は `op review state push`)。`op_run_session_id` は controller から
渡された値を転写し、自分で生成しない。Direct Mode では review-expert がユーザー許可後に自然文コメントを投稿してよい。

## 並列 spawn の制約

- 同時 spawn 数は `max_parallel` (デフォルト 3) で制御する
- 完了は run_in_background の通知で受ける (sleep / poll しない)。nested 層 (CO 配下) も並列化してよい
- 30 分以上応答がない subagent はタイムアウト扱いで隔離 (worktree は保持してユーザー判断に委ねる)
- 失敗 subagent のリトライは最大 1 回。それでも失敗したら他タスクに影響させず続行

## Marker Publish Validate (全 expert 共通契約)

hidden marker / completion report block を PR・Issue・Review コメントや body に publish する前に 2 段 validate する。

### Step 1: `op help marker <name>` で field 定義と例を確認

`op help marker --list` で一覧。publish する全 marker (`op-fingerprint` / `op-run-expert` / `op-post-check-expert` 等) が対象。

### Step 2: `op core marker-lint --body - --source-hint <kind> --strict` で実 body を lint

```bash
op core marker-lint --body - --source-hint <kind> --strict <<'EOF'
<展開後の最終 body>
EOF
```

`<kind>`: `pr-comment` / `pr-body` / `issue-body` / `review-comment` / `issue-comment` / `patrol-ledger-comment`。
両 Step が pass してから publish する。

### 既知の落とし穴 (Gotchas)

- lint するのは shell 変数・算術展開後の最終 body。`${review_round}` 等が未展開のままだと lint を通って空フィールドが混入する
- meta block と `## 見出し` の間に空行を 1 行以上挟む
- review / post-check の結果は marker block にせず、`op review publish-approval` (approve) / `op review state push` で記録する

## 司令官の責務 (subagent との分担)

| 司令官 (main Claude) | subagent (expert) |
|--------------------|------------------|
| Issue 取得・クラスタリング・タスク分解 | 個別タスクの investigate / plan / apply |
| worktree 作成・cleanup | worktree 内での作業 |
| 並列度管理・進捗監視 | 1 タスクの完遂 |
| PR open (マージは人間) | 自タスクの結果報告のみ |
| 結果統合・ユーザー報告 | |

司令官はコードを直接編集しない。すべて subagent に委譲する。
