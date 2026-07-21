<!--
schema_version: 4
last_breaking_change: 2026-05-05
notes: v4 (2026-05-05) — security-expert を Attack Surface & Usable Security specialist として正式化。
       severity 判定で source → sink reachability + threat_model.actor + usable_security 判定を組み合わせる
       前提を追加。「to_be_reachable と to_be_practical を区別」「direct evidence のみ Critical」
       「reachable: false / theoretical only / hardening は起票しない」「capability 全体 disable を提案する
       finding は起票しない (usable_security 違反で blocker)」を明記。
       詳細は agents/security-expert.md / skills/expert-security/references/source-sink-analysis.md を参照。
       v3 (2026-05-03 第二段階) — UX/UI を「使いやすさ番人 (ux-ui-audit-expert)」と「美しさ番人 (designer-expert)」に再分離。
       designer-expert に Scan Mode が追加され、severity 判定対象 expert が 8 体になった。
       v2 (2026-05-03 第一段階): ux-audit-expert / ui-refactor-expert 節を ux-ui-audit-expert 1 節に統合。
-->

# Severity Rubric: Critical / High / 起票しない の判定基準

/**
 * 機能概要: op-scan の expert が検出した問題を Critical / High / 起票しない に分類する基準を定義する
 * 作成意図: severity の定義がないと expert ごとに判定がブレ、ノイズ起票や false negative が増える。
 *           「Critical/High のみ起票」を実効性のあるルールにするための判定材料を一元化。
 * 注意点: 本ドキュメントは scan のみの判定基準。apply の修正範囲・review の合否とは独立。
 */

op-scan が起票するのは Critical / High のみ。
本ドキュメントは expert の判定を統一するための定義を提供する。

---

## Critical (即座に対応すべき重大障害)

以下のいずれかに該当する場合、Critical:

- **データ破壊**: 永続データを破壊・喪失させる経路がある
- **認証 / 権限バイパス**: 期待する権限境界を越えてアクセスできる
- **任意ファイル書き込み / 読み取り**: パスインジェクション・任意 IO
- **本番停止クラッシュ**: 通常運用で再現する確実なクラッシュ・無限ループ
- **ユーザー操作なしで発火する重大障害**: アイドル状態での自動破壊
- **認証情報・秘密鍵の露出**: ログ・送信ペイロード・コミット内に秘密が含まれる
- **Tauri capability の重大設定ミス**: 想定外の command が外部から呼び出せる

到達経路 (誰がどう操作すれば発火するか) を **必ず evidence に書く**。
到達経路を示せないものは Critical にしない (High に降格)。

---

## High (主要導線を塞ぐ / セキュリティ境界を弱める)

以下のいずれかに該当する場合、High:

- **高頻度クラッシュ**: 主要導線で再現するが致命ではないクラッシュ
- **明確なデータ不整合**: race / lost update / 不整合な状態遷移
- **セキュリティ境界の弱体化**: 入力検証漏れ・ログ汚染・未検証なシリアライズ
- **主要導線を塞ぐ UX 障害**: ユーザーが詰む状態 (リカバリ手段なし)
- **CI / build を壊す構造問題**: 規模の大きいビルド阻害
- **テスト自体が誤検知を生む**: false pass / false fail を構造的に生み出すテスト
- **明確に欠けている検証**: 認証 / 権限 / 入力 / 例外処理が「ない」ことが確実

「壊れているかも」ではなく、**「壊れていることが確実に観測できる」** が High の条件。

---

## 起票しない (Medium 以下)

以下は op-scan の対象外。仮に検出しても起票しない:

- 可読性の好み・命名の好みのみの差
- 軽微な重複 (DRY 違反 5 行以下、再利用頻度低)
- 将来リスクのみで現状動作に問題なし
- 設計判断の好み (パターン採用是非のみ)
- 微細な UI 違和感 (色差 / 余白 / アニメ tweak のみ)
- TODO / FIXME コメントの存在のみ
- 未使用 import / 未使用変数のみ (lint で検出可能なもの)
- 「もっと良い書き方」という改善案のみ
- テストが薄い「気がする」(具体的な抜け道を示せない)

これらは別途 lint / formatter / 通常の PR レビューで対応する領域。

---

## 判定の手順 (expert 共通)

各検出について以下の順で判定する:

1. **到達経路を書けるか?** 書けない → 起票しない
2. **観測可能な被害があるか?** ない → 起票しない
3. **被害が「データ破壊 / 権限越境 / 任意 IO / 本番停止」のいずれか?**
   - はい → Critical
   - いいえ → High 候補
4. **被害が「主要導線を塞ぐ / セキュリティ境界の弱体化」のいずれか?**
   - はい → High
   - いいえ → 起票しない (Medium 以下)

---

## 「可能性がある」を許可する条件 (要検証扱い)

scan の出力で「可能性がある」「〜かもしれない」は原則禁止。
ただし以下を **すべて満たす**場合に限り、要検証として High で起票してよい:

- 入力経路 (どこから来るか) が特定できている
- 到達条件 (発火条件) が示せる
- 影響範囲 (壊れるもの) が示せる
- 再現確認には実行時検証が必要

この場合、出力に以下を必ず含める:

```json
{
  "evidence_grade": "requires_runtime",
  "reproduction_hint": "<再現条件 / 確認方法>",
  "severity": "high"
}
```

`evidence_grade` の値:

- `direct` — 静的に確認可能 (コード読みで証拠が揃う)
- `inferred` — 周辺コードからの推論 (証拠は間接的)
- `requires_runtime` — 実行時検証が必要 (静的には推定どまり)

`direct` 以外で Critical を付けてはいけない。

---

## expert 別の典型例

### debug-expert

- Critical: データ破壊する race / 必ず起きる panic / null deref
- High: 例外握りつぶしでエラー隠蔽 / 不整合な状態遷移

### security-expert

**Attack Surface & Usable Security specialist**。攻撃点の調査と、正当な user capability 維持での経路封鎖を担う。

- Critical: 認証バイパス / SQL injection の到達経路あり / 任意ファイル IO の practical exploit + impact high
  + evidence_grade: direct + threat_model.actor が現実的 + attack_path.steps が断定的に書ける
- High: 入力検証漏れ / ログに秘密混入 / Tauri capability の弱い設定 / IPC / shell / path canonicalization の欠落
  (reachable exploit + impact medium 以上、または theoretical exploit + impact high の defense-in-depth)
- 起票しない: reachable: false / hardening のみ / 漠然とした「危険」 / capability 全体 disable を提案する finding
  (usable_security 違反 = forbidden_shortcuts 抵触のため blocker)

判定の核は `security.attack_path.reachable: true` + `threat_model.actor / preconditions / asset_at_risk` +
`usable_security.legitimate_workflow_preserved: true (with proposed mitigation)` がそろうこと。
詳細は `~/.claude/skills/expert-security/references/source-sink-analysis.md` および
`~/.claude/skills/expert-security/references/usable-security.md`。

### refactor-expert

- Critical: ほぼ該当なし (構造問題で Critical 化するのは稀)
- High: ビルドを壊す循環依存 / 同期境界の崩壊

### optimize-expert

- Critical: O(2^n) で実環境を停止させる経路
- High: 主要導線で観測可能な性能劣化 (P95 が SLA 越え等)

### ux-ui-audit-expert

**使いやすさ・わかりやすさ・a11y の番人**。実装はしない (designer-expert に回す)。
視覚的不統一そのものは designer-expert に委譲し、本エージェントは「使いやすさ破綻」のみ見る。

- Critical: ユーザーが詰むデッドロック UI (回復手段なし) / キーボード操作不可 / SR で全く認識不可 (WCAG A 違反)
- High: 主要導線を塞ぐ UX 障害 / 必須 state 欠如 (loading / failure / empty / disabled / focus) /
  WCAG AA 違反 (コントラスト不足、ターゲットサイズ過小、色のみ依存) /
  危険操作の確認・取り消し導線欠如 / フォーム入力エラーがフィールドと結びついていない

判定の核は **broken_invariant** (ux-ui-audit-expert.md の Usability Invariants 1〜9 のどれに違反するか)
が示せること。示せないなら起票しない。

### designer-expert

**美しさ・design system 整合・視覚秩序の番人**。検出に加え実装も担う (op-architect / op-run)。
使いやすさ・a11y は ux-ui-audit-expert の領域なので侵食しない。

- Critical: design system の構造的負債が**theme/brand 切替を物理的に不可能にしている** /
  共通 component bypass の蔓延がユーザーに「同じ操作」と認識されない実害を生んでいる
- High: design token bypass が複数箇所 (5 箇所以上) に広がっている /
  共通 component bypass で同一用途 UI が複数実装に分裂 /
  visual hierarchy 崩壊で重要操作が補助操作に埋もれる / 色記号体系の崩壊 (success/error の意味揺れ) /
  一画面だけ別プロダクト化した design 不一致

判定の核は **design_principle_violated** (designer-expert.md の Scan Mode 観点 1〜9 のどれに違反するか)
+ **bypass_count / affected_screens** が観測値として示せること。
「もっとおしゃれにできる」「単発の余白違い」「主観的な好み」は **絶対に起票しない**。

### test-expert

- Critical: ほぼ該当なし
- High: 構造的な false pass / 重要パスのテストが「ない」

### feature-expert

- Critical: 仕様で要求された安全機能が「ない」(認証 / 権限等)
- High: 主要要件の実装漏れ / 仕様の重大な穴

---

## CLAUDE.md との関係

CLAUDE.md に「禁止パターン」が定義されている場合、それに違反する検出は High 以上で扱う。
CLAUDE.md の規約に従うコードは「規約が間違っている」と批判しない。
