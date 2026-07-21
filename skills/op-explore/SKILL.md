---
name: op-explore
description: op-plan/op-architect の上流 phase -1 (発散 / discovery)。.playground/ に HTML ヒアリング書 + 複数 UI パターンを試作し file:// で実物を見て選び、spec_only な decision record に卒業させて op-plan へ疎結合 handoff する Direct Mode 固定スキル。「op-explore」「playground」「ヒアリング」「試作」「発散」「方向性を決めたい」「複数パターン見たい」等のキーワードで起動。新 active expert ゼロ (ADR-0013)。
# ADR-0014 / ADR-0009 L20: 計画フェーズの effort 無保証対策。effort は session 値を override (floor 不可) する。
# scope=起動 turn → 初回ヒアリング + art-direction commit をカバー。以降の往復 turn は session 値へ自動復帰。
# 発散 / craft は ceiling 課題 (ADR-0013 決定I/K) のため計画フェーズ同様に最高 effort を pin する。
effort: max
---

# op-explore — 発散 / discovery (phase -1)

<!--
機能概要: ユーザーの構想がまだ固まっていない発散段階を埋める Direct Mode スキル。
          メインを汚さない `.playground/` で HTML ヒアリング書 + 複数 UI パターンを試作し、
          file:// で実物を見て選び、きれいになったら spec_only decision record に卒業して op-plan へ渡す。
作成意図: OP skill 群は収束しかなかった (architect/plan = 方向は決まっている前提)。本スキルが phase -1
          (候補を広げて実物を見て選ぶ) を埋め、op-plan=収束 / op-explore=発散 の対で family を完成させる。
          ADR-0013 (op-explore / playground discovery) を正本とする。
注意点: 新 active expert ゼロ / 新正本ゼロ。decision record は新正本を作らず
        design spec=expert-design / handoff=issue_draft.body / craft floor=visual-quality-rubric への射影に分解する。
        本スキルは起票しない (起票は op-plan 経由 = 不変則8 を壊さない)。
-->

## このスキルの位置づけ

`op-plan` / `op-architect` の **上流 phase -1 (発散 / discovery)**。ユーザー自身もまだ何を作りたいか固まっていない段階で、
候補を広げて実物 (`file://` で開けるレンダリング済み HTML) を見て選ぶ工程を担う。出力は**コードでなく decision record**
(spec_only) で、op-plan へ疎結合 handoff する。

動機 (3 つの実痛点):

- (a) 試行錯誤でリポジトリが汚れる → `.gitignore` 済 `.playground/` で隔離
- (b) 出来上がってからの手戻りが多い → 実物を見て早期に方向を確定
- (c) ヒアリング不足で「思っていたのと違う方向」へ進む → 視覚的ヒアリング書 + 本質質問

> **棲み分け**: 方向が既に決まっている中量級 feature は `op-plan`、ADR が要る大規模設計は `op-architect`、
> コード監査は `op-scan` / `op-patrol`。op-explore は「**まだ決まっていない・実物を見て決めたい**」専用。

## このスキルは Direct Mode 固定 (invocation-mode 判定)

本スキルの司令官 (op-explore controller) は **常に Direct Mode** で動作する (op-architect ミラー)。

- 人間が直接起動する前提。**質問 OK・対話 OK** (発散はユーザーとの対話が本体)。
- **OP-managed 経路を持たない** (`op-*` skill から自動 spawn されない)。`invocation_mode: op_managed` で呼ばれることはない。
- **plan mode (EnterPlanMode) は使わない** (op-architect 同様。Direct commit を Write tool で行う)。

ただし**内部から spawn する designer-expert / ux-ui-audit-expert は OP-managed Mode** として扱う
(二層 invocation): spawn prompt に必ず `invocation_mode: op_managed` + 共通宣言を含める。判定が曖昧でも子 expert は
OP-managed 側に倒す (`_shared/invocation-mode.md (>=1)`)。

## 司令官の責務

