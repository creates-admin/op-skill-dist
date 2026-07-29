# expert-debug scan 契約の詳細 (patrol_sample / investigation_candidates / bulk_group)

<!--
機能概要: SKILL.md 本文から切り出した scan (detect) モード固有の契約詳細。
         §1 patrol_sample の優先順位、§2 investigation_candidates の YAML schema、
         §3 debug 固有 bulk_group 表とバッチ上限ルールを収録する。
作成意図: ADR-0030 決定 1 (worker 層 progressive disclosure)。
         SKILL.md 本文は「references を 1 行も読まなくても事故らない層」に絞り、
         読む必要が mode / 状況で決まる詳細をここへ移した (2026-07-29 Wave B1)。
         内容は移設前と同一で、契約の変更は伴わない。
注意点: agent は必要時のみ Read する想定。常時参照ではない。
       §1 は patrol_sample で動くとき、§2 は `allow_text_tail: true` /
       `candidate_report: true` が明示されたとき、§3 は bulk_group 付与時に読む。
       scope mode の定義そのものは `_shared/expert-spawn.md`「scan scope mode 契約 (3 モード)」節、
       3-bucket の分類定義・canonical 必須フィールド名は SKILL.md 本文が正本
       (ここには重複させない。本ファイルは debug 固有の優先順位・schema・bulk_group のみ)。
-->

---

## §1 patrol_sample の優先順位

`patrol_sample` mode の定義・`scope_origin` 付与・Medium / Low 報告禁止は
`_shared/expert-spawn.md`「scan scope mode 契約 (3 モード)」節が正本 (未読なら先に Read する)。
以下は debug-expert 固有の risk-weighted sampling 優先順位:

1. Tauri invoke 境界
2. file I/O / path / fs 操作
3. async spawn / await 境界
4. error handling / catch / Result 変換
5. 最近変更された high-churn file
6. capability / permission / config 周辺
7. Flutter lifecycle / dispose 周辺

昇格できないものは investigation_candidates に留める (出力するかは §2 と
`_shared/expert-spawn.md`「scan 出力 envelope 契約」節に従う)。

---

## §2 investigation_candidates の YAML schema (既定では出力しない)

**op-scan / op-patrol が `allow_text_tail: true` または `candidate_report: true` を明示した場合のみ**、
`findings` envelope の **後段ではなく** 指定された別セクションに以下のフォーマットで列挙する。
指定がない場合は完全に捨てる (confirmed_findings がなければ `{"findings": []}` のみ返す)。

```yaml
investigation_candidates:
  - id: candidate-001
    confidence: high | medium  # high のみ報告、low は捨てる
    stack: Rust | Tauri | Vue | TypeScript | Flutter
    category:                  # bug-async-leak 等
    file: path/to/file.ext
    lines: "L42-L58"
    evidence: |                # 該当コード抜粋
      <該当コード 5-10 行>
    suspected_failure_scenario: |  # 想定される失敗シナリオ
      <どういう入力・条件で何が起きるか>
    required_repro:                # 昇格に必要な再現条件
      - <データ条件>
      - <環境条件>
    suggested_probe:               # 確認方法 (テスト or ログ or bisect)
      - <test を 1 本書いて XXX を確認>
    promote_to_confirmed_when: |   # この条件を満たせば confirmed に昇格できる
      <条件を 1〜2 文>
```

---

## §3 debug-expert 固有の bulk_group と分割ルール

| bulk_group | 対象 |
|-----------|------|
| `bug-empty-catch` | 例外握りつぶし (`Result` 無視 / `catch (e) {}`) が散在 |
| `bug-missing-await` | async/await 漏れ・JoinHandle 捨て・spawn 後 await なし |
| `bug-null-unguarded` | null/undefined / Option 無防備アクセスの集中 |
| `bug-tauri-invoke-mismatch` | invoke payload と Rust command struct の不一致 |
| `bug-flutter-dispose-leak` | controller / subscription の dispose 漏れ集中 |
| `bug-rust-fs-error-swallow` | std::fs / tokio::fs のエラー無視 |

5 件以上の同 bulk_group は op-scan がバッチ Issue 化。
ただし **1 Issue あたり最大 10 件**まで。10 件を超える場合はディレクトリ単位または stack 単位で分割する (apply エージェントの一撃巨大修正を防ぐ)。
