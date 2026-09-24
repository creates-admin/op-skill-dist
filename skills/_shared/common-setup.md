# 共通セットアップ手順

OP skill のフェーズ0 共通手順と、expert 共通の Explore 委譲 / Invocation Mode 挙動の正本。
プロジェクトの CLAUDE.md の規約は本手順・各 skill の改善提案より優先する。

---

## フェーズ0 git/gh env check 標準手順

各 OP skill のフェーズ0 はこの節を 1 行で参照し、skill 固有 check (ADR フォルダ検出等) だけを自前で持つ。

### 基本 check (全 OP skill 共通)

```bash
git rev-parse --is-inside-work-tree || { echo "not a git repo"; exit 1; }

if [ "${OP_GITHUB_CHANNEL:-gh}" = "mcp" ]; then
  echo "[channel] mcp — GitHub write は call-spec 経路 (gh 認証不要)"
else
  gh auth status || { echo "gh login が必要"; exit 1; }
fi
```

- git リポジトリ外なら全 OP skill は中断し、git リポジトリ内で実行するよう案内する。
- gh auth check は gh channel (`OP_GITHUB_CHANNEL` 未設定含む) のみ。mcp channel は call-spec 経路
  (`github-channel.md`) で GitHub write が成立するため gh auth を要求せず、`gh auth login` 案内もしない。
- Workflow を呼ぶ skill は続けて Workflow tool の capability preflight を行う。利用不可なら即停止し、
  旧機構へフォールバックしない (手順・復旧案内は `workflow-calling.md` §1)。workflow を呼ばないモードでは skip してよい。

### gh auth なし時の OP skill 別挙動差分表

gh channel で未認証の場合の挙動。差分は意図的であり統一しない (mcp channel では適用外)。

| OP skill | gh auth なし時の挙動 | 備考 |
|----------|---------------------|------|
| **op-scan** | `exit 1` (中断)。`! gh auth login` を案内 | Issue 起票に gh 必須 |
| **op-patrol** | 通常実行は `exit 1`。**`--dry-run` 時は続行可能 (暫定 plan モード)** | Ledger 未参照で巡回 audit を継続する。詳細は `op-patrol/SKILL.md`「gh auth なしの場合」 |
| **op-run** | `exit 1` (中断) | worktree / PR 作成に gh 必須 |
| **op-merge** | `exit 1` (中断) | PR マージに gh 必須 |
| **op-architect** | 中断せず通知。「Issue 起票時に認証が必要」と案内し `--adr-only` / `--issue-md` を提案 | ADR 化のみなら gh 不要 |
| **op-plan** | 中断せず案内。`--dry-run` で起票なしの計画立てのみ続行を提案 | |

op-patrol の `--dry-run` 続行可を変更する場合は `needs_human_decision` で人間判断を仰ぐ。

---

## Explore 委譲プロトコル

探索クエリ数で Explore subagent (read-only / 並列可) への委譲を判断する。

### 委譲基準

| クエリ数 | breadth | 推奨手段 |
|---------|---------|---------|
| 1-2 件 | (Explore 不要) | Bash grep / Read 直叩き |
| 3-5 件 | quick / medium | Explore 1 体で複数 query bundle |
| 6 件以上 | very thorough | Explore 並列 spawn (独立観点ごと) |

委譲するのは素材集めだけ。判断 (severity / patch 提案 / detection rule) は commander または委譲先 expert が main context で行う。

### Direct Mode と OP-managed Mode の挙動

- **Direct Mode**: expert は「Explore に委譲しますか?」を提案してよい。
- **OP-managed Mode**: spawn prompt に `explore_budget: <int>` があればその範囲内で Explore を呼ぶ。無ければ Explore を呼ばず直 grep で進める。質問では返さない。

### フォールバック

commander が `OP_EXPLORE_DISABLED=1` を設定した場合、medium / very thorough でも Explore を使わず Bash grep + Read で代替する。

---

## Invocation Mode Overrides

「ユーザー確認」を伴う操作 (未コミット変更の安全策、外部ツールのインストール) は呼び出し文脈で切り替える。詳細は `invocation-mode.md`。

### Direct Mode (人間が直接起動)

- 未コミット変更がある場合、安全策 (新ブランチ / stash / そのまま) をユーザーに確認してよい。
- 外部ツール (lint / profiler / scanner 等) が未導入なら、インストール許可をユーザーに確認してよい。拒否されたら Grep/Read で続行する。

### OP-managed Mode (op-* skill が spawn する subagent)

- 未コミット変更や危険な git 状態を検出したら `blocked` または `needs_human_decision` で返し、安全策の選択肢を `options[]` に列挙する。
- ツールを勝手にインストールしない。Grep/Read fallback で続行し、それも不能なら `verification_not_run` または `blocked` で理由を返す。
- 「ユーザーに確認してください」と質問テキストで返さない。

`needs_human_decision` をユーザー prompt / Issue コメント / label に変換するのは commander / OP skill の責務。