1. **ヒアリング** — 本質質問で構想・意図・制約を引き出す (浅い「どれが好き」でなく JTBD / 文脈 / 制約)。
2. **art-direction commit** — purpose / tone / differentiation を**構造的拘束セット**に articulation させ、exemplar を取得する (決定I)。
3. **試作生成の orchestration** — designer-expert を spawn (thin) または `op-explore-render.js` workflow 起動 (full) で実物を `.playground/` に生成。
4. **反応ループ** — 回答 (採用 / 部分的 / 違う + タグ + コメント) を読み戻し、次 round で作り直す補正。
5. **人間の選択を残す** — judge は順位付けせず decision-matrix を構造化するだけ。**選択は人間** (構想の核)。
6. **卒業** — 確定した方向を spec_only decision record に蒸留し commit、op-plan へ handoff。

司令官は試作 HTML を**直接書かない** (designer-expert に委譲 = 不変則7)。decision record commit は op-architect の ADR commit と
同じく不変則7 対象外 (新例外宣言は設けない)。

## 二層構成と playground ライフサイクル (決定E / 決定G)

| 層 | 場所 | git | 中身 |
|---|---|---|---|
| 揮発スクラッチ | `/.playground/<session-id>/` | 追跡外 (gitignore) | `index.html` / `pattern-*.html` (自己完結・`file://`) / `logic.js` / `answers/<round>.json` / `refs/` (人間配置 exemplar スクショ) |
| 卒業物 | `docs/playground/<session-id>.md` (+ `docs/playground/<session-id>/` に anchored スクショ) | 追跡 | spec_only decision record |

- `session-id` = `explore-<short>-YYYYMMDD-HHMMSS`。
- session 状態機械 = **graduate**(op-plan へ卒業) / **discard**(`.playground/_discarded/<id>-<ts>/` へ mv、非自動削除) / **parked**(回答待ち中断 → 別会話で session-id 再開、**default 挙動**)。
- 腐敗防止は fs 駆動 (Ledger なし)。Playground Ledger Issue / op-source enum bump / op-sweep 結合は将来 opt-in (Wave4、クロスマシン要件が実証されてから)。

---

## フェーズ0: preflight

### 0-pre. schema-check (任意、軽量)

`_shared/version-check.md (>=2)` の起動時チェックに従い、本 SKILL.md 「参照ドキュメント」節の `(>=N)` と各 `_shared` ファイル
冒頭の `schema_version` を突き合わせる。mismatch は **warning に留め停止しない** (不変則2)。

### 0-session. 既存 active session 列挙 + 並行起動 gate + stale 警告 (fs 駆動、決定G)

Direct Mode 固定ゆえ人間の並行起動が常態。起動時に既存 active session を列挙し再開 / 新規を gate する
(`feedback_claim_conflict_precheck` 同型)。Ledger は持たず `.playground/` を直接見る。

```bash
# 既存 playground session を列挙 (.playground/ が無ければ空)。
# last_touched > grace (default 14 日) の active session を stale として警告する。
GRACE_DAYS="${GRACE_DAYS:-14}"
if test -d .playground; then
  echo "=== 既存 playground session ==="
  for d in .playground/explore-*/; do
    test -d "$d" || continue
    ID=$(basename "$d")
    # 最終更新からの経過日数 (ファイル群の最新 mtime)
    LAST=$(find "$d" -type f -printf '%T@\n' 2>/dev/null | sort -nr | head -1)
    NOW=$(date +%s)
    if test -n "$LAST"; then
      AGE_DAYS=$(( ( NOW - ${LAST%.*} ) / 86400 ))
      FLAG=""
      test "$AGE_DAYS" -gt "$GRACE_DAYS" && FLAG="  ⚠️ stale (>${GRACE_DAYS}日未更新、discard 検討)"
      echo "- $ID  (最終更新 ${AGE_DAYS}日前)${FLAG}"
    else
      echo "- $ID"
    fi
  done
else
  echo "=== playground session なし (新規作成) ==="
fi
```

- 既存 active session がある場合、ユーザーに **再開 (session-id 指定) / 新規作成 / discard** を提示してから進む。
- stale session は discard (`.playground/_discarded/` へ mv) を勧めるが**自動削除しない** (誤破棄ロールバック余地)。

### 0-cap. Dynamic Workflows capability preflight (`playground_mode=full` のときのみ、Wave3)

