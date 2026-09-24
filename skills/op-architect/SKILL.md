---
name: op-architect
description: 新規プロジェクトの初期構築 + ADR 必要な大規模設計判断を対話で進めるスキル。決定事項を ADR 化し、初期マイルストーンを op-run 互換の指示書 Issue として起票する。「op-architect」「ADR」「初期構築」「アーキ設計」等のキーワードで起動。機能追加 (ADR 不要) は op-plan を使う。
effort: max
---

# op-architect: 対話駆動の初期設計 + ADR + 初期 Issue 起票

新規プロジェクトについて、対話から設計判断を引き出し、重要判断を ADR に記録し、初期マイルストーンを op-run 互換 Issue に分解して起票する。
既存プロジェクトへの機能追加・新領域追加は `/op-skill:op-plan` を使う。

原則:

- 司令官はコードを書かない。スケルトン生成・実装は op-run / feature-expert に委ねる (`--scaffold` 時のみ feature-expert に雛形生成を委譲)。
- 並列化・自動モードは持たない。git init / ADR commit / ラベル作成 / 起票はすべてユーザー確認後に行う。
- **ADR は決定の直後に書く**。1 論点決定 = 1 ADR (または bootstrap-brief 追記) を 1 commit。後でまとめて書かない。
- **「お任せ」を記録する**。推奨案で進めた論点は ADR の Context に「ユーザー指定なし、推奨案で進めた」と明記する。
- **Superseded 管理**。既存方針を覆す場合は元 ADR を Superseded に更新するか、新 ADR で上書きを明示する。暗黙の方針逸脱は禁止。
- 既存 ADR / CLAUDE.md / package.json 等の既存ファイルを無断で書き換えない。変える場合は ADR を起こす。
- 起票前ゲートは `_shared/filing-gate.md`、UI の見た目は `_shared/design-mock.md` に従う。

### Planned expert の扱い

planned expert (`_shared/planned-experts.md`) は ADR や architecture note で「将来候補」として書いてよいが、
runtime で spawn される前提で書かない。Issue の `op-run-expert` / `op-post-check-expert` / `pro-*` ラベルには
`_shared/active-expert-registry.md` の active expert だけを使う。`review-expert` は apply / post-check に指定しない。

## 実行モード

| 起動 | 挙動 |
|---|---|
| `/op-architect` | 既定。ヒアリング → ADR → マイルストーン → 起票 |
| `--adr-only` | ADR 化まで。Issue 起票しない |
| `--issue-md` | 起票せず `docs/issues/initial/NNN-*.md` に Issue 本文を出力 (`references/issue-md-mode.md`) |
| `--scaffold` | マイルストーン確定後にプロジェクト雛形を feature-expert に生成させる (`references/scaffold-mode.md`) |
| `--from-record docs/playground/<id>.md` | op-explore の decision record で対話を seed する (下記) |

組み合わせ可 (例: `--adr-only --issue-md`)。

### `--from-record`

decision record (デザインモック URL / 決定事項 / 振る舞い / 意図 / 残課題) を Read し、フェーズ1 のヒアリングシートの初期値と
フェーズ3 の ADR Context の素材にする。ヒアリング自体は行い、残課題は論点リストに加える (record は seed であり代替ではない)。
record のモック URL は該当する UI マイルストーンの `デザインモック:` 行に引き継ぐ (フェーズ4.6 で作り直さない)。
record が無い / 不整合なら通常の対話に戻る。

## 参照

- `_shared/filing-gate.md` / `_shared/design-mock.md`
- `_shared/pr-templates.md`「Issue 本文 (指示書フル版)」/ `_shared/project-profile.md` (種別ごとの検証コマンド)
- `_shared/active-expert-registry.md` / `_shared/planned-experts.md` / `_shared/runtime-contract.md`
- `_shared/common-setup.md` / `_shared/github-channel.md`
- `_shared/model-selection.md` — op-architect の spawn は read-only (scaffold を除く) で `fable` を渡さない
- op-plan skill のフェーズ7 — 起票と depends_on 解決 (Pass 1 / Pass 2) の正本
- references: `project-type-checklists.md` (フェーズ2) / `adr-template.md` (フェーズ3-2) / `scaffold-mode.md` (`--scaffold`) / `issue-md-mode.md` (`--issue-md`)

