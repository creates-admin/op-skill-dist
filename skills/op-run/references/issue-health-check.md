<!--
schema_version: 1
last_breaking_change: 2026-05-23
notes: v1 (2026-05-23): op-run フェーズ1.5 (Issue 健全性チェックと正規化委譲) の詳細仕様。
       SKILL.md god file (~2785 行) 抑制のため本ファイルへ物理切り出し (Issue #425 Stage 2)。
       切り出し前後で bash 実装 / 判定基準 / モード分岐 / ユーザー提示フォーマットを byte-identical 維持。
-->

<!--
機能概要: op-run フェーズ1-1 (Issue 取得) と フェーズ1-2 (クラスタリング) の間に挟む処理。
         人間立て Issue / 古い形式 Issue / op-architect / op-scan / op-patrol 起票 Issue が混在する
         取得結果を、指示書フル版を持つ Issue だけがクラスタリングに進むように正規化する仕様。
         1.5-1 健全性判定 / 1.5-2 partial Issue の op-scan 委譲 / 1.5-3 insufficient Issue の投げ返し /
         1.5-4 派生 Issue の取り込みと再クラスタリング / 1.5-5 ループ防止 / 1.5-6 同期待ちタイムアウト
         の 6 サブ節を集約する。
作成意図: SKILL.md の god file 化解消 (Issue #406 staged_refactor / #425 Stage 2)。
         健全性判定の bash 実装と委譲ロジック、insufficient Issue 投げ返しコメント、
         派生 Issue 取り込み手順を SKILL.md 本体と byte-identical のまま分離する。
注意点: 本ファイルの bash 実装・判定 grep パターン・モード分岐を変更するときは、必ず SKILL.md 本体の
       フェーズ1-1 (Issue 取得) / フェーズ1-2 (クラスタリング) との接続点と整合を確認する。
       --no-wait-normalize / --auto / --auto --normalize の挙動表は op-scan/SKILL.md と
       _shared/labels-and-markers.md の `derived-from-issue` / `requires-normalization` /
       `needs-clarification` ラベル契約と一致する必要がある。
       Stage 3-6 (global-review-spawn / review-fix-loop / expert-resolution) は別 PR
       (Issue #425 proposed_stages 参照)。
-->

<!-- op-domain: refactor -->
<!-- op-source: op-run -->

# op-run: Issue 健全性チェックと正規化委譲 (フェーズ1.5)

op-run フェーズ1.5 全体の仕様。
SKILL.md 本体から物理切り出し (Issue #425 Stage 2)。

---

## フェーズ1.5: Issue 健全性チェックと正規化委譲

フェーズ1-1 (Issue 取得) と フェーズ1-2 (クラスタリング) の間に挟む処理。
人間立て Issue / 古い形式 Issue / op-architect / op-scan / op-patrol 起票 Issue が混在する
取得結果を、**指示書フル版を持つ Issue だけがクラスタリングに進む** ように正規化する。

### 1.5-1. 健全性判定

各 Issue について以下の 3 状態を判定する。

| 状態 | 判定基準 | 対応 |
|------|---------|------|
| **fully-instructed** | 本文に hidden marker `<!-- op-source: op-scan\|op-patrol\|op-architect\|op-plan\|op-merge -->` あり、または指示書フル版 5 節 (scope_in / scope_out / verification_steps / success_criteria / gotchas) がほぼ揃う | そのまま 1-2 クラスタリングへ |
| **partial** | タイトル + 本文に最低限の症状記述またはファイルパス断片はあるが、指示書節欠損 | op-scan `--from-issue` に委譲 (1.5-2 へ) |
| **insufficient** | タイトルのみ / 症状曖昧 / 対象モジュール特定不可 | gh issue comment で人間に投げ返し、キューから除外 (1.5-3 へ) |

判定の参考実装:

```bash
# fully-instructed 判定
has_marker=$(echo "$BODY" | grep -cE '<!-- op-source: (op-scan|op-patrol|op-architect|op-plan|op-merge)')
has_sections=$(echo "$BODY" | grep -cE '触ってよいファイル|必須検証項目|成功条件')

if [ "$has_marker" -ge 1 ] || [ "$has_sections" -ge 2 ]; then
  state="fully-instructed"
elif echo "$BODY" | grep -qE '\.[a-z]{1,4}\b|src/|lib/'; then
  state="partial"
else
  state="insufficient"
fi
```

### 1.5-1-b. 未トリアージ Issue の soft nudge (ADR-0017 決定11)

1.5-1 で各 Issue body を既に読むので、**そのついでに** `op-spec-ref` marker
(`<!-- op-spec-ref: <feature>#<decision> -->`、op-spec の verdict が付いた印) の有無を判定する。
op-spec verdict が無い (= 方向性が正本で固まっていない) Issue が**複数** (2 件以上) あれば、
plan のダイジェスト節 (フェーズ1.5 ダイジェスト) に **一行だけ** nudge を出す。

```bash
# 1.5-1 のループ内で各 BODY を読むついでに集計する (追加 fetch は不要)
# has_spec_ref=0 を未トリアージとみなす
has_spec_ref=$(echo "$BODY" | grep -cE '<!-- op-spec-ref:')
# untriaged_count は 1.5-1 ループ外で 0 初期化しておき、ここで加算する
if [ "$has_spec_ref" -eq 0 ]; then
  untriaged_count=$((untriaged_count + 1))
fi
```

ループ後に閾値判定し、対話 plan のダイジェストへ一行出す:

```bash
: "${untriaged_count:?untriaged_count must be set — 1.5-1 ループ前に 0 初期化}"
# 未トリアージが複数 (2 件以上) のときだけ nudge。1 件以下は出さない (ノイズ抑制)。
if [ "$untriaged_count" -ge 2 ]; then
  printf '%s\n' "> ℹ️ 未トリアージ Issue が ${untriaged_count} 件あります (op-spec verdict 未付与)。方向性を先に固めるなら /op-spec を推奨します (このまま実行も可・続行が既定)。"
fi
```

**厳守 (ADR-0017 決定11)**:

- **block しない / 必須 gate にしない**。nudge は情報出力のみ。Issue をキューから外さず、
  クラスタリングも止めない。未トリアージ Issue もこれまで通り fully-instructed / partial /
  insufficient の判定に従って先へ進む (疎結合・後方互換・graceful degradation を維持)。
- `manual_review_bucket` (expert spawn が no-op になる label を実際に弾く既存機能) とは**別物**。
  混同して未トリアージ Issue を bucket に落とさない (後方互換事故 = 既存 Issue 全 block になる)。
- `--auto` 経路 (plan mode skip) では nudge を**出さない** (対話 plan を前提とする情報出力のため)。
  既存の `--auto` 分岐の挙動を変えない。
- トリアージ済み (= `op-spec-ref` あり) Issue は `op-spec-ref` を信頼し、op-run は内容解説を
  正本へ委譲できる (plan lean 化、ADR-0017 OQ7。`op-spec-ref` の正本登録は
  `_shared/markers/labels-and-markers.md` を参照)。

> この nudge 文言は **本ファイルが正本**。plan file への転記 (plan lean 化) もこの文言を使う
> (文言を 1 箇所に確定させ、表現の drift を防ぐ)。

### 1.5-2. partial Issue の op-scan 委譲

partial Issue を op-scan `--from-issue` に渡す。モードによる挙動分岐:

| モード | 動作 |
|-------|------|
| 対話 (default) | partial Issue 一覧をユーザーに提示 → 承認後、op-scan を並列起動 → 同期待ち → 派生 Issue を取り込んでクラスタリング |
| `--auto` | partial Issue は委譲対象から外し、`requires-normalization` ラベルを付けてキューから除外 (人間レビュー余地を残す) |
| `--auto --normalize` | 自動委譲・同期待ち・取り込みまで自動実行 (フルオートライン) |
| `--no-wait-normalize` | 委譲だけ走らせて持ち越し、今回 op-run のクラスタリングからは外す。次回 op-run で派生 Issue が拾われる |

#### 委譲呼び出し

```
for issue in partial_issues:
  Skill({
    skill: "op-scan",
    args: f"--from-issue {issue.number} {auto_flag}"
  })
```

`auto_flag` は対話モードでは空、`--auto --normalize` のときは `--auto`。

#### ユーザー提示フォーマット (対話モード)

```
## op-run 健全性チェック結果

### 既に指示書フル版を持つ (3 件) — このままクラスタリングへ
- #87 (op-source: op-scan): auth/login: panic 修正
- #88 (op-source: op-patrol): jobs: worker race
- #89 (op-source: op-architect): UI: ログイン画面初期実装

### 正規化が必要 (2 件) — op-scan --from-issue に委譲
- #42 "ログイン画面で時々落ちる" (本文にファイル名 login.rs あり)
- #51 "保存できない" (本文に export.ts への言及あり)

### 投げ返し (1 件) — キューから除外
- #99 "なんかおかしい" (本文に対象情報なし → コメントで詳細追記を依頼)

正規化を実行しますか?
1. すべて委譲 (約 5 分待ち、結果取り込み後にクラスタリング)
2. 番号で個別選択 (例: 42 のみ)
3. 委譲スキップ (健全 3 件のみでクラスタリング)
4. キャンセル
```

### 1.5-3. insufficient Issue の投げ返し

```bash
op issue comment "$ISSUE_NUM" --body-file - <<'EOF'
## op-run が実装に必要な情報を確認しています

この Issue は op-run のキューに入りましたが、自動実装に必要な情報が不足しています。

### 必要な情報 (どれか 1 つでも追記いただけると進みます)
- 対象ファイルパス (例: `src/auth/login.rs`)
- 再現手順または期待動作 (例: 「ログイン後 X が起きるが Y が正しい」)
- 触ってほしくない領域 (あれば)

24時間返信がない場合、この Issue は op-run のキューから一時的に外します。
情報が揃ったらラベル `auto-report` を再度付けてください。
EOF

op issue edit-labels "$ISSUE_NUM" --remove "auto-report" --add "needs-clarification"
```

### 1.5-4. 派生 Issue の取り込みと再クラスタリング

委譲が完了したら、派生 Issue (`derived-from-issue` ラベル付き) を再取得してクラスタリング対象に加える。

```bash
# 派生 Issue を取得 (op issue list の envelope は .details.issues[])
op issue list --label "derived-from-issue" --state open --search "label:auto-report" --limit 50

# 元 Issue 集合から partial を除外、派生 Issue を追加して 1-2 クラスタリングへ
```

`--no-wait-normalize` の場合はこのステップをスキップし、健全な Issue のみで 1-2 へ進む。

### 1.5-5. ループ防止

派生 Issue は op-scan が必ず指示書フル版で起票するため、再度フェーズ1.5 を通っても
fully-instructed 判定で素通りする。設計上、委譲ループは発生しない。

万一 op-scan 起票 Issue が partial 判定されたら (バグまたは不完全実装):
- そのまま fully-instructed として扱う (hidden marker `op-source: op-scan` を信頼)
- 完了報告に warning を出す (op-scan 側の指示書品質劣化を検出)

### 1.5-6. 同期待ちのタイムアウト

op-scan 委譲が 15 分以上完了しない場合:
- 当該 partial Issue を「正規化タイムアウト」としてキューから除外
- ユーザーに通知、`--no-wait-normalize` 相当の動作にフォールバック
- 健全な Issue のみで 1-2 へ進む

