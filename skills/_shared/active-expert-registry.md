# Active Expert Registry

OP runtime が spawn してよい active expert の正本。ここに無い expert は spawn しない
(planned は `planned-experts.md`、境界規則は `runtime-contract.md`)。
agent 名から skill ディレクトリ名を機械生成しない (対応は不規則)。本表と `agents/<name>.md` frontmatter `skills:` が
食い違ったら contract error として停止し、人間が修正する。

## Active Experts

| Agent | Agent file | Skill | Skill directory | Runtime apply | Issue post-check | Global review |
|---|---|---|---|---|---|---|
| `debug-expert` | `agents/debug-expert.md` | `expert-debug` | `skills/expert-debug/` | yes | no | no |
| `feature-expert` | `agents/feature-expert.md` | `expert-feature` | `skills/expert-feature/` | yes | no | no |
| `refactor-expert` | `agents/refactor-expert.md` | `expert-refactor` | `skills/expert-refactor/` | yes | no | no |
| `optimize-expert` | `agents/optimize-expert.md` | `expert-optimize` | `skills/expert-optimize/` | yes | no | no |
| `test-expert` | `agents/test-expert.md` | `expert-test` | `skills/expert-test/` | yes | no | no |
| `designer-expert` | `agents/designer-expert.md` | `expert-design` | `skills/expert-design/` | yes | no | no |
| `ux-ui-audit-expert` | `agents/ux-ui-audit-expert.md` | `expert-ux-ui-audit` | `skills/expert-ux-ui-audit/` | no | yes | no |
| `review-expert` | `agents/review-expert.md` | `expert-review` | `skills/expert-review/` | no | no | yes |
| `security-expert` | `agents/security-expert.md` | `expert-security` | `skills/expert-security/` | yes | yes | specialist |

- `Runtime apply`: op-run フェーズ2 の apply executor にできるか
- `Issue post-check`: op-run フェーズ3.5 の Issue 固有再監査を担当できるか
- `Global review`: op-run フェーズ4 の PR 全体監査。`specialist` = security specialist として参加
- `review-expert` は Global review 専任。`<!-- op-post-check-expert: review-expert -->` は禁止
- `refactor-expert` は Issue post-check を持たない (architecture debt は `op-fingerprint-bulk` で追跡)
- 表の名前は bare canonical 名 (routing / marker / fingerprint / `op run expert-resolve` 出力で使う)。
  Agent tool の `subagent_type` にだけ `op-skill:<name>` を渡す (`_shared/expert-spawn.md`「Plugin scoped-name 規約」)

## Utility Workers (registry 非追加 / spawn 非対象)

専用 OP skill の controller だけが `subagent_type` に直接渡して spawn する worker。
op-scan / op-patrol / op-run の routing・cluster 化の対象外。spawn 時は scoped 名 `op-skill:<name>`、marker 値は bare 名。

| Agent | Agent file | Skill | Skill directory | 呼び出し元 |
|---|---|---|---|---|
| scout | `agents/scout.md` | expert-scout | `skills/expert-scout/` | op-report |
| spec-expert | agents/spec-expert.md | expert-spec | skills/expert-spec/ | op-spec |

`op-run-expert: spec-expert` marker は op-run が spawn 前に `feature-expert` へ正規化する (op-run/SKILL.md 1-2-d)。

## 複雑度感度 (model selection summary)

mapping table / decision rule の正本は `_shared/model-selection.md` §5。

- **audit 感度** (op-scan / op-patrol): 区画 complexity (`single` / `typical` / `complex` / `critical`) の上昇で推論深さ要求が増えるか
- **apply 感度** (op-run): task_complexity (`routine` / `extension` / `design` / `integration` / `api-design`) の上昇で推論深さ要求が増えるか

| Expert | audit 感度 | apply 感度 | 補足 |
|---|---|---|---|
| debug-expert | 高 | 高 | 並行性 / spec 解釈 / 根本原因 |
| feature-expert | — | 高 | silent fork 統合 / API 設計 |
| refactor-expert | 高 | 高 | architecture debt / 責務境界 |
| optimize-expert | 高 | 高 | algorithm 改善 |
| test-expert | 低 | 中 | rubric 中心 (audit) / 設計戦略 (apply) |
| designer-expert | 高 | 高 | 全体調和 / 空間認識 — **Haiku 不可** |
| ux-ui-audit-expert | 高 | — | workflow 認知負荷 — **Haiku 不可** |
| review-expert | — | — | global review 専任。model は `model-selection.md` §5.1 / §7.1 |
| security-expert | 高 | 高 | 到達経路チェーン仮説 |

- audit 感度 = 高 の expert は `complex` / `critical` 区画で Opus を推奨
- apply 感度 = 高 の expert は `design` / `integration` / `api-design` で Opus を推奨
- 「—」は当該 phase で spawn されない
