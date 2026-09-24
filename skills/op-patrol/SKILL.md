---
name: op-patrol
description: 警備員的にリポジトリを巡回監査するスキル。明示 scope ではなく repo map と GitHub Issue Ledger に基づき、リスク重み・腐敗度・変更頻度から区画 (module / feature) を選定して read-only audit し、Critical/High だけを Issue 化する。巡回履歴は専用 GitHub Issue (Patrol Ledger) の body で管理し、ローカルキャッシュは持たない。「巡回」「op-patrol」「patrol」「警備」「定期監査」等のキーワードで起動。
---

# op-patrol: リスク重み付き巡回監査 (GitHub Issue Ledger 方式)

警備員のようにリポジトリを巡回し、リスク領域・腐敗領域・未巡回領域を read-only audit する。
区画はランダムではなく「リスク重み + 腐敗度 + 巡回履歴」で選ぶ。Critical/High だけを Issue 化する。
起票は人間承認後 (`--auto` は品質 gate を通過した分のみ)。巡回履歴は Patrol Ledger Issue だけに持ち、ローカル state は作らない。

---

## Issue Marker and Patrol Runtime Contract

op-scan「Expert Runtime and Routing Metadata Contract」に従う (正本 `_shared/runtime-contract.md`)。op-patrol 固有:

- security area では `subagent_type: "op-skill:security-expert"` で spawn し、security domain extension を必須出力とする。
- `env-expert` は planned。env area の Issue の `op-run-expert` は routing metadata に留める。
  release / installer / distribution の方針判断が主題なら `needs_human_decision` に倒す。

---

## op-scan との使い分け

| スキル | 対象選定 | 想定 |
|---|---|---|
| `op-scan [scope]` | 人間が指定 | 差分監査・特定領域の重点監査 |
| `op-patrol` | Patrol Ledger と repo map から agent が選定 | 普段触らない領域の腐敗検出・定期巡回 |

---

## 実行モード

| モード | 起動 | 動作 |
|---|---|---|
| 対話 (デフォルト) | `/op-patrol` | budget=medium で patrol plan 提示 → 承認後 audit |
| budget | `--budget small\|medium\|large` | small: 1〜2 area・各最大 2 expert / medium: 2〜3 area・各最大 3 / large: 4〜6 area・各最大 3 |
| 自動 | `--auto` | plan 承認 skip。品質 gate + auto-policy 通過分のみ起票 |
| 計画のみ | `--dry-run` | patrol plan 提示で停止 (audit しない) |
| リスク絞り | `--risk file-io,ipc,queue` | 指定リスクカテゴリの区画だけを候補にする |
| 腐敗優先 | `--stale` | stale_score を 1.5 倍 |
| 強制対象 | `--area <path>` | 指定 area を必ず選定する |
| 一時除外 | `--exclude <path>` | 指定 area を候補から外す (rotation 促進) |
| 再現巡回 | `--random-seed <N>` | jitter を固定 |
| Ledger 手動更新 | `--compact-ledger` | audit せずフェーズ7-2 の state 更新だけ行う |

組み合わせ可: `/op-patrol --budget large --stale --auto`。`/schedule` で週次 `--auto` 巡回を routine 化するのを推奨する。

---

## 参照ドキュメント

- op-scan skill — read-only policy / marker / ラベル / refactor ラベル表 (共通の正本)
- `~/.claude/skills/_shared/filing-gate.md` / `refute-contract.md` (§7) / `auto-policy.md` / `severity-rubric.md` / `dedup-policy.md`
- `~/.claude/skills/_shared/markers/patrol-markers.md` — `op-patrol-ledger-state` 文書の JSON schema
- `~/.claude/skills/_shared/runtime-contract.md` / `active-expert-registry.md` / `planned-experts.md` / `expert-spawn.md`
- `~/.claude/skills/_shared/common-setup.md` / `workflow-calling.md` / `github-channel.md` / `pr-templates.md`
- `~/.claude/skills/_shared/model-selection.md` — `area.audit_model`。audit / refute は read-only のため `fable` 禁止
- `~/.claude/skills/_shared/op-config-schema.md` — `domain_tags` / `complexity_thresholds`
- `~/.claude/workflows/op-patrol-audit.js` — 区画別 audit + refute (prompt / Patrol Finding Policy / schema の実行時正本)