`full` モード (N パターン生成) は `workflows/op-explore-render.js` を `Workflow({name:'op-explore-render'})` で呼ぶため
**Dynamic Workflows を hard dependency** とする (ADR-0009 決定5、フォールバック無し)。司令官は full 確定後・workflow 起動前に
Workflow tool が利用可能かを確認し、不可なら **hard-fail** して「Dynamic Workflows 対応環境で再実行 / または thin で続行」を案内する。
`thin` / `none` は Workflow を使わないため preflight 対象外。巻き戻しは git tag (workflow 不使用なので `.playground/` の手動退避)。

### 0-channel. `file://` 視覚確認チャネル (単一障害点、Wave0 hard precondition)

人間が試作 HTML を見る経路を確認する (本スキルの存在意義の単一障害点)。

```bash
# WSL → Windows ブラウザで開く UNC パスを提示する (PoC 実証済の経路)。
if command -v wslpath >/dev/null 2>&1; then
  echo "確認チャネル = Windows ブラウザ (wslpath 有)。生成後に次のパスを提示する:"
  echo "  例) explorer.exe \"\$(wslpath -w .playground/<id>/index.html)\""
else
  echo "確認チャネル = ローカルブラウザ / Read 提示 / スクショ のいずれか (ユーザーに確認)。"
fi
```

ユーザーが普段どう開くか (Windows ブラウザ直開き / Read 提示 / スクショ) を最初に確認し、以降そのチャネルで実物を提示する。

---

## フェーズ1: ヒアリング + art-direction commit + playground_mode 導出

### 1-1. 本質質問でヒアリング

「どのレイアウト / 色か」と**結論を選ばせる浅い質問**はユーザーにデザイナーの仕事を丸投げし ceiling を下げる。
代わりに**意図・文脈・制約を引き出す本質質問**でフレーム化する (本質質問7型):

1. **仕事と成功 (JTBD)** — この画面/機能でユーザーは何を完了したいか、成功とは何か
2. **利用文脈** — いつ / どこで / どんな状態で使うか (頻度・デバイス・割込み)
3. **最重要の一点 (hierarchy 起点)** — 一番先に目に入るべき / 一番大事な 1 つは何か
4. **判断と取捨** — 何を見せ何を隠すか、優先順位
5. **トーンは参照との対比で** — 「A ではなく B 寄り」と既知のものとの対比で (形容詞単体は曖昧)
6. **参考と禁忌 (exemplar + anti-pattern)** — 良いと思う実例 / 絶対に避けたい例
7. **現実の制約・エッジ状態** — 技術制約・データ最大/最小・loading/error/empty/権限

> 多問を 1 問 1 答で訊くのは高コスト。視覚的ヒアリング書 (フェーズ2 で `.playground/index.html` に生成、Wave5 でアプリ・エンジン化) に
> まとめて答えてもらうと手戻りが減る。TIP (インラインヒント) で「なぜ訊くか」を併示する。

### 1-2. art-direction commit gate (決定I、ceiling を埋めず構造化)

craft / taste (美しさ・洗練) は静的検証では測れない **ceiling** で、本スキルが「埋めず構造化する」唯一の場。
purpose / tone / differentiation を**形容詞ラベルでなく discrete な構造的拘束セット**に articulation させる
(形容詞ラベル差 = editorial/minimal では mode collapse が形容詞ガチャでも起きる):

| 拘束軸 | 例 (案ごとに互いに非重複値を強制割当) |
|---|---|
| typography 種別 | serif 見出し / geometric sans / humanist sans / monospace アクセント |
| layout 対称性 | 左右対称グリッド / 非対称 (黄金比的) / 中央集約 / モジュラー |
| color 戦略 | monochrome + 1 accent / analogous / 高彩度 vs くすみ / dark-first |
| 密度 | 余白多め editorial / 高密度業務 / 中庸 |
| 装飾予算 | フラット / 影で奥行き / 罫線で秩序 / 余白だけで秩序 |

#### exemplar acquisition (calibration、段0 必須入力、決定I)

decision-matrix が地図でも縮尺 (何が world-class か) が無いと人間も generic を選ぶ。**exemplar が縮尺を与える**ため、
art-direction commit の**必須入力**として取得する (優先順):

