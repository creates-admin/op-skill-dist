# Severity Rubric: Critical / High / 起票しない の判定基準

scan / patrol が起票するのは Critical / High のみ。本ファイルは expert の severity 判定と scan 報告ルールの正本。
apply の修正範囲・review の合否とは独立。

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

到達経路 (誰がどう操作すれば発火するか) を evidence に書く。示せないものは Critical にしない (High に降格)。

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

High の条件は「壊れているかも」ではなく「壊れていることが確実に観測できる」こと。

---

## 起票しない (Medium 以下)

- 可読性・命名の好みのみの差
- 軽微な重複 (DRY 違反 5 行以下、再利用頻度低)
- 将来リスクのみで現状動作に問題なし
- 設計判断の好み (パターン採用是非のみ)
- 微細な UI 違和感 (色差 / 余白 / アニメ tweak のみ)
- TODO / FIXME コメントの存在のみ
- 未使用 import / 未使用変数のみ (lint で検出可能なもの)
- 「もっと良い書き方」という改善案のみ
- テストが薄い「気がする」(具体的な抜け道を示せない)

---

## 判定の手順 (expert 共通)

1. **到達経路を書けるか?** 書けない → 起票しない
2. **観測可能な被害があるか?** ない → 起票しない
3. **被害が「データ破壊 / 権限越境 / 任意 IO / 本番停止」のいずれか?** はい → Critical / いいえ → 4 へ
4. **被害が「主要導線を塞ぐ / セキュリティ境界の弱体化」のいずれか?** はい → High / いいえ → 起票しない

---

## scan 報告ルール (共通)

scan / patrol の報告ルールと実行レベルの正本。`agents/*.md` / `skills/expert-*/` / workflow spawn prompt の
報告ルールは本節への pointer + expert 固有差分 (domain 固有の ignored_noise 等) に留める。

### 報告してよいもの

- **Critical / High のみ**報告する。Medium 以下は検出しても報告しない。
- finding は静的証拠 (コード引用・呼び出し経路) で裏付ける。
- 「〜の可能性がある」「〜かもしれない」は禁止。例外は「「可能性がある」を許可する条件」節を全て満たす場合のみ。
- 検出 0 件は `{"findings": []}` で返す (自然文で「問題なし」と書かない)。envelope 形状は `_shared/expert-spawn.md`「scan 出力 envelope 契約」節。
- 対象 repo で無効なスタックの検出は報告しない (ignored_noise。定義は `_shared/project-profile.md`「Out of scope」節)。
- 対象 repo の CLAUDE.md 規約に従っているコードは指摘しない。規約そのものを批判しない
  (`_shared/project-profile.md`「対象 repo 規約への準拠 (worker 共通)」節)。
- 対象 repo の CLAUDE.md が定義する「禁止パターン」に違反する検出は High 以上で扱う。

### scan 実行レベル (Level 0 固定 — read-only)

scan / patrol / detect モードは Level 0 のみ。

- 許可: Read / Grep / Glob、`git log` / `blame` / `diff` / `ls-files`、`gh issue list` / `view` / `gh search` 等の read-only GitHub 操作
- 禁止: ファイル編集 / commit / push、ビルド・テスト・型チェック・lint 実行 (`cargo check` / `vue-tsc` / `flutter analyze` 等)、
  依存の追加・削除 / migration / snapshot 生成 / 設定ファイル変更、`gh issue create` / `edit` / `comment` 等の write GitHub 操作

例外: spawn 入力に `allow_level_1: true` が明示された場合のみ lint / typecheck を実行してよい。
Level 1 以上は apply / investigation Issue / 司令官が明示した verification task で実行する。

---

## 「可能性がある」を許可する条件 (要検証扱い)

以下を**すべて**満たす場合に限り、要検証として High で起票してよい:

- 入力経路 (どこから来るか) が特定できている
- 到達条件 (発火条件) が示せる
- 影響範囲 (壊れるもの) が示せる
- 再現確認には実行時検証が必要

この場合、出力に `"evidence_grade": "requires_runtime"` / `"reproduction_hint": "<再現条件 / 確認方法>"` / `"severity": "high"` を含める。

`evidence_grade`: `direct` (静的に確認可能) / `inferred` (周辺コードからの推論) / `requires_runtime` (実行時検証が必要)。
`direct` 以外で Critical を付けない。

---

## expert 別の典型例

### debug-expert

- Critical: データ破壊する race / 必ず起きる panic / null deref
- High: 例外握りつぶしでエラー隠蔽 / 不整合な状態遷移

### security-expert

- Critical: 認証バイパス / SQL injection / 任意ファイル IO — いずれも `evidence_grade: direct` +
  `security.attack_path.reachable: true` (steps を断定的に書ける) + 現実的な `threat_model.actor` + impact high
- High: 入力検証漏れ / ログに秘密混入 / Tauri capability の弱い設定 / IPC・shell・path canonicalization の欠落
  (reachable + impact medium 以上、または theoretical + impact high の defense-in-depth)
- 起票しない: `reachable: false` / hardening のみ / 漠然とした「危険」 / capability 全体 disable を提案する finding
  (`usable_security` 違反で blocker)

詳細: expert-security skill の `references/source-sink-analysis.md` / `usable-security.md`。

### refactor-expert

- Critical: ほぼ該当なし
- High: ビルドを壊す循環依存 / 同期境界の崩壊

### optimize-expert

- Critical: O(2^n) で実環境を停止させる経路
- High: 主要導線で観測可能な性能劣化 (P95 が SLA 越え等)

### ux-ui-audit-expert

使いやすさ・a11y のみ見る (視覚的不統一は designer-expert)。

- Critical: 回復手段なしのデッドロック UI / キーボード操作不可 / SR で全く認識不可 (WCAG A 違反)
- High: 主要導線を塞ぐ UX 障害 / 必須 state 欠如 (loading / failure / empty / disabled / focus) /
  WCAG AA 違反 (コントラスト不足、ターゲットサイズ過小、色のみ依存) /
  危険操作の確認・取り消し導線欠如 / フォーム入力エラーがフィールドと結びついていない

`broken_invariant` (expert-ux-ui-audit skill の `usability-invariants.md` 1〜10) を示せないなら起票しない。

### designer-expert

美しさ・design system 整合・視覚秩序のみ見る (使いやすさ・a11y は ux-ui-audit-expert)。

- Critical: design system の構造的負債が theme/brand 切替を物理的に不可能にしている /
  共通 component bypass の蔓延がユーザーに「同じ操作」と認識されない実害を生んでいる
- High: design token bypass が 5 箇所以上 / 共通 component bypass で同一用途 UI が複数実装に分裂 /
  visual hierarchy 崩壊で重要操作が補助操作に埋もれる / 色記号体系の崩壊 (success/error の意味揺れ) /
  一画面だけ別プロダクト化した design 不一致

`design_principle_violated` (expert-design skill の「Scan Mode 観点 1〜9」) + `bypass_count` / `affected_screens` の
観測値を示せないなら起票しない。「もっとおしゃれにできる」「単発の余白違い」「主観的な好み」は起票しない。

### test-expert

- Critical: ほぼ該当なし
- High: 構造的な false pass / 重要パスのテストが「ない」

### feature-expert

- Critical: 仕様で要求された安全機能が「ない」(認証 / 権限等)
- High: 主要要件の実装漏れ / 仕様の重大な穴