---

## read-only policy

op-scan「read-only policy」に従う。加えて、フェーズ7 で Patrol Ledger Issue の state を
`op patrol ledger init` / `push` で更新することだけが許可される (他 Issue へのコメント・編集はしない。
例外は「architecture_debt の追跡方式」の既存 debt Issue 更新)。

---

## フェーズ0: 環境確認 + Patrol Ledger ロード

- `_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」を実行する。CLAUDE.md があれば読む。
- Workflow tool の capability preflight (`workflow-calling.md` §1)。`--dry-run` / `--compact-ledger` は skip。

### gh auth ありの場合

```bash
op patrol ledger pull --auto-find --json --out-file ledger.json
```

- `decision == "pass"`: `.details.issue_number` を `LEDGER_ISSUE` として以降で使う。
  複数 Ledger は最古を採用し `.warnings` を完了報告に転記する (自動 close しない)。
- 0 件 / parse 失敗: Ledger 未作成として扱い、フェーズ7 で作る (`--dry-run` なら作らず「初回 audit 時に作成予定」と表示)。
- mcp channel では `--input-json` に label:op-state の `mcp__github__search_issues` 素材を渡す (`github-channel.md` §6)。

### gh auth なしの場合

- 通常実行: 中断して `! gh auth login` を案内する。
- `--dry-run`: 暫定 plan モードで続行する (Ledger を読まない。incident_score と recently_scanned_penalty は 0。
  plan に「ledger 未参照の暫定 plan」と明記する)。

---

## Patrol Ledger Issue の仕様

- 巡回履歴の唯一の正本。title `[op-patrol] 巡回監査ステート / Patrol Ledger`、ラベル `op-patrol` / `op-state` / `do-not-close`。
- state (`area_state` / `state_rev` / `last_run_id` 等) は body の `op-patrol-ledger-state` 文書 1 箇所だけにある
  (schema は `patrol-markers.md`)。読み書きは `op patrol ledger pull` / `init` / `push` だけで行い、手動編集しない。
- この Issue は close しない。複数見つかっても自動 close しない。ローカルキャッシュは持たず毎回 body を読む。

---

## フェーズ1: repo map 構築

区画 (module / feature area) 単位で列挙する。ファイル単位にはしない。優先順位:

1. CLAUDE.md / `module_map` 設定
2. workspace 設定 (`Cargo.toml [workspace]` / `pnpm-workspace.yaml` / monorepo 規約)
3. 主要 directory の 2〜3 階層目 (例: `src-tauri/src/commands/export/`, `crates/job_queue/`)

```bash
find src-tauri/src apps crates packages -maxdepth 3 -type d 2>/dev/null \
  | grep -vE '(node_modules|target|dist|build|\.dart_tool|__pycache__|\.venv)' | sort > areas.txt
```

50 区画を超える場合は列挙を `Agent(subagent_type: Explore)` に委譲し要約だけ受け取る。
区画 metadata は `op patrol score` が内包する (人間向け overview が要るときだけ `op patrol repo-map --areas-file areas.txt --json`)。

---

## フェーズ2: patrol_score 計算と area 選定

```text
patrol_score = risk (0-50) + stale (0-30、--stale で 1.5x) + churn (0-20) + complexity (0-20)
             + incident (0-20) - recently_scanned_penalty (0-40) + starvation_bonus (0-60) + jitter (0-10)
```

算出は CLI が行う (詳細 `op-tools/docs/specs/patrol-score.md`)。

```bash
FLAGS=$(op patrol ledger to-flags --state ledger.json)    # Ledger 未作成 / 暫定 plan では空
op patrol score --areas-file areas.txt $FLAGS --run-id "$RUN_ID" \
  [--random-seed <N>] [--stale] [--risk <cats>] [--exclude <area>] [--incident-count <area>=<n>] \
  --json --out-file scored.json
