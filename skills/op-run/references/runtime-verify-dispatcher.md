# Runtime Verify Dispatcher (実機検証の段)

実機検証 (runtime verify) の段の手順の正本。対象 repo のハーネス (`_shared/verify-harness.md`) で検証環境を起動し、
Utility Worker の verify-runner (`agents/verify-runner.md` / `expert-verify` skill) にブラウザ / アプリを実機で操作させ、
結果を確かめて記録する。根拠は ADR-0034。

本書の「controller」は次のどれかを指す。どの controller も 1〜5 章をそのまま使い、6 章は op-run だけが使う。

| controller | 段の位置 |
|---|---|
| op-run の ClusterOrchestrator (CO) | `cluster-orchestrator-directives.md` フェーズ5.7 (post-check の後、global review の前) |
| op-codev | verify フェーズ |
| op-verify | 本体 |

verify-runner がするのは実機操作と証跡の保存だけ (コード編集・commit・push・GitHub write・UX 監査をしない)。
spawn・Windows の貸し借り・probe・stop の引き取り・結果の判定・記録は controller が行う。
Level 5 (E2E / 実機) を apply で実施しない規約 (`_shared/project-profile.md`「Verification Ladder」) はそのままで、本段が apply とは別に実施する。

## 1. 起動条件

検証対象 checkout (op-run では apply worktree、`CHECKOUT=$WORKTREE_PATH`) のルートの `op-config.yaml` を Read し、
base からの diff (op-run では `git -C "$WORKTREE_PATH" diff --name-only "$OP_RUN_BASE_SHA...HEAD"`) が次のどちらかに当たれば段を実行する。

- `_shared/project-profile.md`「UI 影響判定 path パターン」(除外パスの優先・単語単独マッチの禁止・title / rationale での補完を含む)
- `verify_harness.windows_paths` (`_shared/op-config-schema.md` §14) の glob

どちらにも当たらなければ段を実行しない (spawn も記録もしない)。以下の `HARNESS_START` / `HARNESS_STOP` は `verify_harness.start` / `stop` の値。

| `verify_harness` | 動作 |
|---|---|
| 節が無い (ハーネス未導入) | spawn しない。`skipped` / `skip_reason: harness_not_installed` として 5 章で記録し、先へ進む (止めない) |
| 節がある | 1.1 → 1.2 |

### 1.1 Windows の貸し借り (Windows 判定に当たったときだけ)

Windows 判定は、diff が `verify_harness.windows_paths` に当たるか、`verify_harness.runtime` が `windows` のとき
(op-verify は加えて `--windows` の明示指定)。当たらなければ 1.1 を飛ばして 1.2 へ進む (4 章の release は holder ファイルが無ければ何もしない)。

verify-runner は Windows を借りない (`expert-verify` §1)。controller が段全体を
「lease (1.1) → try { spawn (1.2) → 2 章 → 3 章 } finally { 4 章: stop の引き取り → release }」の形で進める。
try の中でどの経路 (spawn 失敗・30 分応答なし・契約違反・再 spawn・`RV_LEASE_ABORT`) に抜けても、finally の 4 章は必ず通す。
待ちの上限は CLI の既定 (待たない) で、借りられなければ PR を止めずに `requires_runtime` として扱う (ADR-0035)。
借りた holder は 4 章の返却まで fence を跨ぐため、checkout の外のファイル (`RV_LEASE_FILE`) に書いて渡す (`_shared/bash-fence-convention.md` 不変則 1)。

lease を取る前に、前の段の holder ファイルが残っていないかを見る。残るのは 4 章の返却が失敗した (lease が残った) ときで、
Review Fix Loop で同じ checkout の段を再実行するとここに来る。期限内の lease は holder が同じでも busy になるため
(`decide_lease`)、ファイルを消して借り直すと自分の lease で `windows busy` になり、4 章も返さなくなる。
そのためファイルの holder で先に返し、exit 0 (返した / lease がもう無い) のときはファイルを消して借りる。
release が exit 1 で `details.result: not_holder` を返したときは、前の段の lease は TTL 切れで回収され、いまは他の holder が持っている。
返すものが無いので、同じくファイルを消して借りに進む (借りられなければ `windows busy`)。
同じ exit 1 の `unavailable` とは `.details.result` で分ける。