---

## フェーズ0: 環境確認

`_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」に従う。ただし op-architect は中断しない:
git リポジトリ外ならユーザー確認後に `git init`、gh 未認証 (gh channel) なら `--adr-only` / `--issue-md` を提案する。続けて:

```bash
# ADR フォルダ (この優先順で最初に存在するもの。無ければ docs/adr を新規作成)
for d in docs/adr docs/architecture/decisions .adr; do test -d "$d" && { echo "$d"; break; }; done
ls <ADR_DIR>/[0-9][0-9][0-9][0-9]-*.md 2>/dev/null | sed 's|.*/||' | cut -c1-4 | sort -n | tail -1   # 既存最大番号
test -f docs/architecture/bootstrap-brief.md && echo "既存 bootstrap-brief を継承"
op repo init --dry-run   # 起票時に使う canonical ラベルの未作成分 (作成はフェーズ5-3 で承認後)
```

既存 ADR があればそのフォルダ・採番形式に従う。

---

## フェーズ1: プロジェクト種別判定 + ヒアリング

### 1-1. 種別判定

```
作るのはどのタイプですか?
  1. Tauri v2 + Vue 3 (デスクトップアプリ)
  2. Vue 3 SPA / Nuxt (Web フロント)
  3. Flutter (モバイル / マルチプラットフォーム)
  4. Rust CLI / サーバ (バックエンド)
  5. その他 (汎用テンプレで進める)
```

### 1-2. ヒアリング (シート + 未回答項目の深掘り)

初期ヒアリングシートを 1 度だけ提示する:

```markdown
## 初期ヒアリングシート — 埋められる項目を埋めてください

1. **ドメイン / プロダクト名**: 何を作るか、ひとことで
2. **利用者**: 誰が使うか (社内 / 顧客 / 開発者 / 自分用)
3. **コアユースケース**: 一番重要な 1〜3 個のシナリオ
4. **規模感**: 想定ユーザー数 / データ量 / 同時接続数
5. **既存資産**: 流用するライブラリ・既存システムとの連携
6. **チーム / 期限**: 開発体制と粗いマイルストーン
7. **非機能要件 (一般)**: 可用性・性能・運用で外せないもの
8. **データ境界 / セキュリティ**:
   - 扱うデータに個人情報・機密情報はあるか
   - ローカル保存するか、サーバ保存するか
   - 外部 API へ送ってよいデータはあるか
   - 認証・権限・監査ログが必要か
   - 自動アップデートや配布経路の制約はあるか