op patrol area-select --input-file scored.json --budget <small|medium|large> [--include <area>] --json
```

- `RUN_ID` は `run-YYYY-MM-DD-NNN`。フェーズ4 / 7 でも同じ値を使う。
- `--incident-count` は score 上位 10 区画だけ `op issue list --search "<area path>" --state all --limit 30 --json` の件数を渡す
  (mcp channel では `mcp__github__search_issues` の `total_count`)。
- `area-select` の `selected[]` を巡回対象、`excluded_top[]` を「今回除外した上位候補」として plan に載せる。選定理由を必ず記録する。

---

## フェーズ3: patrol plan 提示

```
## op-patrol plan (run-2026-05-03-001)

budget: medium / random-seed: (auto) / patrol-ledger: #42 (前回 run-2026-04-01-001 / state_rev 41)

### 今回巡回する area
| # | area | score | experts | 主な理由 |
|---|---|---|---|---|
| 1 | src-tauri/src/commands/export | 94 | security-expert, debug-expert | file-io + ipc + 前回巡回から62日 |

### 今回除外した上位候補
| area | score | 除外理由 |
|---|---|---|
| crates/job_queue | 70 | 7日前に巡回済み |

### 推定コスト
- 並列 spawn: N expert (M area) / Issue 起票上限: Critical/High のみ

この plan で audit を開始しますか?
1. このまま実行  2. area を選択 (例: 1,3)  3. budget を変更  4. キャンセル
```

`--dry-run` はここで停止する。`--auto` は承認を skip して実行する。

---

## フェーズ4: expert 並列 spawn (read-only audit)

全 expert は呼ばない。area の性質に応じて 1〜3 expert に絞る。

### area → expert マッピング

op-scan `--from-issue` もこの表を使う。

| area の性質 | 呼ぶ expert |
|---|---|
| file-io / path / export / import / backup | security + debug |
| queue / scheduler / worker / job | debug + optimize + refactor |
| Tauri command / IPC 境界 | security + debug + ux-ui-audit + feature |
| auth / permission / capability | security + debug |
| db / migration / schema | security + debug + refactor |
| ext-cmd / subprocess | security + debug |
| UI feature (Vue / Flutter component) | ux-ui-audit + designer + debug |
| theme / token / design-system 中央定義 | designer + refactor |
| 共通 component (Button / Dialog / Form 等) | designer + ux-ui-audit + feature |
| schema / DTO / API boundary | debug + refactor + feature |
| tests / spec / e2e / fixture / mock / coverage 設定 | test + debug |
| snapshot / golden / visual regression | test + ux-ui-audit + designer |
| CI / workflow / test runner 設定 | test + debug |
| flaky 履歴 / skip 多発 / false pass 疑い | test |
| 古い巨大 module (stale + complexity 高) | refactor + debug + feature |
| 新規追加 module / 短い history / 高 churn | feature + debug |
| 同種機能が複数あり実装パターンに揺れ | feature + refactor |
| 上記以外 | debug + refactor |

UI 系 area で budget が足りないときの絞り方:

| budget | UI feature | theme / token | 共通 component |
|---|---|---|---|
| small | ux-ui-audit のみ | designer のみ | designer のみ |
| medium | ux-ui-audit + designer | designer + refactor | designer + ux-ui-audit |
| large | 上記 + debug / feature | 上記 + feature | 上記 + feature |

主要導線 area (login / 一覧 / 申込 / 提出 等) は small でも ux-ui-audit を必ず入れる。theme / token 定義 area は designer を必ず入れる。

installed check は op-scan フェーズ1 と同じ (`op core registry-verify --lens registry-agent`、除外した expert は完了報告に併記)。

### op-patrol-audit Workflow 呼び出し

```
const auditOut = await Workflow({
  name: "op-patrol-audit",
  args: {
    today: "<YYYY-MM-DD>",                 // controller が date -u +%F で確定
    run_id: "<RUN_ID>",
    regions: [
      {
        id: "<region 短縮 id (例: export)>",
        area: "<area path>",
        risk_score: <任意>,
        stale_score: <任意>,
        last_scanned_at: "<area_state の RFC3339 | null>",
        selection_reason: "<選定理由 1-2 行>",
        expert_list: [ { name: "<expert-name>", model: "<area.audit_model>" } /* 1〜3 件 */ ],
      },
    ],
  },
});
// auditOut.result.regions[] = { region_id, area, findings[], verdicts[], audit_report }
// auditOut.result.summary  = 全 region 合計
```

`.result.*` の unwrap は `workflow-calling.md` §2。model は `model-selection.md` §5.2 (single/typical → sonnet、complex/critical → opus)。

---

## Patrol Finding Policy (op-scan より厳しい)

実行時の正本は `workflows/op-patrol-audit.js` の `buildAuditPrompt` 内のブロック (好み・命名・スタイル、根拠の薄い将来不安、
Medium/Low、巡回スコープ外の大改修、未読箇所の推測は起票しない)。変更は js 側で行う。
**「報告しない判断」を恐れない。** 警備員は「異常なし」を報告できる。

---

## フェーズ4.5: refute 適用

`auditOut.result.regions[].verdicts` を同じ region の findings に `finding_ref` で突合して適用する。
適用順・verdict の扱い・表示ルール・走る経路は `_shared/refute-contract.md` §7 が正本。
verdict は `finding_ref` の region prefix (`<region_id>:<expert>#<idx>`) の region にだけ適用する。

