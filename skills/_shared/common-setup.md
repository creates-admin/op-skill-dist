# 共通セットアップ手順

OP skill のフェーズ0 共通手順と、expert 共通の Explore 委譲の正本。

## フェーズ0 git/gh env check 標準手順

各 OP skill のフェーズ0 はこの節を 1 行で参照し、skill 固有 check (ADR フォルダ検出等) と
gh 未認証時・git リポジトリ外の skill 固有の扱いだけを自前で持つ。

```bash
git rev-parse --is-inside-work-tree || { echo "not a git repo"; exit 1; }

if [ "${OP_GITHUB_CHANNEL:-gh}" = "mcp" ]; then
  echo "[channel] mcp — GitHub write は call-spec 経路 (gh 認証不要)"
else
  gh auth status || { echo "gh login が必要"; exit 1; }
fi
```

- 既定: git リポジトリ外なら中断し、git リポジトリ内で実行するよう案内する。gh channel で未認証なら中断して `! gh auth login` を案内する。
  中断せず続行する skill (op-architect / op-plan / op-patrol `--dry-run` / op-cleanup Tier1 等) は各 SKILL.md に書く。
- mcp channel は call-spec 経路 (`github-channel.md`) で GitHub write が成立するため gh auth を要求しない。
- Workflow を呼ぶ skill は続けて capability preflight (`workflow-calling.md` §1)。workflow は `op-skill:<name>` で呼ぶ。

## Explore 委譲プロトコル

- Direct Mode: 広域探索が要るとき、expert は Explore subagent (read-only) への委譲を提案してよい。
- OP-managed Mode: Explore を呼ばず Grep / Read で進める。
- 委譲するのは素材集めだけ。判断 (severity / patch 提案 / detection rule) は委譲しない。