未記入の項目は op-architect が仮定を置き、必要なものだけ追加質問します。
```

- 埋まっている項目はそのまま採用する。
- 「お任せ」「特になし」は推奨案で進める前提で記録する (ADR Context に明記)。
- 曖昧な項目は 1 ターン 1 問で深掘りし、矛盾はその場で確認する。
- 項目 8 は「特になし」でも、個人情報・社外秘・認証情報を扱う可能性があれば追加質問で確定させる。

---

## フェーズ2: 論点抽出

種別に対応する論点表を `references/project-type-checklists.md` から 1 つだけ読み、ヒアリング結果と合わせて
議論すべき論点リストを提示する。議論の順序をユーザーに確認し、優先度の高いものから進める。

---

## フェーズ3: 論点の対話 → ADR 化 (または bootstrap-brief 追記)

### 3-0. ADR 化判定 (粒度ゲート)

論点ごとに、ADR にするか `docs/architecture/bootstrap-brief.md` に 1〜3 行追記で済ませるかを先に決める。

| ADR にする | bootstrap-brief に書く |
|---|---|
| 技術スタックの中核 (言語・主要 FW・ランタイム) | 差し替え容易な UI ライブラリ / 状態管理 / ルーティング / HTTP クライアント |
| データ保存方式 (DB・スキーマ戦略・migration) | 命名規則・ディレクトリ命名 |
| 認証・権限・監査ログ / セキュリティ境界 | テストランナー等の交換可能な道具 |
| 配布・自動更新方式 | 初期実装の仮置き・暫定判断 |
| モジュール境界 / 公開 API (例: Tauri command 設計) | 「お任せ」で推奨案を採っただけの軽微な選定 |
| 変更が rip-and-replace になる / 複数モジュールに影響 / 代替案とのトレードオフを後で説明する必要がある | |

目安: 初期構築で ADR 5〜8 本 (10 本超は粒度を疑う、0 本は漏れを疑う)、bootstrap-brief 10〜30 行。
迷ったら判定理由を 1 行添えて「ADR にしますか? bootstrap-brief で十分でしょうか?」と確認する。

bootstrap-brief が無ければ次の形で作る:

```markdown
# Bootstrap Brief

op-architect の対話で出た軽微な初期判断。重要判断は `docs/adr/` を参照。