1. **内部 exemplar** — repo 内の良い画面を `file://` パスで指名し生成 agent に Read させる。
2. **人間スクショ** — ユーザーが `.playground/<id>/refs/` に事前配置 (= **視覚 modality の唯一確実経路**)。
3. **reference-map Tier2 の特定パターン** — **craft 原則の言語化付き** (「restraint が効いている」等) で記述注入。

- `WebFetch` は page を markdown に変換するため**視覚足場にならない**。Figma MCP は OAuth 認証が前提 (未認証なら不可)。
- **視覚 exemplar が一つも無い場合は `full → thin` に downgrade** する (generic 回帰の fail-safe)。
- exemplar 選定規律 = 「trendy な見た目」でなく「**craft 原則 (restraint / hierarchy / token discipline) が高い理由を言語化できる**」もののみ許可 (philosophy 原則12 流行模倣の歯止め)。

> craft floor (一貫性検査) と craft ceiling (art-direction) の方法論・Tier は `visual-craft-tiers.md` を参照。
> playground スコープに限り reference-map の exemplar 封印を art-direction 足場として解除する (持ち込むのは意匠でなく craft 原則の言語化)。

### 1-3. playground_mode の導出 (controller pre-step、本節が正本、決定F)

`design_depth` (enrichment 内の役構成) と**直交する** `playground_mode (none | thin | full)` を controller が **spawn ゼロの
heuristic 単発判断**で導出する。**正本は本節**であり `issue-enrichment.md` には混ぜない (enrichment が消費しない軸)。

| playground_mode | 条件 | 挙動 |
|---|---|---|
| **none** | 大多数。UI 影響非該当、or foundation 既存 ∩ routine | op-explore 不要 (そのまま op-plan へ案内) |
| **thin** | UI 影響あり ∩ ヒアリング不足だが対話 / 単一試作で詰まる | 対話 + designer-expert 1 体手動 spawn (フェーズ2-thin) |
| **full** | `design_depth:full` 相当 ∩ 複数パターンの視覚比較が本質的に必要 ∩ 視覚 exemplar 取得済 | `op-explore-render.js` で N パターン生成 (フェーズ2-full、Wave3) |

- `full` の runtime 検証必須判定は ADR-0012 design-spike 判定を参照し二重定義しない。
- `max_patterns` (op-config `playground.max_patterns`、default 2、**絶対上限 3**) / 未注入時 `pattern_count=1` 安全側 default。
- **視覚 exemplar ゼロ → `full→thin` downgrade** (1-2)。auto 起動 (本来 Direct 専用だが防御的に) → `full→thin/none`。
- spawn cost 上限 (worst-case 16 / `N=3 ∩ self-critique on` 拒否 hard cap) の正本は `issue-enrichment.md (>=2) §11`。

---

## フェーズ2: 試作生成

### 共通: 書き込み先ホワイトリスト gate (決定E)

司令官は Write / spawn 前に「書き込み先が `.playground/<session-id>/` 配下か」を機械チェックする fail-fast gate を通す
(plan mode を強制しない分、規律依存を最小化する)。

```bash
: "${SESSION_ID:?SESSION_ID must be set (例: explore-onboarding-20260601-120000)}"
: "${WRITE_PATH:?WRITE_PATH must be set — 試作物の書き込み先}"
case "$WRITE_PATH" in
  .playground/"$SESSION_ID"/*) echo "✅ 書き込み先 OK: $WRITE_PATH" ;;
  *) echo "❌ 書き込み先が .playground/$SESSION_ID/ 配下でない: $WRITE_PATH"; exit 1 ;;
esac
```

### 2-thin. designer-expert 1 体を手動 spawn (Wave2)

`thin` モードは司令官が designer-expert を **1 体手動 spawn** し、試作 HTML を `.playground/<id>/` に Write させる。