### trust model

`refute-contract.md` §7.2 に従う。

---

## フェーズ5: 結果統合・fingerprint 重複除外

順序不変則 (逆転禁止): **refute → severity gate → 統合 → bulk-group → dedup (`op scan dedup`) → 起票 → Ledger 更新**。
Ledger を起票より先に更新しない (起票失敗時に Ledger が誤情報を持つ)。

### 5-1. 統合

op-scan フェーズ2-1 と同じ (±5 行 / title 類似で統合、severity の高い方を採用)。

### 5-1-b. バッチ起票判定

```bash
op scan bulk-group --findings-json findings.json --json   # mcp channel では --input-json を併用
```

### 5-2. fingerprint 生成 + 重複除外

`op core fingerprint` で生成し、`op scan dedup --findings-json drafts.json --json` で判定する (`filing-gate.md` §2)。
重複で skip した件数は完了報告に記録する。

### architecture_debt の追跡方式 (Phase 1)

refactor の debt 系 finding (`architecture_debt` / `staged_refactor` / `needs_spec_decision`) は既存 Issue を更新し、重複起票しない。

1. 候補取得 (3 ラベルそれぞれで検索し、合わせる):
   ```bash
   op issue list --label auto-report --label op:architecture-debt --limit 100 --json
   op issue list --label auto-report --label op:staged-refactor --limit 100 --json
   op issue list --label auto-report --label needs:spec-decision --limit 100 --json
   op issue view-batch <候補番号...> --include meta --json
   ```
   mcp channel では `mcp__github__search_issues` (`repo:<owner>/<repo> is:issue is:open label:auto-report`) の素材から同じ 3 ラベルで絞る。
2. 同一 debt の判定 (最初に一致したもので確定): ① `op-fingerprint-bulk` 完全一致 → ② `op-fingerprint` 完全一致 →
   ③ affected_paths 類似 + bulk_group 一致 + symbols 類似。
3. 一致あり: 新規起票せず、既存 Issue に `op issue comment` で今回の `last_seen_at` / `affected_paths` / `risk_trend` を追記し、
   本文の `seen_count` を +1 して `op issue edit-body` で更新する。`affected_paths` が増えていれば `needs:triage` を付ける。
4. 一致なし: `first_detected_at = last_seen_at = today`、`seen_count = 1` で新規起票する。

`first_detected_at` / `seen_count` / `risk_trend` は agent に推測させず、controller が既存 Issue から導出して上書きする。

### 5-3. 並び替え

1. severity (critical > high)
2. expert (security > debug > refactor > optimize > ux-ui > design > feature > test)
3. area の patrol_score 降順
4. ファイル名昇順

---

## フェーズ6: ユーザー承認 + Issue 起票

### 対話モード (デフォルト)