## UI / スタイル
## テスト
## 命名・ディレクトリ
## 暫定判断 (要見直し)
```

### 3-1. 論点の提示と議論

司令官は論点ごとに:

1. 選択肢を 2〜4 個に絞って提示する。
2. 各選択肢の採用理由・トレードオフ・想定リスクを 1〜2 行で並べる。
3. ヒアリング結果に基づく推奨案と理由を述べる。
4. ユーザーの判断を待つ。チームの好み・運用制約などの主観的判断は必ずユーザーに確認する。

判断材料が足りなければ調査 subagent を spawn する:

```
Agent({
  subagent_type: "general-purpose",
  description: "research: <論点>",
  prompt: """
    共通宣言 (invocation_mode / 必読 checklist / commits_added / 質問禁止 + assumptions fallback): `~/.claude/skills/_shared/spawn-prompt-common.md` §1〜§4 を参照。
    本フェーズは research (exploration-only) のため commits_added: [] が正解 (commit しない)。

    <論点> について、<プロジェクト種別> での現時点の主流選択肢とトレードオフを調査してください。

    出力形式:
    - 選択肢 A: 採用理由 / トレードオフ / 主要採用事例
    - 選択肢 B: 同上
    - 選択肢 C: 同上

    各 200 字以内、リンクは公式ドキュメント・GitHub のみ。
  """
})
```

### 3-2. ADR をその場で書く

決定が出たら `references/adr-template.md` のテンプレで `<ADR_DIR>/NNNN-<kebab-case-title>.md` (既存最大番号 + 1、4 桁) を Write し、
採番・slug・タイトルをユーザーに見せてから commit する。既存の staged 変更を巻き込まない:

```bash
git diff --cached --quiet || { echo "staged 変更が既にあるため停止"; git diff --cached --name-only; exit 1; }
git status --short
git add -- "<ADR_DIR>/<NNNN>-<slug>.md"      # bootstrap-brief を更新したら同様に -- で明示指定
git diff --cached --name-only                # 意図したファイルだけであること
git commit -m "docs(adr): <NNNN> <TITLE>"
```

「ADR-NNNN を起こしました。次の論点に進みますか?」と確認して次へ。

### 3-3. 全論点が片付くまでループ

未対応の論点を見せながら進める。「後でいい」とされた論点は ADR にせず、フェーズ4 の Issue 候補として保留する。

---

## フェーズ4: マイルストーン分解

### 4-1. 初期マイルストーンの下書き

feature-expert に下書きを依頼する:

```
Agent({
  subagent_type: "op-skill:feature-expert",
  description: "draft initial milestones",
  prompt: """
    invocation_mode: op_managed

    op-architect から呼ばれた OP-managed Mode 起動です。新規プロジェクトの初期マイルストーンを下書きしてください。
    共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added): `~/.claude/skills/_shared/spawn-prompt-common.md` §1〜§4 を参照。
    本フェーズは exploration-only のため commits_added: [] が正解 (commit しない)。

    【プロジェクト種別】
    <Tauri v2 + Vue 3 等>

    【確定済み ADR】
    - ADR-0001: <タイトル> → <要旨>
    ...

    【ヒアリング要旨】
    - ドメイン / コアユースケース / 規模感: ...

    【依頼内容】
    最初の 2〜4 週間で着手すべき作業を 5〜12 個のマイルストーン (Issue 候補) に分解してください。各マイルストーン:

    {
      "key": "M1",
      "title": "<業務領域>: <成果物>",
      "scope_in": ["<作成・編集するファイルパス候補>"],
      "scope_out": ["<このマイルストーンでは触らない領域>"],
      "ui_impact": true | false,
      "success_criteria": "<どうなれば完了か>",
      "verification": ["<必須検証項目>"],
      "depends_on": ["<先に終わっている必要がある key>"],
      "related_adr": ["ADR-NNNN"],
      "rationale": "<なぜこの粒度・順序か>"
    }

    1 マイルストーン = 1 PR = 1〜3 日分。並列実行できるようなるべく独立させる。
    最小スケルトン (プロジェクト雛形生成) を必ず M1 に含める。
  """
})
```

feature-expert が使えない / 出力が不完全なら司令官が同じ形式で直接分解する: 1 番目はスケルトン、
以降は DB / API / UI / 検証 / 配布 / ドキュメントの領域別、ADR と対応しない Issue は原則作らない (作るなら理由を本文に書く)、
depends_on の連鎖は最大 2 段。

### 4-2. ユーザー承認

`| key | title | 依存 | 主要 scope | UI |` の表で提示し、並べ替え・削除・追加・分割の指示を反映してから承認を得る。

## フェーズ4.5: スケルトン雛形生成 (`--scaffold` 時のみ)

`references/scaffold-mode.md` に従う。未指定なら skip。

## フェーズ4.6: UI マイルストーンのデザインモック

UI を持つ種別 (Tauri v2 + Vue 3 / Vue 3 SPA / Nuxt / Flutter) で `ui_impact: true` のマイルストーンがある場合のみ。
`--adr-only` では skip する。

1. マイルストーンごとに apply 担当を決める: visual / token / component 中心 → `designer-expert`、
   新規画面でも業務ロジック・API・store 中心 → `feature-expert`。
2. `_shared/design-mock.md` に従ってモックを作り、人間と合意して URL を確定する。同じ画面を触るマイルストーンはモックを共有し、
   共有のしかた (lead / follower と `参照: issue[k]`) は op-plan フェーズ5-0 に従う (key は `M<n>`)。
3. UI を持つプロジェクトでは、スケルトン直後に **デザインシステム基盤** のマイルストーンを置く。本文は
   「`/op-skill:op-component --init` で実施」(`_shared/design-system.md`)。以降の部品は `/op-skill:op-component` で
   1 つずつ登録し、画面マイルストーンは登録済みの部品に `depends_on` でつなぐ。

---

## フェーズ5: Issue 起票 (op-run 互換)

### 5-1. Issue 本文

`_shared/pr-templates.md`「Issue 本文 (指示書フル版)」に、新規構築向けに次のように書く:

| 節 | 書き方 |
|---|---|
| 触ってよいファイル | 新規作成パスを明示 |
| 触ってはいけないファイル | 他マイルストーンの scope_in と ADR で別案件とした領域 |
| scan が立てた仮説 | 「ADR-NNNN (<タイトル>) に基づき <方針> で実装する」 |
| 除外した仮説 | ADR-NNNN の Alternatives で不採用とした案と理由 |
| 必須検証項目 | `_shared/project-profile.md` の種別別検証コマンド |
| 成功条件 | マイルストーンの success_criteria |
| 既知の落とし穴 | 初期構築で踏みやすい罠 (依存初期化漏れ・型生成タイミング等) |

本文末尾に `## 関連 ADR`、依存があれば `## 依存` を置く。UI マイルストーンには `デザインモック: <URL>` の 1 行を書く (見た目の仕様は文章で書かない)。
冒頭 marker と expert ラベルは UI 影響 × apply 担当で決める (ラベルと `op-run-expert` は必ず一致させる):

