# op-spec: derived issue 起票手順 (3-1b)

正本 write で記録した gap のうち、human が「実装で解消する」と align したものだけを起票する。
起票前ゲートは `_shared/filing-gate.md` に従う (対話経路 = 人間承認。severity の例外は同 §1)。

## 1. per-gap 承認

```
gap: <feature>#<decision-id> — <gap の内容を 1 行で>
現在: code では <実態>、正本では <あるべき姿>

この gap を derived issue として起票しますか？ (y / n — n なら正本の [?] のまま残す)
```

## 2. 重複チェック

fingerprint は `op core fingerprint --plain --domain feature --title "<normalized_title>" --file "<primary_file>" --symbol "<symbol>"` で生成する。
承認した gap の finding draft (domain `feature`) を配列 JSON にまとめて判定する:

```bash
op scan dedup --findings-json "$DRAFTS_JSON" --json
```

重複 / 類似の扱いは `filing-gate.md` §2。dedup 自体が失敗したら起票せず中断し、手動確認を促す。

feature が `design-system` で、gap が部品の作成・変更・登録状態 (カタログ掲載・契約・部品単位トークン・`status:`) に関わるものは
部品 issue として起票する (書式は `_shared/design-system.md`「部品 issue」。fingerprint の domain は `design`、
`op-run-expert: designer-expert`、ラベルは `auto-report,pro-designer-expert`)。それ以外の gap は下記のとおり。

## 3. 起票 (1 件ずつ直列)

本文は `pr-templates.md`「Issue 本文 (指示書フル版)」に従って一時ファイルに書く。marker は次の 3 つ:

```
<!-- op-fingerprint: <手順2 で生成した fingerprint> -->
<!-- op-run-expert: feature-expert -->
<!-- op-spec-ref: <feature>#<decision-id> -->
```

本文には `派生元: <feature>#<decision-id> (正本)` を自然文で書き、元になった issue があれば `派生元: #N` も併記する。

```bash
op core marker-lint --body-file "$DERIVED_BODY_FILE" --source-hint issue-body --strict
op issue create --title "[feature-expert] <feature> の <gap 内容>" --label "auto-report,pro-feature-expert" \
  --body-file "$DERIVED_BODY_FILE" --ensure-labels
```

marker-lint が block なら起票せず marker を直す。`op issue create` の `.details.issue_number` を控える。

## 4. back-link

正本の該当決定行に `realizes #<issue_number>` を追記し、issue 側の `op-spec-ref` と対にする:

```
変更前: D-N: <決定内容> [code]
変更後: D-N: <決定内容> [code] (realizes #<issue_number>)
```
