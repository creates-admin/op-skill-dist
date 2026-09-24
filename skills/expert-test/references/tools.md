# ツール・テンプレ辞典

テスト・coverage コマンドは `~/.claude/skills/_shared/project-profile.md`「テスト寄せ defaults」。環境にツールがなければ導入を提案するに留める (インストールを強制しない)。

## mock 方針

mock を書く前に、何を mock するかを決める。

| mock してよい | mock してはいけない |
|--------------|-------------------|
| 外部 HTTP / ネットワーク | テスト対象の主要ロジック本体 |
| メール / SMS / Push | validation / authorization の本体 |
| 決済 API | domain rule / business rule |
| 時刻 / 乱数 | repository と service を同時に mock して本体経由が消える構成 |
| OS / FS の危険操作 | |
| 高コストな外部サービス (LLM API / 画像処理) | |

次のどれかに当たれば使い方を見直す:

- テストが振る舞いではなく「呼び出し順の写経」になっている
- mock なしの integration / contract test が別に存在しない
- mock のせいで失敗モード (認可漏れ・契約破綻) を見逃している
- mock が 5 個以上でテスト本体が読めない

`test_intent.mock_policy` に mock するもの / しないもの / 理由を書く。

## flaky 診断

同じテストを 10 回程度繰り返し実行して再現させる。疑う順: 時刻・乱数・順序依存 → 環境依存 (`/tmp` / 環境変数 / 実 HTTP) → テスト間のリソース競合。
直せないなら skip 化してチケット参照 (または理由) を付け、起票は完了報告の要求として返す (理由とチケット参照のない skip にしない)。

## 削除時の PR テンプレと安全弁コマンド

SKILL.md の「テスト削除の 3 段階モデル」の実装。quarantine / delete の PR で必ず残す。

### 安全弁 (apply 前)

- `git blame` / `git log --diff-filter=A` で追加コミットを特定し、`gh search issues` / `gh search prs` で追加意図を復元する
- 同等カバレッジは、対象テストを skip 化して coverage を再計測し、低下がないことで確認する
- 追加意図が分からなければ削除せず、`needs_human_decision.required: true` (decision_type: "deletion") で返す

### 削除根拠テンプレ (PR 本文 / commit message)

```
## 削除根拠
- 追加コミット: <sha> (<日付>, <作者>)
- 追加意図 (Issue/PR から復元): <要約>
- 現状の評価: <なぜ価値を失ったか>
- 同等カバレッジ: <他テストの参照、なければ「補完テスト追加済」>
- 観察期間: <skip 化からの経過、問題の有無>
- safety_gate 通過記録:
  - blame: <sha>
  - coverage_diff: <他テストでカバー>
  - ci_pass: <runId>
  - observation_period: <YYYY-MM-DD ~ YYYY-MM-DD>
```
