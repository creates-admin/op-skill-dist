# op-plan フェーズ2.5: op-survey discovery

## 起動判定

`op-config.yaml` の `op_survey` (`_shared/op-config-schema.md` §13) の `enabled` / `auto_detect` と `--survey` / `--no-survey` で決める。
`enabled: false` で `--survey` が指定されたときは、起動しない旨をユーザーに伝える。

auto-detect: フェーズ1 の要望が「調べて / 洗い出し / 棚卸し / 監査 / どこに〜があるか / 全部探して」等を含み、
具体 target (単一 file / feature / symbol) が無ければ hit。曖昧なら skip する。
auto-detect で起動したときは「investigation 型と判定したため op-survey を実行します (--no-survey で無効化可)」と通知する。

## 呼び出し

起動する場合は先に `_shared/workflow-calling.md` §1 の preflight を行う (Workflow tool が無ければ §1 のとおり停止し、
`--no-survey` で再実行できることを添える)。戻り値 unwrap は同 §2。

```javascript
const raw = await Workflow({
  name: 'op-skill:op-survey',
  args: {
    repo_root: '<repo の絶対パス>',
    goal: '<フェーズ1 メモの 1〜2 行要約>',
    preset: '<op-skill repo (skills/ と workflows/ がある) なら "op-skill-migration"、それ以外は省略 (goal から軸を導出)>',
    model: '<op_survey.models.investigator、既定 sonnet>',
  },
})
const survey = raw.result ?? raw;   // { goal, preset, axis_source, findings[], coverage_notes[] }
```

## 結果の扱い

- `findings` (title / files / recommended_action) と `coverage_notes` をそのままフェーズ3 の audit prompt に渡し、ユーザーにも要約を見せる。
- Workflow の実行が失敗した / findings が空 → survey なしでフェーズ3 へ進む (§13)。
