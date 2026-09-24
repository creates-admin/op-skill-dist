# op-plan フェーズ2.5: op-survey discovery

op-survey は既存 repo の多軸横断調査 (「調べて直したい」系) を構造化する read-only workflow。判定・順位付けはしない。

## 起動判定

次をすべて満たすときに起動する:

1. `op_survey.enabled` が `false` でない (`op-config-schema.md` §13。`false` なら `--survey` があっても起動せず、その旨をユーザーに伝える)
2. `--survey` 指定、または auto-detect が hit (`op_survey.auto_detect: false` なら `--survey` 明示時のみ)
3. `--no-survey` が指定されていない

auto-detect: フェーズ1 の要望が「調べて / 洗い出し / 棚卸し / 監査 / どこに〜があるか / 全部探して」等を含み、
具体 target (単一 file / feature / symbol) が無ければ hit。曖昧なら skip する。
auto-detect で起動したときは「investigation 型と判定したため op-survey を実行します (--no-survey で無効化可)」と通知する。

## 呼び出し

Workflow tool の preflight と戻り値 unwrap は `_shared/workflow-calling.md` に従う。

```javascript
const raw = Workflow({
  name: 'op-survey',
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
- Workflow が例外を投げた → 「survey を取得できませんでした。通常フローで継続します」と伝えてフェーズ3 へ。
- findings が空 → 「survey は完了しましたが該当 finding はありませんでした」と伝えてフェーズ3 へ。
