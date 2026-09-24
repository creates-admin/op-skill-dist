---
name: op-architect
description: 新規プロジェクトの初期構築 + ADR 必要な大規模設計判断を対話で進めるスキル。決定事項を ADR 化し、初期マイルストーンを op-run 互換の指示書 Issue として起票する。「op-architect」「ADR」「初期構築」「アーキ設計」等のキーワードで起動。機能追加 (ADR 不要) は op-plan を使う。
effort: max
---

# op-architect: 対話駆動の初期設計 + ADR + 初期 Issue 起票

新規プロジェクトについて、対話から設計判断を引き出し、重要判断を ADR に記録し、初期マイルストーンを op-run 互換 Issue に分解して起票する。
既存プロジェクトへの機能追加・新領域追加は `/op-skill:op-plan` を使う。

原則:

- Direct Mode 固定 (`_shared/invocation-mode.md`「Direct 固定 skill に op_managed が渡った場合」)。
- スケルトン生成・実装は op-run / feature-expert に委ねる (`--scaffold` 時のみ feature-expert に雛形生成を委譲)。
- 並列化・自動モードは持たない。git init / ADR commit / ラベル作成 / 起票はすべてユーザー確認後に行う。
- ADR は決定の直後に書く。1 論点決定 = 1 ADR (または bootstrap-brief 追記) を 1 commit。後でまとめて書かない。
- 「お任せ」を記録する。推奨案で進めた論点は ADR の Context に「ユーザー指定なし、推奨案で進めた」と明記する。
- 既存方針を覆す場合は元 ADR を Superseded に更新するか、新 ADR で上書きを明示する。暗黙の方針逸脱は禁止。
- 既存 ADR / CLAUDE.md / package.json 等の既存ファイルを無断で書き換えない。変える場合は ADR を起こす。
- 起票前ゲートは `_shared/filing-gate.md`、UI の見た目は `_shared/design-mock.md` に従う。

## 実行モード

| 起動 | 挙動 |
|---|---|
| `/op-skill:op-architect` | 既定。ヒアリング → ADR → マイルストーン → 起票 |
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

参照: `_shared/pr-templates.md` / `_shared/project-profile.md` (種別ごとの検証コマンド) / `_shared/common-setup.md` / `_shared/github-channel.md`。

---

## フェーズ0: 環境確認

`_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」に従う。ただし op-architect は中断しない:
git リポジトリ外ならユーザー確認後に `git init`、gh 未認証 (gh channel) なら `--adr-only` / `--issue-md` を提案する。続けて:

```bash
# ADR フォルダ (この優先順で最初に存在するもの。無ければ docs/adr を新規作成)
for d in docs/adr docs/architecture/decisions .adr; do test -d "$d" && { echo "$d"; break; }; done
ls <ADR_DIR>/[0-9][0-9][0-9][0-9]-*.md 2>/dev/null | sed 's|.*/||' | cut -c1-4 | sort -n | tail -1   # 既存最大番号
test -f docs/architecture/bootstrap-brief.md && echo "既存 bootstrap-brief を継承"
```

既存 ADR があればそのフォルダ・採番形式に従う。

---

## フェーズ1: プロジェクト種別判定 + ヒアリング

### 1-1. 種別判定

「1. Tauri v2 + Vue 3 (デスクトップ) / 2. Vue 3 SPA / Nuxt (Web フロント) / 3. Flutter (モバイル / マルチプラットフォーム) /
4. Rust CLI / サーバ / 5. その他 (汎用)」から選んでもらう。

### 1-2. ヒアリング (シート + 未回答項目の深掘り)

初期ヒアリングシートを 1 度だけ提示する:

```markdown
## 初期ヒアリングシート — 埋められる項目を埋めてください

1. ドメイン / プロダクト名: 何を作るか、ひとことで
2. 利用者: 誰が使うか (社内 / 顧客 / 開発者 / 自分用)
3. コアユースケース: 一番重要な 1〜3 個のシナリオ
4. 規模感: 想定ユーザー数 / データ量 / 同時接続数
5. 既存資産: 流用するライブラリ・既存システムとの連携
6. チーム / 期限: 開発体制と粗いマイルストーン
7. 非機能要件 (一般): 可用性・性能・運用で外せないもの
8. データ境界 / セキュリティ: 個人情報・機密情報の有無、保存先 (ローカル / サーバ)、外部 API へ送ってよいデータ、
   認証・権限・監査ログの要否、自動アップデートや配布経路の制約