```
Agent({
  subagent_type: "designer-expert",
  model: "opus",   // ADR-0013 決定K: op-explore design 系は全役 Opus 優先 (craft=ceiling 課題)。Sonnet に落とさない
  description: "playground: 試作 UI (thin)",
  prompt: """
    invocation_mode: op_managed

    あなたは designer-expert です。op-explore (playground) から呼ばれた OP-managed Mode 起動です。
    質問で停止せず、不足は assumptions[] を置いて続行してください。

    共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added): `~/.claude/skills/_shared/spawn-prompt-common.md (>=1)` §1〜§4 を参照。
    本作業は試作生成 (exploration-only) のため commits_added: [] が正解 (commit は行わない)。

    必読: `~/.claude/skills/expert-design/references/visual-craft-tiers.md` (craft floor / Tier)、
          `~/.claude/skills/expert-design/references/visual-quality-rubric.md` (Hard blockers)。

    タスク: 以下の art-direction commit と本質質問の回答に基づき、自己完結 (外部依存ゼロ・CDN 参照なし) の
    試作 HTML を 1 枚生成し、`.playground/<SESSION_ID>/pattern-thin.html` に書いてください (file:// で直開きできること)。
      - art-direction 拘束セット: <フェーズ1-2 で確定した typography/layout/color/密度/装飾予算>
      - exemplar: <内部 file:// パス / refs/ スクショ / craft 原則の言語化>
      - craft floor を厳守 (token bypass / 任意値乱発 / equal-weight / accent 過多 / semantic 流用 を避ける)。
      - 状態 (loading / error / empty / focus 等) を該当する限り含める。
      - **試作物に本番 credential / 実 API endpoint / 実 PII を埋めない (mock のみ)** (セキュリティ DON'T)。

    出力契約: 書いたファイルパスと、採用した拘束セット / craft 上の意図 / 残した assumptions を構造化返却。
  """
})
```

司令官は生成後、フェーズ0-channel のチャネルで実物をユーザーに提示する。

### 2-full. `op-explore-render.js` workflow で N パターン生成 (Wave3)

`full` モードは Dynamic Workflow を起動し、N パターンを**構造的拘束セット**で発散生成 → decision-matrix (順位なし) を返す。
詳細仕様は `workflows/op-explore-render.js` の冒頭コメントと ADR-0013 決定H/決定I。

```javascript
const render = Workflow({
  name: 'op-explore-render',
  args: {
    session_id: SESSION_ID,
    requirement,                 // フェーズ1-1 ヒアリング要約
    art_direction,               // フェーズ1-2 拘束セット (purpose/tone/differentiation)
    exemplars,                   // フェーズ1-2 取得した exemplar (file:// path / refs スクショ / craft 言語化)
    constraint_sets,             // N 案分の互いに非重複な構造的拘束セット (controller が割当、なければ workflow が default 発散)
    pattern_count: PATTERN_COUNT,        // op-config playground.max_patterns (default 2、上限 3)
    self_critique: false,                // Wave4 default off (N=3 ∩ self_critique は hard cap で拒否)
    models: { generate: 'opus', judge: 'opus' },  // 決定K: 全役 Opus
  },
})
// = { ok, patterns:[{ pattern_id, constraint_set, html_path, craft_notes, states_covered }], decision_matrix:{ dimensions[], per_pattern[], craft_distance, judge_not_judging }, dropped, mode_collapse }
```

- workflow は `.playground/<id>/pattern-*.html` を生成できない (fs 不可) ため、**生成 agent が返す HTML 本文を controller が
  `.playground/<id>/` に Write する** (workflow は HTML 本文と decision-matrix を返すだけ)。
- `decision_matrix.craft_distance` が小さい (= 案が無難に収束) なら `mode_collapse=true` が返る → 司令官は構造的拘束セットを
  振り直して**再発散を 1 回**指示する (cost は `issue-enrichment.md §11` の budget に含む)。
- judge は順位付けしない (`aggregateVerdict` 流用禁止、CI grep gate で担保)。**選択は人間** (フェーズ3.5)。

---

## フェーズ3: 反応ループ (append-only round) + 再発散

試作は「決める」ためでなく、反応 (👎 / どれも違う / コメント) を読み戻して**次ラウンドで作り直す**補正ループの起点。