| UI 影響 | apply 担当 | fingerprint domain | `op-run-expert` | `op-post-check-expert` | expert ラベル |
|---|---|---|---|---|---|
| なし | feature-expert | feature | feature-expert | null | `pro-feature-expert` |
| あり | feature-expert | feature | feature-expert | ux-ui-audit-expert | `pro-feature-expert` + `pro-ux-ui-audit-expert` |
| あり | designer-expert | design | designer-expert | ux-ui-audit-expert | `pro-designer-expert` + `pro-ux-ui-audit-expert` |

```html
<!-- op-fingerprint: <op core fingerprint --domain <d> --title "<title>" --file <scope_in[0]> --plain の出力> -->
<!-- op-run-expert: <expert> -->
<!-- op-post-check-expert: <ux-ui-audit-expert | null> -->
<!-- op-depends-on: #N, #M -->   (依存があるときのみ。起票時に番号解決)
```

`pro-feature-expert` と `pro-designer-expert` を同じ Issue に同時付与しない。

### 5-2. ラベル

`auto-report` + `op-architect` + expert ラベル (5-1 の表) + `milestone:initial` + `module:<name>`。
`milestone:initial` は op-loop の既定探索キー。

### 5-3. ラベル bootstrap・dedup・起票プレビュー

1. `op repo init --dry-run` の結果を提示し、承認後に `op repo init` で canonical ラベルを作成する (`module:<name>` は起票時の `--ensure-labels` が補完)。
2. 全マイルストーンの draft で `op scan dedup --findings-json drafts.json --json` を実行する (`_shared/filing-gate.md` §2。op-plan 4-4 と同じ扱い)。
3. 起票予定表 (`| key | title | labels | depends_on |`) を提示し、「この内容で起票します。よろしいですか?」の承認を得る。

### 5-4. 起票実行

op-plan skill のフェーズ7 (7-2 Marker Publish Validate / 7-3 Pass 1・Pass 2) の手順で、`M<n>` を draft 識別子として
トポロジカル順に直列起票し、`op-depends-on` / `## 依存` / `参照: issue[k]` を実番号に解決する。
失敗時は「作成済み / 未作成 / 本文更新失敗」を分けて報告し、作成済み Issue の自動 close はしない。
`op issue create` が gh 認証 / 権限 / ネットワークで失敗した場合は、ユーザー確認後に `--issue-md` 出力へ切り替えてよい。

### 5-5. 完了レポート

```
## op-architect 完了

### 生成 ADR
| 番号 | タイトル |
|------|---------|
| 0001 | ... |

### bootstrap-brief.md
- 軽微判断 N 件を集約

### 起票 Issue (初期マイルストーン)
| # | title | 依存 | 関連 ADR |
|---|-------|------|---------|
| 42 | スケルトン: ... | - | 0001,0002 |

### 次のステップ
- `/op-skill:op-run --label milestone:initial` で実装に進める
- 依存順に直列駆動するなら `/op-skill:op-loop --label milestone:initial`
- まずスケルトン Issue を単独で完了させてから他を並列で進めるのが安全
- 今後の判断で既存 ADR を覆す場合は Status (Deprecated / Superseded) を更新する
```
