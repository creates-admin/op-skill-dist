# Active Expert Registry

OP runtime が spawn してよい active expert の正本。ここに無い expert は spawn しない
(planned は `planned-experts.md`、境界規則は `runtime-contract.md`)。
agent 名から skill ディレクトリ名を機械生成しない (対応は不規則)。本表と `agents/<name>.md` frontmatter `skills:` の整合は
`op core registry-verify` が検査する。食い違ったら contract error として停止し、人間が修正する。

## Active Experts

| Agent | Skill directory | Runtime apply | Issue post-check | Global review |
|---|---|---|---|---|
| `debug-expert` | `skills/expert-debug/` | yes | no | no |
| `feature-expert` | `skills/expert-feature/` | yes | no | no |
| `refactor-expert` | `skills/expert-refactor/` | yes | no | no |
| `optimize-expert` | `skills/expert-optimize/` | yes | no | no |
| `test-expert` | `skills/expert-test/` | yes | no | no |
| `designer-expert` | `skills/expert-design/` | yes | no | no |
| `ux-ui-audit-expert` | `skills/expert-ux-ui-audit/` | no | yes | no |
| `review-expert` | `skills/expert-review/` | no | no | yes |
| `security-expert` | `skills/expert-security/` | yes | yes | specialist |

- `Runtime apply`: op-run フェーズ2 の apply executor にできるか。agent file は `agents/<Agent>.md`
- `Issue post-check`: op-run フェーズ3.5 の Issue 固有再監査を担当できるか
- `Global review`: op-run フェーズ4 の PR 全体監査。`specialist` = security specialist として参加
- `review-expert` は Global review 専任。`<!-- op-post-check-expert: review-expert -->` は禁止
- `refactor-expert` は Issue post-check を持たない (architecture debt は `op-fingerprint-bulk` で追跡)
- 表の名前は bare canonical 名 (routing / marker / fingerprint / `op run expert-resolve` 出力で使う)。
  Agent tool の `subagent_type` にだけ `op-skill:<name>` を渡す (`_shared/expert-spawn.md`「Plugin scoped-name 規約」)
- model の選び方は `_shared/model-selection.md` §5

## Utility Workers (registry 非追加 / spawn 非対象)

専用 OP skill の controller だけが `subagent_type` に直接渡して spawn する worker。
op-scan / op-patrol / op-run の routing・cluster 化の対象外。spawn 時は scoped 名 `op-skill:<name>`、marker 値は bare 名。

| Agent | Skill directory | 呼び出し元 |
|---|---|---|
| `scout` | `skills/expert-scout/` | op-report |
| `spec-expert` | `skills/expert-spec/` | op-spec / op-spec-patrol |
| `verify-runner` | `skills/expert-verify/` | op-run (CO の runtime verify 段) / op-codev (verify フェーズ) / op-verify |

`op-run-expert: spec-expert` marker は `op run expert-resolve` が `feature-expert` へ正規化する。