- ユーザーの反応 (採用 / 部分的 / 違う + 「気になる点」タグ + コメント) を `.playground/<id>/answers/<round>.json` に **append-only** で記録する。
- round 跨ぎで取りこぼさない (前 round の確定事項 + 新 round の反応をマージ)。round 統合ロジックは harness で検証する。
- 「どれも違う」escape が出たら、art-direction 拘束セットを振り直してフェーズ2 へ戻る (再発散)。
- 収束 (ユーザーが「この方向 (or この案 + 変更点)」を選んだ) でフェーズ3.5 へ。

---

## フェーズ3.5: 人間選択 (controller 対話 gate)

ADR-0009 制約1 (workflow は mid-run user input 不可) ゆえ、**選択は workflow 外の controller 対話**で行う。

- フェーズ2-full の `decision_matrix` を提示する: 各 pattern の **差異 / トレードオフ / state 網羅度 / foundation 整合 + craft 差異軸**。
- **judge は順位を出していない**ことを明示する (`decision_matrix.judge_not_judging` の「この比較で judge が判断していないこと」節)。
- exemplar gap (calibration) を併示する: 取得した exemplar に対して各案の craft がどの距離にあるか (人間が generic を選ばないための縮尺)。
- ユーザーが実物を見て **選択 / hybrid 合成** (「A の構成 + B の配色」) する。司令官は選択を記録する (workflow 外)。

---

## フェーズ4: 卒業 (decision record 作成 + commit)

### 4-1. decision record フォーマット (spec_only、新正本を作らない、決定B / 決定I)

卒業物は `docs/playground/<session-id>.md` の Markdown **1 本**。HTML / 複数パターン / ロジックは commit しない。
構成と**射影先** (新節名を作らず既存正本へ射影する):

| 節 | 内容 | 射影先 (handoff / apply で消費) |
|---|---|---|
| (a) 確定 Design Plan 素材 | `expert-design` 正本 10 節形式 | enrichment §3 `issue_draft.body` の `## 🎨 Design Plan` 節 |
| (b) 採用案 + 却下案 + 却下理由 + 却下 round | 探索の判断履歴 | decision record 内のみ (追跡証跡) |
| (c) Behavior Contract | 状態遷移 / 入出力例 / edge case / 合否基準 | `expert-design` Verification 節 + `success_criteria` / `verification_steps` |
| (d) art-direction 意図 + exemplar gap | 意匠でなく **craft 原則の言語化** (決定I calibration) | `expert-design` Design Intent 節 → apply 経路で designer-expert に再注入 (決定C handoff、handoff loss 緩和) |
| (e) 採用 artifact への参照 | anchored スクショ実体 | `docs/playground/<id>/` に画像 commit (`.playground/` は卒業時に消えるため) |
| (f) 残課題 | follow-up | decision record 内のみ |

Behavior Contract は新節名を作らず本射影テーブルに留める (`expert-design` 正本は拡張しない)。詳細フォーマットは
`docs/playground/README.md` も参照。

### 4-2. セキュリティ pre-commit gate (Risk 1、必達)

起票前段階には review-expert の Security lens が届かない。卒業物 commit 前に**機密パターン + 外部 URL を grep** する。

```bash
: "${RECORD_FILE:?RECORD_FILE must be set — docs/playground/<id>.md}"
# 機密 / 実 endpoint / 実 PII の混入を検出 (試作物は mock のみが原則)。
LEAK=$(grep -nEi 'api[_-]?key|secret|password|token=|bearer |authorization:|-----BEGIN|https?://(api|prod|[a-z0-9.-]+\.(com|net|io|jp))' "$RECORD_FILE" docs/playground/"$SESSION_ID"/ 2>/dev/null | grep -vEi 'example\.com|localhost|mock|placeholder|<your-' || true)
if test -n "$LEAK"; then
  echo "❌ 機密 / 実 endpoint / 実 PII の疑い。commit を中止し確認すること:"
  echo "$LEAK"
  exit 1
fi
echo "✅ セキュリティ pre-commit gate pass"
```

> DON'T (hard 制約): 試作物・卒業物に **本番 credential / 実 API endpoint / 実 PII を埋めない (mock のみ)**。

### 4-3. commit (op-architect の ADR commit 文化をミラー)

decision record + anchored スクショだけを明示 stage して commit する。既存の staged 変更を**絶対に巻き込まない**
(op-architect L545-589 をミラー、`:?` ガード + 空 commit 防止 + staged hijack 防止)。