```bash
: "${CHECKOUT:?}" "${LEASE_HOLDER:?op-run は task_id}"
RV_LEASE_FILE="${XDG_CACHE_HOME:-$HOME/.cache}/op-verify-runner/$(basename "$CHECKOUT")/controller-lease-holder"
WINDOWS_ENDPOINT=""; WINDOWS_PROVISION_JSON=""; WINDOWS_REQUIRES_RUNTIME=""; RV_LEASE_ABORT=""; LEASE_EXIT=""
if [ -e "$RV_LEASE_FILE" ]; then
  PREV_HOLDER=$(cat "$RV_LEASE_FILE" 2>/dev/null) || PREV_HOLDER=""
  if [ -z "$PREV_HOLDER" ]; then
    RV_LEASE_ABORT="前の段の holder ファイル $RV_LEASE_FILE が空か読めないため、残った lease を返せない"
  else
    PREV_JSON=$(op verify windows release --holder "$PREV_HOLDER"); PREV_EXIT=$?
    PREV_RESULT=$(printf '%s' "$PREV_JSON" | jq -r '.details.result // empty' 2>/dev/null)
    if [ "$PREV_EXIT" -eq 0 ] || [ "$PREV_RESULT" = "not_holder" ]; then
      rm -f "$RV_LEASE_FILE"
    else
      RV_LEASE_ABORT="前の段の lease (holder $PREV_HOLDER) を返せなかった (release exit $PREV_EXIT, result ${PREV_RESULT:-unknown})"
    fi
  fi
fi
if [ -z "$RV_LEASE_ABORT" ]; then
  LEASE_JSON=$(op verify windows lease --holder "$LEASE_HOLDER"); LEASE_EXIT=$?
  case "$LEASE_EXIT" in
    0) WINDOWS_ENDPOINT=$(printf '%s' "$LEASE_JSON" | jq -r '.details.provision.relay.webdriver_url // empty')
       WINDOWS_PROVISION_JSON=$(printf '%s' "$LEASE_JSON" | jq -c '.details.provision // {}')
       [ -n "$WINDOWS_ENDPOINT" ] || WINDOWS_REQUIRES_RUNTIME="windows unavailable" ;;
    1) WINDOWS_REQUIRES_RUNTIME=$(printf '%s' "$LEASE_JSON" | jq -r '.details.requires_runtime // "windows unavailable"') ;;
    *) WINDOWS_REQUIRES_RUNTIME="windows unavailable" ;;
  esac
fi
case "$LEASE_EXIT" in
  0|2)
    if ! { mkdir -p "$(dirname "$RV_LEASE_FILE")" && printf '%s\n' "$LEASE_HOLDER" >"$RV_LEASE_FILE"; }; then
      op verify windows release --holder "$LEASE_HOLDER"; RELEASE_EXIT=$?
      if [ "$RELEASE_EXIT" -eq 0 ]; then
        rm -f "$RV_LEASE_FILE"   # 書きかけのファイルを次の段に残さない
        RV_LEASE_ABORT="lease holder を $RV_LEASE_FILE に書けなかったため lease を返した"
      else
        RV_LEASE_ABORT="lease holder を $RV_LEASE_FILE に書けず、lease も返せなかった (release exit $RELEASE_EXIT)。lease は TTL が切れるまで残り、op verify windows sweep か次の lease が回収する"
      fi
      WINDOWS_ENDPOINT=""; WINDOWS_PROVISION_JSON=""
    fi ;;
esac
export WINDOWS_ENDPOINT WINDOWS_PROVISION_JSON WINDOWS_REQUIRES_RUNTIME RV_LEASE_ABORT
```

`RV_LEASE_ABORT` が空でなければ、verify-runner を spawn せず、段を 5 章の「結果が得られない」(`skipped`、`skip_reason` なし) で記録し、
`RV_LEASE_ABORT` を人間に報告する (op-run は 6.3 の note と PR コメント)。`requires_runtime` としては扱わない。
`RV_LEASE_ABORT` になる経路は 3 つあり、lease と holder ファイルの残り方が違う。

