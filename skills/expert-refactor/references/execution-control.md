# Refactor Execution Control 節 (Issue 本文)

domain=refactor の Issue 本文に、`_shared/issue-templates.md` の「既知の落とし穴 / 注意点」の後に書く節。意味と実行ルールは expert-refactor skill の「Refactor Execution Control」。

```markdown
## 🧱 Refactor Execution Control (domain=refactor 専用)

- finding_type: <immediate_refactor | staged_refactor | architecture_debt | needs_spec_decision>
- execution_mode: <direct_apply | staged_refactor | needs_human_decision>
- direct_apply_safe: <true | false>
- safe_first_step: <この Issue で実行してよい最初の一手 (1〜2 文)>
- proposed_stages:
  1. <stage 1>
  2. <stage 2>
- forbidden_stage_actions:
  - safe_first_step 以外の stage を本 PR 内で実行しない
  - public API / serialized format / DB schema / migration / IPC contract を変更しない
  - Tauri command name / event name / permission name / 実値 (path / key / status / error code / env var) を変更しない
  - file location を移動しない (移動が必要な stage は別 PR)
  - bug fix / performance optimization / feature 実装を混ぜない
- blocking: <true | false>
- blocking_reason: <blocking=true の場合のみ、false なら null>
- recommended_followup_experts:
  - <follow-up が必要な expert がある場合のみ>
- affected_paths (architecture_debt / staged_refactor / needs_spec_decision で必須):
  - <path glob 1>
- architecture_debt メタ (finding_type=architecture_debt の場合のみ):
  - first_detected_at: <YYYY-MM-DD>
  - last_seen_at: <YYYY-MM-DD>
  - seen_count: <整数>
  - risk_trend: <stable | worsening | spreading>
- needs_human_decision: <`required: true` の場合のみ `_shared/invocation-mode.md` の schema で block 全体を埋める。不要なら省略>
- human_decision_points:
  - <判断が必要な決定点 1>
```
