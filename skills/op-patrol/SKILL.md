---
name: op-patrol
description: 警備員的にリポジトリを巡回監査するスキル。明示 scope ではなく repo map と GitHub Issue Ledger に基づき、リスク重み・腐敗度・変更頻度から区画 (module / feature) を選定して read-only audit し、Critical/High だけを Issue 化する。巡回履歴は専用 GitHub Issue (Patrol Ledger) の body で管理し、ローカルキャッシュは持たない。「巡回」「op-patrol」「patrol」「警備」「定期監査」等のキーワードで起動。
---

# op-patrol: リスク重み付き巡回監査 (GitHub Issue Ledger 方式)

警備員のようにリポジトリを巡回し、リスク領域・腐敗領域・未巡回領域を read-only audit する。
区画はランダムではなく「リスク重み + 腐敗度 + 巡回履歴」で選ぶ。Critical/High だけを Issue 化する。
起票は人間承認後 (`--auto` は品質 gate を通過した分のみ)。巡回履歴は Patrol Ledger Issue だけに持ち、ローカル state は作らない。
対象を人間が指定する差分監査は op-scan を使う。

---

## Issue Marker and Patrol Runtime Contract

op-scan「Expert Runtime and Routing Metadata Contract」に従う。`env-expert` は planned なので env area の Issue の
`op-run-expert` は routing metadata に留め、release / installer / distribution の方針判断が主題なら `needs_human_decision` に倒す。

---

## 実行モード

| モード | 起動 | 動作 |
|---|---|---|
| 対話 (デフォルト) | `/op-skill:op-patrol` | budget=medium で patrol plan 提示 → 承認後 audit |
| budget | `--budget small\|medium\|large` | area 数は `op patrol area-select` が決める。area ごとの expert は small 最大 2 / medium・large 最大 3 |
| 自動 | `--auto` | plan 承認 skip。品質 gate + auto-policy 通過分のみ起票 |
| 計画のみ | `--dry-run` | patrol plan 提示で停止 (audit しない) |
| リスク絞り | `--risk file-io,ipc,queue` | 指定リスクカテゴリの区画だけを候補にする |
| 腐敗優先 | `--stale` | stale_score を 1.5 倍 |
| 強制対象 | `--area <path>` | 指定 area を必ず選定する |
| 一時除外 | `--exclude <path>` | 指定 area を候補から外す (rotation 促進) |
| 再現巡回 | `--random-seed <N>` | jitter を固定 |
| Ledger 手動更新 | `--compact-ledger` | audit せずフェーズ7-2 の state 更新だけ行う |

組み合わせ可: `/op-skill:op-patrol --budget large --stale --auto`。

---

## 参照ドキュメント

op-scan skill (read-only policy / Marker Publish Validate / refactor ラベル表)、`_shared/filing-gate.md`、`refute-contract.md` §7、
`markers/patrol-markers.md` (`op-patrol-ledger-state` schema)、`workflows/op-patrol-audit.js` (audit prompt / Patrol Finding Policy / schema の実行時正本)。

---

## read-only policy

op-scan「read-only policy」に従う。加えて、フェーズ7 で Patrol Ledger Issue の state を
`op patrol ledger init` / `push` で更新することだけが許可される (他 Issue へのコメント・編集はしない。
例外は「architecture_debt の追跡方式」の既存 debt Issue 更新)。

---

## フェーズ0: 環境確認 + Patrol Ledger ロード

`_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」を実行する。Workflow の capability preflight は `--dry-run` / `--compact-ledger` では skip する。

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

巡回履歴の唯一の正本。state は body の `op-patrol-ledger-state` 文書 1 箇所だけにあり (schema は `patrol-markers.md`)、
読み書きは `op patrol ledger pull` / `init` / `push` だけで行う。手動編集・close しない。複数見つかっても自動 close しない。

---

## フェーズ1: repo map 構築

区画 (module / feature area) 単位で列挙する。ファイル単位にはしない。優先順位:

1. 対象 repo の CLAUDE.md に書かれた module 構成
2. workspace 設定 (`Cargo.toml [workspace]` / `pnpm-workspace.yaml` / monorepo 規約)
3. 主要 directory の 2〜3 階層目 (例: `src-tauri/src/commands/export/`, `crates/job_queue/`)

```bash
find src-tauri/src apps crates packages -maxdepth 3 -type d 2>/dev/null \
  | grep -vE '(node_modules|target|dist|build|\.dart_tool|__pycache__|\.venv)' | sort > areas.txt
```

区画 metadata は `op patrol score` が内包する (人間向け overview が要るときだけ `op patrol repo-map --areas-file areas.txt --json`)。

---

## フェーズ2: patrol_score 計算と area 選定

patrol_score (risk / stale / churn / complexity / incident / 巡回済み penalty / starvation / jitter) は CLI が算出する。

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
- `area-select` の `selected[]` を巡回対象、`excluded_top[]` を「今回除外した上位候補」として選定理由付きで plan に載せる。

---

## フェーズ3: patrol plan 提示

```
## op-patrol plan (<RUN_ID>)

budget: medium / random-seed: (auto) / patrol-ledger: #<N> (前回 <run_id> / state_rev <n>)

### 今回巡回する area
| # | area | score | experts | 主な理由 |
|---|---|---|---|---|

### 今回除外した上位候補
| area | score | 除外理由 |
|---|---|---|

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

主要導線 area (login / 一覧 / 申込 / 提出 等) は small でも ux-ui-audit を入れる。theme / token 定義 area は designer を入れる。

installed check は op-scan フェーズ1 と同じ (`op core registry-verify --lens registry-agent`、`workflow-calling.md` §3)。

### op-patrol-audit Workflow 呼び出し