```
## op-patrol 巡回結果 (run-2026-05-03-001)

### サマリ
| area | Critical | High | 既存重複 |
|---|---|---|---|
| src-tauri/src/commands/export | 1 | 1 | 1 |

### 起票候補
| # | severity | expert | area | title |
|---|---|---|---|---|
| 1 | critical | security | commands/export | 任意ファイル書き込み (パス検証なし) |

### 既存 Issue 重複でスキップ
- #112 と fingerprint 一致: jobs の queue 詰まり懸念

### 要確認 (manual_review_bucket / 類似 Issue あり)
- evidence_grade=requires_runtime: apps/desktop/src/features/job-board のタブ切替時の状態漏れ疑い

起票しますか?
1. すべて起票  2. Critical のみ  3. 番号で個別選択  4. キャンセル (Ledger は更新する)
```

### 自動モード (`--auto`)

op-scan フェーズ3「自動モード」と同じ (`op scan eligibility` + `op scan dedup`、満たさないものは `manual_review_bucket`)。
`--auto` でも refute / severity gate / dedup は飛ばさない。

### Issue 本文・marker・ラベル

- 本文は `pr-templates.md`「Issue 本文 (指示書フル版)」(バッチは「バッチ版」)。scope_in / scope_out / verification_steps /
  success_criteria / gotchas を欠かさない。巡回 area と run_id は本文の自然文で書く。
- marker は op-scan フェーズ4「Issue 本文 hidden marker」と同じ (`op-fingerprint` / `op-run-expert` / `op-post-check-expert`、
  バッチと debt 系は `op-fingerprint-bulk`)。値の補完は op-scan「domain → marker パターン表」。
- ラベルは op-scan フェーズ4「ラベル付与」+ `patrol` + `area:<area 短縮形>` (例: `area:export`)。
  refactor は op-scan「domain=refactor 固有のラベル付与ルール」を同じく適用する。
- 起票は `filing-gate.md` §3 (op-scan「Marker Publish Validate」→ `op issue create` を 1 件ずつ直列)。

---

## フェーズ7: Patrol Ledger 更新 + 完了報告

起票が終わってから行う。対話でキャンセルした場合も巡回した area の state は更新する。

### 7-1. Ledger Issue が未作成なら作成

```bash
op patrol ledger init --title "[op-patrol] 巡回監査ステート / Patrol Ledger" --json
op patrol ledger pull --issue "$LEDGER_ISSUE" --json --out-file ledger.json   # 新規作成時は取り直す
```

`init` は冪等 (既存があれば skip)。mcp channel では `--input-json` に既存 Ledger 探索素材を渡し、emit された call-spec を
`github-channel.md` §3-§4 で完遂する。`--dry-run` はここに到達しない。

### 7-2. state (body) 更新

```bash
op patrol ledger push --issue "$LEDGER_ISSUE" --run-id "$RUN_ID" --previous-state ledger.json \
  --updated-area "<area1>" --updated-area "<area2>" --timestamp-now [--dry-run]
```

- previous state の `last_run_id` が `--run-id` と同じなら no-op (`decision: "warn"`)。
- mcp channel では body 全置換の `op issue edit-body` call-spec が emit されるので `github-channel.md` §3-§4 で完遂する。

### 7-3. 完了報告

```
## op-patrol 完了 (run-2026-05-03-001)

### 巡回 area
- src-tauri/src/commands/export (security + debug)

### 起票結果
| # | Issue | severity | expert | area | title |
|---|---|---|---|---|---|
| 1 | #125 | critical | security | commands/export | 任意ファイル書き込み |

### 統計
- 起票 N / スキップ (重複) N / debt 既存 Issue 更新 N / manual_review_bucket N / 検出 0 件 area N
- refute: confirmed N / refuted N / downgrade N (`auditOut.result.summary`)
- Patrol Ledger: #42 (state_rev 41→42)

### refute で偽陽性/過大判定 (起票しない)
- [refuted] <area> / <expert> / "<title>" — evidence_excerpt: `<再 Read したコード片>` (<file:line-line>)
- (なければ「なし」。refute は近似 gate で、取りこぼしは次回巡回で再検出する前提)

### 次の巡回候補
- crates/job_queue (score 70, 7日前巡回済)

### 警告
- Ledger 複数検出 / parse warning / SKIPPED_PLANNED (なければ「なし」)

次は `/op-run` で起票 Issue を実装できます。
```