```bash
: "${SESSION_ID:?SESSION_ID must be set}"
: "${RECORD_FILE:?RECORD_FILE must be set (例: docs/playground/explore-onboarding-20260601-120000.md)}"

# 1) 既存 stage チェック (空でなければ停止)
if ! git diff --cached --quiet; then
  echo "❌ 既に staged 変更があります。decision record commit 前に確認が必要です。"
  git diff --cached --name-only
  exit 1
fi

# 2) 作業ツリーの状況を見せる (透明性)
git status --short

# 3) decision record + スクショディレクトリだけを明示 stage (`--` でファイル境界を明確化)
git add -- "$RECORD_FILE"
test -d "docs/playground/$SESSION_ID" && git add -- "docs/playground/$SESSION_ID/"

# 4) 何が staged されたか最終確認 (docs/playground/ 配下のみであること)
git diff --cached --name-only

# 5) commit
git commit -m "docs(playground): ${SESSION_ID} decision record (op-explore 卒業)"
```

---

## フェーズ5: handoff (op-plan 単一給餌、gate_only、決定C)

卒業物を op-plan へ疎結合 handoff する (op-plan フェーズ8 と同型)。初手は **op-plan 単一給餌**に絞る
(op-architect 給餌は Wave4 follow-up)。

```
decision record を docs/playground/<id>.md に commit しました。

op-plan を起動して計画 → 起票に進みますか?
1. 起動する (op-plan に decision record を渡す)
2. 起動コマンドだけ表示 (後で手動実行)
3. 終了 (decision record のみで完了 = parked)
```

ユーザーが 1 を選んだら Skill tool で op-plan を直接起動し、decision record パスを渡す:

```
Skill({ skill: "op-plan", args: "--from-record docs/playground/<session-id>.md" })
```

op-plan は decision record を読み、フェーズ1 ヒアリングを skip して issue_draft を組み立てる。
**enrichment 二重課金回避**: decision record の Design Plan 素材を enrichment §5 が再生成しないよう、op-plan は
`options.with_design_plan = "gate_only"` (提示済を再生成せず ux-ui-audit gate のみ) を注入する
(`issue-enrichment.md (>=2) §4`)。decision record (d) の art-direction 意図は `## 🎨 Design Plan` → apply 経路で
designer-expert に再注入される (決定C handoff 配線、handoff loss 緩和)。

> op-explore は**決定の重さを判定せず 2 出力分岐を持たない** (不変則1 二重化回避)。ADR-heavy 案件は op-architect 給餌
> (`op-architect --from-record docs/playground/<id>.md`、Wave4 で配線済) を follow-up 経路として使う。

---

## Wave4 拡張 (necessary が確認されてから / opt-in)

以下は ADR-0013 Wave4。必要が確認されてから有効化する (default は無効 / 未配線)。

- **ロジック spike** — 仕組み (ロジック) の試作は feature-expert を spike モードで spawn (`commits_added: []`、`.playground/<id>/logic.js`)。
- **design-spike escape hatch** — ③④ bespoke (物理 spring / novel) の真の例外のみ。`auto/explore-spike-*` draft PR → PR レビュー gate →
  foundation token 昇格 (ADR-0012 L129 で未実装と確定済の領域 = この body は ADR-0012 design-spike の実装に**ブロックされる**)。
  この経路を実配線するとき **op-source enum を additive bump** する (`labels-and-markers.md` + op-core `OpSourceMarker::CANONICAL_VALUES`
  + 再 install、draft PR 出自追跡)。op-explore は Wave0-3/5 では op-source marker を一切 emit しない (起票は op-plan = `op-source: op-plan`) ため、
  この bump は **design-spike body 着地まで defer** する (op-tools infrastructure の別 PR、self-referential Opus review)。
- **op-architect 給餌** (配線済) — `op-architect --from-record docs/playground/<id>.md` で decision record を ADR Context の
  bootstrap-brief として注入する受け口を op-architect 実行モードに additive 済 (フェーズ5 handoff の follow-up 経路)。