| 経路 | lease | holder ファイル |
|---|---|---|
| 前の段の lease を返せなかった (release が非 0。`not_holder` を除く) | この段では借りていない。前の段の lease が残る | 残す (4 章が同じ holder で返し直す) |
| 前の段の holder ファイルが空か読めない | この段では借りていない。前の段の lease が残っている可能性がある | 残す (4 章の `:?` ガードで止まり、人間に報告する) |
| 借りた holder をファイルに書けなかった | その場で返した。返せなければ TTL が切れるまで残り、`op verify windows sweep` か次の lease が回収する | 返せたときは消す |

`requires_runtime` の語 (`windows busy` / `windows unavailable` / `windows not provisioned`) は言い換えずに verify-runner へ渡す。
返却は lease の成否にかかわらず 4 章の後始末で必ず行う。4 章は holder ファイルがあれば返し、無ければ何もしない
(`RV_LEASE_ABORT` で spawn しなかった段でも 4 章は通す。前の段の lease の返し直しはそこで行う)。
lease が exit 2 (エラー) で終わった段も holder ファイルを書き、4 章で返す。CLI は Sandbox を止められなかったとき lease を残す
(TTL 後に sweep が回収する) ため、4 章の release がもう一度 `wsb stop` を試みる。CLI が lease を消していれば release は
`not_leased` (exit 0) で終わる。exit 1 (busy / unavailable / not provisioned) は lease を取っていないのでファイルを書かない。

Sandbox 内で tauri-driver / msedgedriver と対象アプリを起動する手順は未配線のため、lease が exit 0 でも
`WINDOWS_ENDPOINT` の WebDriver は応答しない。verify-runner はその分を `requires_runtime` (`windows unavailable`、
`detail` に「Sandbox 内 WebDriver 起動が未配線」) で返し (`expert-verify` 3 章「Windows 実行先」)、2 章の正当な skip として扱う。PR は止めない。

### 1.2 verify-runner の spawn

`subagent_type: "op-skill:verify-runner"`。渡す値:

| 渡す値 | 内容 |
|---|---|
| model | `opus`。実機操作専任のため `fable` は使わない (cluster が Fable 承認済みでも波及させない) |
| checkout | 検証する worktree の絶対パス (op-run は apply worktree を再利用し、新規 worktree を作らない) |
| head_sha | checkout の HEAD (op-run は push 済みの PR head) |
| scenarios | Issue の成功条件と diff から controller が組む (画面・操作・期待結果、任意で `wait_for`)。組めなければ空にし、verify-runner の既定に任せる |
| windows_endpoint | 1.1 で借りたときの `WINDOWS_ENDPOINT` |
| windows の理由 | 1.1 で借りられなかったときの `WINDOWS_REQUIRES_RUNTIME` |
| windows_provision | 1.1 で借りたときの `WINDOWS_PROVISION_JSON` (lease の `details.provision`。key は `expert-verify` §1) |

```
invocation_mode: op_managed
【共通宣言】~/.claude/skills/_shared/spawn-prompt-common.md §1〜§4 を含める (§2 は exploration-only variant)。
作業対象のパスが決まったら、対応する .claude/rules/<feature>.md を Read ツールで開いてから着手すること (cat / grep では正本が読み込まれない)。
あなたは verify-runner です。手順と返却スキーマは expert-verify skill に従う。

- checkout: ${CHECKOUT}
- head_sha: ${HEAD_SHA} (checkout の HEAD と一致することを確かめてから始める)
- scenarios: ${SCENARIOS_JSON}
- windows_endpoint: ${WINDOWS_ENDPOINT:-なし}
- windows の理由: ${WINDOWS_REQUIRES_RUNTIME:-なし} (Windows の検証を requires_runtime にするときの reason)
- windows_provision: ${WINDOWS_PROVISION_JSON:-なし}

【完了条件】expert-verify §4 の JSON を返す。コード編集・commit・push・GitHub write をしない。
```

返却 JSON を `RUNNER_JSON` として保持し、2 章 → 3 章 → 4 章の順に処理する。
spawn 失敗・30 分応答なし・JSON 欠落は結果が得られなかったものとし、`skipped` (`skip_reason` なし) で記録して先へ進む (止めない)。

## 2. skip の扱い

`result: skipped` は `skip_reason` で扱いを分ける。

