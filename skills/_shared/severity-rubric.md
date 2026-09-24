# Severity Rubric: Critical / High / 起票しない の判定基準

scan / patrol が起票するのは Critical / High のみ。本ファイルは expert の severity 判定と scan 報告ルールの正本。
apply の修正範囲・review の合否とは独立。

## Critical (即座に対応すべき重大障害)

以下のいずれかに該当する場合、Critical:

- データ破壊: 永続データを破壊・喪失させる経路がある
- 認証 / 権限バイパス: 期待する権限境界を越えてアクセスできる
- 任意ファイル書き込み / 読み取り: パスインジェクション・任意 IO
- 本番停止クラッシュ: 通常運用で再現する確実なクラッシュ・無限ループ
- ユーザー操作なしで発火する重大障害: アイドル状態での自動破壊
- 認証情報・秘密鍵の露出: ログ・送信ペイロード・コミット内に秘密が含まれる
- Tauri capability の重大設定ミス: 想定外の command が外部から呼び出せる

## High (主要導線を塞ぐ / セキュリティ境界を弱める)

以下のいずれかに該当する場合、High:

- 高頻度クラッシュ: 主要導線で再現するが致命ではないクラッシュ
- 明確なデータ不整合: race / lost update / 不整合な状態遷移
- セキュリティ境界の弱体化: 入力検証漏れ・ログ汚染・未検証なシリアライズ
- 主要導線を塞ぐ UX 障害: ユーザーが詰む状態 (リカバリ手段なし)
- CI / build を壊す構造問題: 規模の大きいビルド阻害
- テスト自体が誤検知を生む: false pass / false fail を構造的に生み出すテスト
- 明確に欠けている検証: 認証 / 権限 / 入力 / 例外処理が「ない」ことが確実

High の条件は「壊れているかも」ではなく「壊れていることが確実に観測できる」こと。

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

## 判定の手順 (expert 共通)

1. 到達経路 (誰がどう操作すれば発火するか) を evidence に書けるか? 書けない → 起票しない
2. 観測可能な被害があるか? ない → 起票しない
3. 被害が「データ破壊 / 権限越境 / 任意 IO / 本番停止」のいずれか? はい → Critical / いいえ → 4 へ
4. 被害が「主要導線を塞ぐ / セキュリティ境界の弱体化」のいずれか? はい → High / いいえ → 起票しない

domain 固有の High 基準 (refactor の構造劣化、design の token / component bypass 等) と典型例は各 expert skill の severity 節が
本手順の step 3〜4 を上書きする。step 1〜2 (到達経路 / 観測可能な被害) は全 domain 共通で省略しない。

## scan 報告ルール (共通)

scan / patrol の報告ルールと実行レベルの正本。`agents/*.md` / `skills/expert-*/` / workflow spawn prompt の
報告ルールは本節への pointer + expert 固有差分 (domain 固有の ignored_noise 等) に留める。

### 報告してよいもの

- Critical / High のみ報告する。Medium 以下は検出しても報告しない。
- finding は静的証拠 (コード引用・呼び出し経路) で裏付ける。
- 「〜の可能性がある」「〜かもしれない」は禁止。例外は「「可能性がある」を許可する条件」節を全て満たす場合のみ。
- 検出 0 件は `{"findings": []}` で返す (自然文で「問題なし」と書かない)。envelope 形状は `_shared/expert-spawn.md`「scan 出力 envelope 契約」節。
- 対象 repo で無効なスタックの検出は報告しない (ignored_noise。定義は `_shared/project-profile.md`「Out of scope」節)。
- 対象 repo の CLAUDE.md 規約に従っているコードは指摘しない。規約そのものを批判しない
  (`_shared/project-profile.md`「対象 repo 規約への準拠 (worker 共通)」節)。
- 対象 repo の CLAUDE.md が定義する「禁止パターン」に違反する検出は High 以上で扱う。

### scan 実行レベル (Level 0 固定 — read-only)

scan / patrol / detect モードは Level 0 のみ (Level の定義は `project-profile.md`「Verification Ladder」)。

- 許可: Read / Grep / Glob、`git log` / `blame` / `diff` / `ls-files`、`gh issue list` / `view` / `gh search` 等の read-only GitHub 操作
- 禁止: ファイル編集 / commit / push、ビルド・テスト・型チェック・lint 実行 (`cargo check` / `vue-tsc` / `flutter analyze` 等)、
  依存の追加・削除 / migration / snapshot 生成 / 設定ファイル変更、`gh issue create` / `edit` / `comment` 等の write GitHub 操作

例外: spawn 入力に `allow_level_1: true` が明示された場合のみ lint / typecheck を実行してよい。
Level 1 以上は apply / investigation Issue / 司令官が明示した verification task で実行する。

## 「可能性がある」を許可する条件 (要検証扱い)

以下をすべて満たす場合に限り、要検証として High で起票してよい:

- 入力経路 (どこから来るか) が特定できている
- 到達条件 (発火条件) が示せる
- 影響範囲 (壊れるもの) が示せる
- 再現確認には実行時検証が必要

この場合、出力に `"evidence_grade": "requires_runtime"` / `"reproduction_hint": "<再現条件 / 確認方法>"` / `"severity": "high"` を含める。

`evidence_grade`: `direct` (静的に確認可能) / `inferred` (周辺コードからの推論) / `requires_runtime` (実行時検証が必要)。
`direct` 以外で Critical を付けない。`inferred` / `requires_runtime` は High が上限。