- **self-critique refine pass** — `full ∩ N≥2`、**default off の opt-in**。read-only audit (改善「提案」のみ・in-place mutation 禁止)、
  反映は次 round の生成 prompt 注入 (= 新規 spawn = +N)、anchor は「段0 commit した direction への忠実度 (徹底のみ・無難化禁止)」、
  採否は judge 併記で人間選択 (mid-run 不可 / self-bias 自動増幅回避)、`N=3 ∩ self_critique` は hard cap で拒否。
- **卒業 gate の craft 静的検査** — tokenize と**同時検査** (contrast / focus / token bypass / animate 対象の真の floor のみ BLOCK、
  意図的逸脱は warning + 注釈要求)。op-tools primitive 化候補 = `op design craft-lint`。
- **Playground Ledger Issue** — クロスマシン要件が実証された場合のみ opt-in (op-patrol Ledger 同型)。

---

## DON'T (やってはいけないこと)

- 試作物・卒業物に **本番 credential / 実 API endpoint / 実 PII を埋める** (mock のみ。フェーズ4-2 で grep gate)。
- 司令官が試作 HTML を**直接書く** (designer-expert に委譲 = 不変則7)。
- `.playground/<session-id>/` 配下**以外**へ試作物を書く (フェーズ2 ホワイトリスト gate)。
- judge / decision-matrix で**案を順位付けする** (`aggregateVerdict` 流用禁止。選択は人間 = 構想の核)。
- **コード (HTML / Vue / ロジック) を本環境に commit する** (卒業物は spec_only decision record のみ。決定B)。
- **EnterPlanMode を使う** (op-architect ミラー = Direct commit)。
- op-explore から**直接 Issue を起票する** (起票は op-plan 経由 = 不変則8 / enrichment を必ず通す)。
- `playground_mode` を `issue-enrichment.md` の options に混ぜる (enrichment が消費しない直交軸 = 決定F)。
- 視覚 exemplar ゼロのまま `full` を強行する (generic 回帰。`full→thin` downgrade)。

---

## 参照ドキュメント

各エントリの `(>=N)` は本 SKILL.md が前提とする最低 schema_version。

- `~/.claude/skills/_shared/invocation-mode.md` (>=1) — Direct Mode / OP-managed Mode 判定 + `needs_human_decision` Block スキーマ (内部 spawn 用)。
- `~/.claude/skills/_shared/expert-spawn.md` (>=1) — spawn schema / `invocation_mode: op_managed` 必須行 / spawn パターン (designer / ux-ui-audit)。
- `~/.claude/skills/_shared/active-expert-registry.md` (>=2) — spawn 前の active expert 確認 (designer-expert / ux-ui-audit-expert)。
- `~/.claude/skills/_shared/issue-enrichment.md` (>=2) — handoff の Input contract (`issue_draft` / `options`)、`with_design_plan='gate_only'` (§4)、spawn cost ledger (§11)。
- `~/.claude/skills/_shared/op-config-schema.md` (>=1) — `playground` (§12 max_patterns / pattern_count) / `design_system_baseline` (§11 craft floor baseline)。
- `~/.claude/skills/_shared/model-selection.md` (>=3) — op-explore は決定K で全役 Opus 固定 (§5.4.x の op-explore 例外注記)。
- `~/.claude/skills/_shared/version-check.md` (>=2) — schema_version 整合性チェック (フェーズ0)。
- `~/.claude/skills/expert-design/references/visual-craft-tiers.md` — craft floor / craft Tier の方法論 (ADR-0013 決定I)。
- `~/.claude/skills/expert-design/references/visual-quality-rubric.md` — craft floor Hard blocker 正本。
- `~/.claude/skills/_shared/spawn-prompt-common.md` (>=1) — 内部 spawn prompt の共通宣言 §1〜§4。
- `workflows/op-explore-render.js` — full モードの N パターン生成 + decision-matrix workflow (Wave3)。

> 不変則整合: 不変則1 (decision record 新正本ゼロ) / 不変則3 (controller=Direct・内部 spawn=OP-managed) /
> 不変則5 (試作 finding は起票しない) / 不変則7 (試作生成は designer 委譲・decision record commit は ADR commit 同型で対象外) /
> 不変則8 (起票せず op-plan 経由で enrichment を通す)。詳細は ADR-0013。