```
const auditOut = await Workflow({
  name: "op-skill:op-patrol-audit",
  args: {
    today: "<YYYY-MM-DD>",
    run_id: "<RUN_ID>",
    regions: [
      {
        id: "<region 短縮 id (例: export)>",
        area: "<area path>",
        risk_score: <任意>,
        stale_score: <任意>,
        last_scanned_at: "<area_state の RFC3339 | null>",
        selection_reason: "<選定理由 1-2 行>",
        expert_list: [ { name: "<expert-name>", model: "<model>" } /* 1〜3 件 */ ],
      },
    ],
  },
});
// auditOut.result.regions[] = { region_id, area, findings[], verdicts[], audit_report }
```

- `expert_list[].name` は prefix なしの素の agent 名 (`security-expert`)。`op-skill:` prefix は workflow が付ける。
- model は `model-selection.md` §5.2。unwrap / args 規約は `workflow-calling.md` §2 / §4。

---

## Patrol Finding Policy (op-scan より厳しい)

実行時の正本は `workflows/op-patrol-audit.js` の `buildAuditPrompt` 内のブロック。変更は js 側で行う。
「異常なし」も正当な巡回結果である。

---

## フェーズ4.5: refute 適用

`auditOut.result.regions[].verdicts` を同じ region の findings に `finding_ref` で突合して適用する (`_shared/refute-contract.md` §7)。

### trust model

`refute-contract.md` §7.2 に従う。

---

## フェーズ5: 結果統合・fingerprint 重複除外

順序は `refute-contract.md` §7.1。Ledger 更新は起票の後に行う。

- 5-1. 統合: op-scan フェーズ2-1 と同じ。
- 5-1-b. バッチ起票判定: op-scan フェーズ2-1-b と同じ (`op scan bulk-group`)。
- 5-2. fingerprint 生成 + 重複除外: op-scan フェーズ2-2 と同じ。重複で skip した件数は完了報告に記録する。

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

op-scan フェーズ2-3 の 2 番目 (expert) の後に「area の patrol_score 降順」を挟む。

---

## フェーズ6: ユーザー承認 + Issue 起票

### 対話モード (デフォルト)

```
## op-patrol 巡回結果 (<RUN_ID>)

### サマリ
| area | Critical | High | 既存重複 |
|---|---|---|---|

### 起票候補
| # | severity | expert | area | title |
|---|---|---|---|---|

### 既存 Issue 重複でスキップ
- #<N> と fingerprint 一致: <title>

### 要確認 (manual_review_bucket / 類似 Issue あり)
- evidence_grade=requires_runtime: <area> の <内容>

起票しますか?
1. すべて起票  2. Critical のみ  3. 番号で個別選択  4. キャンセル (Ledger は更新する)
```

### 自動モード (`--auto`)

op-scan フェーズ3「自動モード」と同じ (`op scan eligibility` + `op scan dedup`、満たさないものは `manual_review_bucket`)。
`--auto` はフェーズ7 (Ledger 更新と完了報告) まで完遂する。途中で止まってよいのは gh 認証失敗 / Workflow 利用不可 / Ledger 取得失敗のときだけ。

### Issue 本文・marker・ラベル

- 本文は `pr-templates.md`「Issue 本文 (指示書フル版)」(バッチは「バッチ版」)。巡回 area と run_id は本文の自然文で書く。
- marker とラベルは `pr-templates.md`「Issue 本文 hidden marker」/「domain → marker / ラベル表」。ラベルには `patrol` と
  `area:<area 短縮形>` (例: `area:export`) を足す。refactor は op-scan「domain=refactor 固有のラベル付与ルール」も適用する。
- 起票は `filing-gate.md` §3 (op-scan「Marker Publish Validate」→ `op issue create` を 1 件ずつ直列)。

---

## フェーズ7: Patrol Ledger 更新 + 完了報告

起票が終わってから行う。対話でキャンセルした場合も巡回した area の state は更新する。

### 7-1. Ledger Issue が未作成なら作成

```bash
op patrol ledger init --title "[op-patrol] 巡回監査ステート / Patrol Ledger" --json
op patrol ledger pull --issue "$LEDGER_ISSUE" --json --out-file ledger.json   # 新規作成時は取り直す
```

mcp channel では `--input-json` に既存 Ledger 探索素材を渡し、emit された call-spec を `github-channel.md` §3-§4 で完遂する。

### 7-2. state (body) 更新

```bash
op patrol ledger push --issue "$LEDGER_ISSUE" --run-id "$RUN_ID" --previous-state ledger.json \
  --updated-area "<area1>" --updated-area "<area2>" --timestamp-now [--dry-run]
```

mcp channel では body 全置換の `op issue edit-body` call-spec が emit されるので `github-channel.md` §3-§4 で完遂する。

### 7-3. 完了報告

```
## op-patrol 完了 (<RUN_ID>)

### 巡回 area
- <area> (<experts>)

### 起票結果
| # | Issue | severity | expert | area | title |
|---|---|---|---|---|---|

### 統計
- 起票 N / スキップ (重複) N / debt 既存 Issue 更新 N / manual_review_bucket N / 検出 0 件 area N
- refute: confirmed N / refuted N / downgrade N (controller が trust model を適用した後の集計)
- Patrol Ledger: #<N> (state_rev <n>→<n+1>)

### refute で偽陽性/過大判定 (起票しない)
- [refuted] <area> / <expert> / "<title>" — evidence_excerpt: `<再 Read したコード片>` (<file:line-line>)
- (なければ「なし」)

### 次の巡回候補
- <area> (score <n>)

### 警告
- Ledger 複数検出 / parse warning / SKIPPED_PLANNED (なければ「なし」)

次は `/op-skill:op-run` で起票 Issue を実装できます。
```