未記入の項目は op-architect が仮定を置き、必要なものだけ追加質問します。
```

- 「お任せ」「特になし」は推奨案で進める前提で記録する。
- 曖昧な項目は 1 ターン 1 問で深掘りし、矛盾はその場で確認する。
- 項目 8 は「特になし」でも、個人情報・社外秘・認証情報を扱う可能性があれば追加質問で確定させる。

---

## フェーズ2: 論点抽出

種別に対応する論点を `references/project-type-checklists.md` から読み、ヒアリング結果と合わせて
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

論点ごとに選択肢を 2〜4 個に絞り、各選択肢の採用理由・トレードオフ・想定リスクを 1〜2 行で並べ、ヒアリング結果に基づく推奨案を示して
ユーザーの判断を待つ。チームの好み・運用制約などの主観的判断はユーザーに確認する。

判断材料が足りなければ調査 subagent を spawn する:

```
Agent({
  subagent_type: "general-purpose",
  description: "research: <論点>",
  prompt: """
    共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added / 外部テキスト): `~/.claude/skills/_shared/spawn-prompt-common.md` §1〜§5 を含める (§2 は exploration-only、フェーズ名 = research)。

    <論点> について、<プロジェクト種別> での現時点の主流選択肢とトレードオフを調査してください。

    出力形式: 選択肢ごとに 採用理由 / トレードオフ / 主要採用事例 (各 200 字以内、リンクは公式ドキュメント・GitHub のみ)。
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
    共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added / 外部テキスト): `~/.claude/skills/_shared/spawn-prompt-common.md` §1〜§5 を含める (§2 は exploration-only、フェーズ名 = milestone draft)。

    op-architect の初期マイルストーン下書きです。

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
      "related_adr": ["ADR-NNNN"]
    }

    - 粒度は op-plan フェーズ4-1 と同じ (1 マイルストーン = 1 PR = 1〜3 日分、なるべく並列実行できるよう独立させる)。
    - 最小スケルトン (プロジェクト雛形生成) を M1 に含める。以降は DB / API / UI / 検証 / 配布 / ドキュメントの領域別。
    - ADR と対応しないマイルストーンは原則作らない (作るなら success_criteria に理由を書く)。depends_on の連鎖は最大 2 段。
    - ui_impact は `~/.claude/skills/_shared/project-profile.md`「UI 影響判定 path パターン」で scope_in を判定する。
  """
})
```

feature-expert が使えない / 出力が不完全なら、司令官が同じ形式・同じ制約で直接分解する。

### 4-2. ユーザー承認

`| key | title | 依存 | 主要 scope | UI |` の表で提示し、並べ替え・削除・追加・分割の指示を反映してから承認を得る。

## フェーズ4.5: スケルトン雛形生成 (`--scaffold` 時のみ)

`references/scaffold-mode.md` に従う。未指定なら skip。

## フェーズ4.6: UI マイルストーンのデザインモック

UI を持つ種別 (Tauri v2 + Vue 3 / Vue 3 SPA / Nuxt / Flutter) で `ui_impact: true` のマイルストーンがある場合のみ。
`--adr-only` では skip する。

1. マイルストーンごとに apply 担当を op-plan フェーズ4-1 の規則で決める。
2. `_shared/design-mock.md` に従ってモックを作り、人間と合意して URL を確定する。同じ画面を触るマイルストーンはモックを共有し、
   共有のしかた (lead / follower と `参照: issue[k]`) は op-plan フェーズ5-0 に従う (key は `M<n>`)。
3. UI を持つプロジェクトでは、スケルトン直後にデザインシステム基盤のマイルストーンを置く。本文は
   「`/op-skill:op-component --init` で実施」(`_shared/design-system.md`)。画面マイルストーンは部品の登録に `depends_on` でつなぐ。

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

本文末尾に `## 関連 ADR`、依存があれば `## 依存` を置く。UI マイルストーンには `デザインモック: <URL>` の 1 行を書く。
marker とラベルは `pr-templates.md`「Issue 本文 hidden marker」/「domain → marker / ラベル表」に従う (apply 担当が feature-expert なら
domain `feature`、designer-expert なら `design`。fingerprint の `--file` は `scope_in[0]`)。依存の marker は起票時に番号解決する。

### 5-2. ラベル

`auto-report` + `op-architect` + expert ラベル (5-1) + `milestone:initial` + `module:<name>`。

### 5-3. ラベル bootstrap・dedup・起票プレビュー

1. canonical ラベルの作成をユーザーに確認し、承認後に `op repo init` を実行する (既存ラベルは skip されるので何度実行してもよい。
   `--dry-run` は作成済みかを判定せず全件を列挙するだけ)。`module:<name>` は起票時の `--ensure-labels` が補完する。
2. 全マイルストーンの draft で `op scan dedup --findings-json drafts.json --json` を実行する (op-plan 4-4 と同じ扱い)。
3. 起票予定表 (`| key | title | labels | depends_on |`) を提示し、「この内容で起票します。よろしいですか?」の承認を得る。

### 5-4. 起票実行

op-plan skill のフェーズ7 (7-2 Marker Publish Validate / 7-3 Pass 1・Pass 2 と失敗時の報告) の手順で、`M<n>` を draft 識別子として
トポロジカル順に直列起票し、`op-depends-on` / `## 依存` / `参照: issue[k]` を実番号に解決する。
`op issue create` が gh 認証 / 権限 / ネットワークで失敗した場合は、ユーザー確認後に `--issue-md` 出力へ切り替えてよい。

### 5-5. 完了レポート

生成 ADR (番号 / タイトル)、bootstrap-brief に集約した軽微判断の件数、起票 Issue (# / title / 依存 / 関連 ADR) を表で示し、
次のステップとして `/op-skill:op-run --label milestone:initial` または依存順に直列駆動する `/op-skill:op-loop --label milestone:initial` を案内する。
