# op-verify 通常モードの手順

1. checkout を決める。

   | 指定 | checkout |
   |---|---|
   | `--pr <N>` / `--branch <name>` | head を fetch し、`git worktree add --detach "$HOME/cwork/worktrees/<repo>/verify-<pr-N か branch>-<YYYYMMDD-HHMMSS>" <head SHA>` で作る (HEAD が head SHA と一致することを確かめる。fork PR は対象外) |
   | `--checkout <path>` | そのパス |
   | 省略 | 現在の checkout |

   checkout のルートの `op-config.yaml` の `verify_harness` を読む (dispatcher の起動条件の節と同じく検証対象 checkout の宣言で判定する)。
   無ければ `--init` を案内して終了する (作った worktree のパスは報告する)。

   `--pr` / `--branch` で作った worktree には依存が入っていないため、ハーネスを起動する前に checkout のルートで入れる。
   パッケージマネージャは lockfile で判定する (`~/.claude/skills/_shared/project-profile.md`「検証コマンド (スタック別)」):
   `pnpm-lock.yaml` → `pnpm install --frozen-lockfile` / `yarn.lock` → `yarn install --frozen-lockfile` / `package-lock.json` → `npm ci`。
   lockfile が無ければ入れない。失敗したら verify-runner を spawn せず、stderr の末尾を添えて `needs_human_decision` で報告する。
   `--checkout` と省略時は人間の checkout なので入れない。

2. scenarios を組む: `--scenario` があればそれ。無ければ PR 本文の `Fixes #N` の Issue の成功条件と diff から組み、人間に確認する。
   組めなければ空にする (verify-runner が diff の触れた画面の描画と主要操作だけを確かめる)。
3. dispatcher (`references/runtime-verify-dispatcher.md`) を使う。
   - 起動条件の節の diff 判定はしない (人間が明示して起動したため)。ハーネスの有無の扱いは手順 1 で済んでいる
   - Windows 判定: `--windows` があるか、checkout の `verify_harness.runtime` が `windows` か、
     `git -C <checkout> diff --name-only <BASE_SHA>...HEAD` が `verify_harness.windows_paths` に当たれば当たりとする
   - 当たれば段全体を「lease → try { 検証 } finally { release }」の形で進める。手順と fence は同 dispatcher 1.1 と 4 章が正本で、ここでは書き直さない
     1. lease: 同 dispatcher 1.1 を `CHECKOUT=<checkout>`、`LEASE_HOLDER=opverify-<YYYYMMDD-HHMMSS>` (手順 4 の session と同じ値) で実行する
     2. try: `RV_LEASE_ABORT` が空なら verify-runner を spawn し、返却を下の順に処理する。空でなければ spawn せず、同 dispatcher 1.1 のとおり「結果が得られない」で記録して `RV_LEASE_ABORT` を報告に載せる
     3. finally: try がどの経路で終わっても、同 dispatcher 4 章 (保留 stop の引き取り → Windows の返却) を実行する。release の非 0 は報告に載せる
   - Windows 用 exe の build と lease のオプションは、checkout の `verify_harness.windows` の宣言から同 dispatcher 1.1 が組む。Windows 側の失敗は `requires_runtime` の正当な skip として扱う
   - 当たらなければ lease を取らず、windows_endpoint も windows の理由も渡さない
   - verify-runner の spawn は同 dispatcher の spawn の節どおり (`subagent_type: "op-skill:verify-runner"`、model `opus`、Fable は使わない。windows_endpoint / windows_capabilities / windows の理由 / windows_provision も同節の表どおり)
   - 返却は同 dispatcher の skip の扱いの節 → 証跡の実在確認の節 → 保留 stop の引き取りの節の順に処理する
   - 結果の値は同 dispatcher の state 記録の節の表で 1 件に確定させる
4. 記録: `--pr` なら、同 dispatcher 6 章の state push で PR の op-review-state に push する
   (session は `opverify-<YYYYMMDD-HHMMSS>`。label は遷移しない)。それ以外は完了報告だけに載せる。
5. 1 で作った worktree は残す (証跡が checkout 内に置かれうるため)。パスを報告し、片付けは人間 (`git worktree remove`) に任せる。