| `skip_reason` | 扱い |
|---|---|
| `harness_not_installed` | 正当な skip。そのまま記録する (1 章で spawn せずに記録した場合と同じ) |
| `requires_runtime` | 正当な skip (Windows を借りられなかった等)。`requires_runtime[]` ごと記録する |
| `all_means_failed` | 自己申告だけで受け入れない。2.1 の確認をする |

`requires_runtime[]` が空でない `pass` は、検証した範囲だけの pass として `pass_with_notes` で記録する。
これも正当な skip であり、2.1 の確認はしない。

> ADR-0034 決定5 は、controller が確認する対象を skipped と `requires_runtime` の両方としている。
> 本書は人間の合意 (#255) に従い、確認の対象を `all_means_failed` だけに絞る。
> `requires_runtime` (Windows の unavailable / busy / not provisioned) と `harness_not_installed` は、実行先やハーネスが無いことが
> CLI とハーネスの宣言で決まっているため、確認をしなくても正当な skip として扱う。

### 2.1 all_means_failed の確認 (契約違反の検出)

「ブラウザ / ランタイムが無い」と言えるのは `op verify probe` が失敗したときだけ (ADR-0034 決定5、`verify-harness.md` §4)。

1. 返却の形を確かめる。`probe` (出力パス) か `means_attempts[]` の各手段の `error` が欠けている、または `probe.exit == 0` なのに
   `all_means_failed` を返した場合は、契約違反の疑いとして報告に載せる。判定は 2 の probe の結果で行う
2. controller が自分で probe する。verify-runner は返る前に stop を済ませていることが多く、その start の JSON には届かない。
   そのため controller が checkout で start → probe → stop を 1 回行う。
   同じ checkout の verify-runner がすべて返った後に行う (stop がその run を止めてしまうため)。
   start の JSON と probe の出力は checkout の外に置く (checkout を汚すと op-run の `op apply verify-commit` gate で止まる)

   ```bash
   : "${CHECKOUT:?}" "${HARNESS_START:?verify_harness.start}" "${HARNESS_STOP:?verify_harness.stop}"
   RV_CTRL_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/op-verify-runner/$(basename "$CHECKOUT")/controller-$(date +%Y%m%d-%H%M%S)"
   mkdir -p "$RV_CTRL_DIR"
   (cd "$CHECKOUT" && bash -c "$HARNESS_START") >"$RV_CTRL_DIR/start.json" 2>"$RV_CTRL_DIR/start.stderr"; START_EXIT=$?
   PROBE_EXIT=""   # start が失敗したら probe を実行しないので空のまま (1 と取り違えない)
   if [ "$START_EXIT" -eq 0 ]; then
     op verify probe --start-json "$RV_CTRL_DIR/start.json" >"$RV_CTRL_DIR/probe.json" 2>"$RV_CTRL_DIR/probe.stderr"; PROBE_EXIT=$?
   fi
   (cd "$CHECKOUT" && bash -c "$HARNESS_STOP") >/dev/null 2>"$RV_CTRL_DIR/stop.stderr"; STOP_EXIT=$?
   export RV_CTRL_DIR START_EXIT PROBE_EXIT STOP_EXIT
   ```

   この stop は 4 章の引き取りを兼ねる (保留された run も止まる)。`STOP_EXIT` が非 0 なら 4 章と同じく報告に載せる。
3. 判定: 上の行から順に当て、最初に当たった行で動作する。

| 状況 | 動作 |
|---|---|
| `START_EXIT != 0` (controller の start が失敗し、probe を実行していない) | 確かめられなかった。正当な skip として扱わない。`skipped` / `all_means_failed` で記録し、start の stderr 末尾 (`$RV_CTRL_DIR/start.stderr`) を人間に報告する |
| `PROBE_EXIT == 0` (probe は通る = 契約違反) で、この段でまだ再 spawn していない | 同じ入力で verify-runner を 1 回だけ再 spawn する。prompt に「前回は all_means_failed を返したが controller の `op verify probe` は通った (出力: `$RV_CTRL_DIR/probe.json`)。expert-verify §3 の手段を順にすべて試すこと」を足す。返却は 2 章の頭から処理し直す |
| 再 spawn 後の返却も `all_means_failed` | probe をやり直さず、再 spawn もしない。`skipped` / `all_means_failed` で記録し、人間に報告する (op-run は 6.3 の note と PR コメント)。段は止めずに先へ進む |
| `PROBE_EXIT == 1` (start は成功し、probe が届かない) | ランタイムが無いことが確かめられた正当な skip。`skipped` / `all_means_failed` で記録し、probe の出力パスを報告に載せる |
| `PROBE_EXIT == 2` | 確かめられなかった。`skipped` / `all_means_failed` で記録し、人間に報告する |

再 spawn は 1 回の段につき 1 回まで (3 章の証跡欠落による再 spawn と合わせて 1 回)。Windows の lease は再 spawn の間も返さない。

## 3. 証跡の実在確認

`pass` / `pass_with_notes` は、証跡 (スクリーンショット) の実在を controller が確かめてから記録する (ADR-0034 決定5)。
証跡の欠落 (`MISSING`) を調べるのは verify-runner の `result: pass` のときだけ。`result: fail` のときは `EVIDENCE_PATHS_JSON` だけを使い、
証跡の欠落を理由に再 spawn しない。

```bash
: "${RUNNER_JSON:?}"
EVIDENCE_PATHS_JSON=$(printf '%s' "$RUNNER_JSON" | jq -r '.evidence_paths[]?' \
  | while IFS= read -r p; do [ -s "$p" ] && printf '%s\n' "$p"; done | jq -R . | jq -sc .)
MISSING=""
if [ "$(printf '%s' "$RUNNER_JSON" | jq -r '.result')" = "pass" ]; then
  MISSING=$(printf '%s' "$RUNNER_JSON" | jq -r '
    if ([.scenarios[]? | select(.result == "pass")] | length) == 0 then "NO_PASS_SCENARIO" else
    .scenarios[]? | select(.result == "pass")
    | [(.evidence // [])[] | select(test("\\.(png|jpe?g)$"; "i"))] as $shots
    | if ($shots | length) == 0 then "NO_SCREENSHOT:\(.name)" else $shots[] end end' \
    | while IFS= read -r p; do
        case "$p" in NO_*) echo "$p" ;; *) [ -s "$p" ] || echo "$p" ;; esac
      done)
fi
export MISSING EVIDENCE_PATHS_JSON
```

- `MISSING` が空でなければ (pass のシナリオが 0 本の pass を含む) pass として記録しない。2.1 の 3 と同じく 1 回だけ再 spawn し (prompt に欠けた証跡を書く)、
  それでも欠けていれば `skipped` (`skip_reason` なし) で記録して人間に報告する
- 記録する `evidence_paths` は実在を確かめたものだけ (`EVIDENCE_PATHS_JSON`)。fail の証跡もこの値を使う

## 4. 保留 stop の引き取り

`expert-verify`「保留した stop の引き取り (controller の責務)」の実装。

- `harness.stop_status: deferred` を返した verify-runner があれば、同じ checkout の verify-runner がすべて返った後
  (30 分応答が無く失敗扱いにした runner も返ったものとみなす)、worktree の削除や失敗隔離より前に、
  checkout を cwd にして `verify_harness.stop` を 1 回実行する。2.1 で controller が stop を実行した後に返った runner
  (2.1 の再 spawn など) に `deferred` が無ければ、重ねて実行しない
- 同じ checkout の verify-runner が 1 本でも動いている間は実行しない
- exit code と stderr の末尾を残す。非 0 はプロセスや state が残ったことを示すので報告に載せる (op-run は 6.3 の note と PR コメント)

```bash
: "${CHECKOUT:?}" "${HARNESS_STOP:?verify_harness.stop}"
STOP_ERR=$(mktemp)
(cd "$CHECKOUT" && bash -c "$HARNESS_STOP") >/dev/null 2>"$STOP_ERR"; STOP_EXIT=$?
STOP_STDERR_TAIL=$(tail -n 20 "$STOP_ERR"); rm -f "$STOP_ERR"
export STOP_EXIT STOP_STDERR_TAIL
```

1.1 で Windows を借りていれば、stop の引き取りの後に必ず返す (spawn 失敗・契約違反・エラーの経路でも返す)。
借りたかどうかと holder は 1.1 が書いた `RV_LEASE_FILE` で判断する (シェル変数の持ち越しに頼らない)。
1.1 が前の段の lease を返せずに `RV_LEASE_ABORT` で止まった段 (ファイルが残っている) と、lease が exit 2 で終わった段でも、同じ block で返す。
返せなければファイルを残し、次の段の 1.1 と 4 章が再び返しにいく (`not_holder` なら次の段の 1.1 がファイルを消す)。
holder が空のまま `--holder ""` で返すと他人の lease として拒否され、lease が TTL まで残って他の PR の Windows 検証が busy になる。
そのためファイルが空なら `:?` ガードで止め、ファイルを残したまま人間に報告する (1.1 も同じ場合は借りずに `RV_LEASE_ABORT` にする)。

```bash
: "${CHECKOUT:?}"
RV_LEASE_FILE="${XDG_CACHE_HOME:-$HOME/.cache}/op-verify-runner/$(basename "$CHECKOUT")/controller-lease-holder"
RELEASE_EXIT=""
if [ -f "$RV_LEASE_FILE" ]; then
  LEASE_HOLDER=$(cat "$RV_LEASE_FILE")
  : "${LEASE_HOLDER:?RV_LEASE_FILE が空。lease を返せないので人間に報告する}"
  op verify windows release --holder "$LEASE_HOLDER"; RELEASE_EXIT=$?   # 非 0 は lease が残る。報告に載せる
  [ "$RELEASE_EXIT" -ne 0 ] || rm -f "$RV_LEASE_FILE"
fi
export RELEASE_EXIT
```

## 5. state 記録

結果は次の値で 1 件に確定させる。記録先は op-run では PR body の op-review-state の `post_checks["verify-runner"]`
(書き方は 6.1)。他の controller も entry の shape はこの表に揃える。

| 状況 | `post_check_result` | 追加 field |
|---|---|---|
| 全シナリオ pass、`requires_runtime[]` 空、証跡あり | `pass` | `evidence_paths` |
| pass だが `requires_runtime[]` あり、証跡あり | `pass_with_notes` | `evidence_paths` / `requires_runtime` |
| シナリオの fail (`failed_stage: scenario`) | `block` | `evidence_paths` / `repro_steps` |
| ハーネスの起動失敗 (`failed_stage: harness_start`) | `needs_human_decision` | なし (start の stderr 末尾は報告に載せる) |
| skipped (2 章の判定後) | `skipped` | `skip_reason` / `requires_runtime` |
| 結果が得られない / 証跡欠落が残った | `skipped` | なし |

- 追加 field は表の行で決まり、表に無い field は verify-runner が返していても載せない (6.1 の jq はこの表に従う)
- `gaps[]` (ハーネスが自動でやらず手作業で補った工程) だけは表の外の規則で、結果にかかわらず (表で「なし」の行でも) 空でなければ載せる
- `repro_steps` は fail したシナリオの手順を `[<シナリオ名>] <手順>` の 1 行ずつにする
- ハーネスの起動失敗には再現手順が無いため Review Fix Loop に入れない。PR の変更が原因か環境が原因かを controller は決められないので、
  `needs_human_decision` で記録して先へ進み (止めない)、start の stderr 末尾を人間に報告する

## 6. op-run での結果の扱い (CO)

### 6.1 state push

post-check の state push (`post-check-dispatcher.md`「判定後処理テンプレ」) と同じ形。label は遷移しない (runtime verify 用の label は無い)。

```bash
: "${PR_NUMBER:?}" "${WORKTREE_PATH:?}" "${OP_RUN_SESSION_ID:?}" "${RESULT:?pass|pass_with_notes|block|needs_human_decision|skipped}"
: "${RUNTIME_VERIFY_ROUND:?この PR で段を実行した回数 (1 始まり。同じ段の中の再 spawn は数えない)}"
VERIFIED_HEAD_SHA=$(git -C "$WORKTREE_PATH" rev-parse HEAD)

jq -n --arg r "$RESULT" --arg sha "$VERIFIED_HEAD_SHA" --argjson round "$RUNTIME_VERIFY_ROUND" \
  --arg skip "${SKIP_REASON:-}" --argjson ev "${EVIDENCE_PATHS_JSON:-[]}" --argjson runner "${RUNNER_JSON:-{\}}" \
  '($r == "pass" or $r == "pass_with_notes" or $r == "block") as $with_ev
   | ($r == "pass_with_notes" or ($r == "skipped" and $skip != "")) as $with_rr
   | {kind:"post_check", expert:"verify-runner", post_check_expert:"verify-runner",
      post_check_result:$r, audit_result:($r|ascii_upcase),
      post_checked_head_sha:$sha, post_check_round:$round}
   + (if $skip == "" then {} else {skip_reason:$skip} end)
   + (if $with_ev and ($ev | length) > 0 then {evidence_paths:$ev} else {} end)
   + ([$runner.scenarios[]? | select(.result == "fail") | .name as $n | (.repro_steps // [])[] | "[\($n)] \(.)"] as $rp
      | if $r == "block" and ($rp | length) > 0 then {repro_steps:$rp} else {} end)
   + (($runner.requires_runtime // []) as $rr | if $with_rr and ($rr | length) > 0 then {requires_runtime:$rr} else {} end)
   + (($runner.gaps // []) as $g | if ($g | length) > 0 then {gaps:$g} else {} end)' \
  | op review state push --pr "$PR_NUMBER" --apply-json - \
      --write-id "${OP_RUN_SESSION_ID}-postcheck-verify-runner-r${RUNTIME_VERIFY_ROUND}" --session "$OP_RUN_SESSION_ID" \
      ${REVIEW_STATE_INPUT_JSON:+--input-json "$REVIEW_STATE_INPUT_JSON"}
```

spawn していない場合 (ハーネス未導入 / 結果が得られない) は `RUNNER_JSON` を空のままにする。
ハーネス未導入でもこの push は行う (`Manual: skipped` を機械で確かめられるようにする)。

### 6.2 判定後の進み方

| `post_check_result` | 動作 |
|---|---|
| `pass` / `pass_with_notes` / `skipped` / `needs_human_decision` | フェーズ6 (global review) へ進む。PR は止めない |
| `block` | review を呼ばず Review Fix Loop に入れる (下記) |

`block` のときは `review-fix-loop.md` 4.5-4 の手順 2 と 4 の経路で、cluster の apply expert (入力 `expert`) を同じ `apply_model` で再 spawn する。
handoff 本文は fail したシナリオの `name` / `expected` / `actual` / `repro_steps` / `evidence` (実在を確かめたパス)。
review attempt がまだ無ければ label 遷移はしない。Review Fix Loop の中で本段を再実行して `block` になった場合は、4.5-4 の手順 1 と 3 の label 遷移も行う。
push 後はフェーズ5.5 → 本段を再実行してから review へ進む。
block からの再実装は PR ごとに 2 回まで。3 回目の `block` は verdict `needs_human_decision`
(blocker_reason に要約、失敗シナリオの全文は PR コメント)。

### 6.3 PR 本文・PR コメント・ClusterSummary

- PR 本文 (フェーズ4 の PR 作成時): `_shared/pr-templates.md`「自動検証」表の既存の `Manual required` 行に書く。
  1 章の起動条件はこの時点で評価できる

  | 状況 | `Manual required` 行 |
  |---|---|
  | 起動条件に当たらない | apply 報告のとおり |
  | 当たる + ハーネス未導入 | `yes` / `Manual: skipped (ハーネス未導入)。/op-skill:op-verify --init でハーネスを導入すると runtime verify 段で実機検証される` |
  | 当たる + ハーネスあり | `yes` / `runtime verify 段 (verify-runner) で実施。結果は op-review-state の post_checks["verify-runner"]` |

- PR コメント (段を実行したとき 1 件、自然文、HTML marker を付けない): 結果、検証したシナリオ、証跡のパス、
  `requires_runtime` の範囲と理由、`gaps`、stop / release の非 0、`RV_LEASE_ABORT`、2.1 の確認結果
- ClusterSummary の `runtime_verify_note` (`cluster-orchestrator-directives.md` フェーズ8): 人間に伝えることがあるときだけ 1〜2 文。
  ハーネス未導入 (`/op-skill:op-verify --init` を案内) / `requires_runtime` で未検証の範囲 / `all_means_failed` を受け入れた経緯 /
  ハーネスの起動失敗 / stop・release の非 0 / `RV_LEASE_ABORT`。`pass` だけなら書かない
