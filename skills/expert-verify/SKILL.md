---
name: expert-verify
description: verify-runner に preload される方法論。ハーネスの起動 / 停止・操作手段の順序・skip の条件・返却スキーマ。
---

# expert-verify: verify-runner agent の知識ベース

controller から渡された checkout と検証シナリオを、対象 repo のハーネスで実機検証して結果・証跡・gap を返す手順。
ハーネスの契約 (コマンド・start の JSON・並列安全) は `~/.claude/skills/_shared/verify-harness.md`、宣言は
`~/.claude/skills/_shared/op-config-schema.md` §14 `verify_harness`。

## 1. 入力

spawn prompt から受け取る。

| 項目 | 内容 |
|---|---|
| checkout | 検証する worktree の絶対パス。ハーネスのコマンドはここを cwd にして実行する |
| scenarios | 確かめること (画面・操作・期待結果)。Issue の成功条件や diff から controller が組む。描画完了の目印にする要素 (`wait_for`、CSS セレクタ) を任意で持てる |
| windows_endpoint | 任意。Windows 実行先の WebDriver endpoint (貸し借りは呼び出し元が行う) |

scenarios が無ければ、diff が触れた画面を開いて描画と主要操作が通るかだけを確かめる。網羅的な探索はしない。

## 2. 手順

1. `op-config.yaml` の `verify_harness` を読む。節が無ければ何も起動せず `result: skipped` / `skip_reason: harness_not_installed` で返す
2. start を実行し、stdout の 1 行 JSON を保存する。start が非 0 なら stderr の末尾を添えて `result: fail` (`failed_stage: harness_start`) で返す
3. 2.1 の規則で証跡ディレクトリを決めて作る。スクリーンショット・ログ・一時スクリプト・start の JSON はすべてここに置く
4. `op verify probe` に start の JSON を渡して実行し、出力を証跡ディレクトリに保存する (引数は `op verify probe --help`)
5. 3 章の順で操作手段を選び、scenarios を 1 本ずつ実行する。各シナリオで最低 1 枚スクリーンショットを撮り、コンソールエラーを記録する
6. 成否にかかわらず、証跡ディレクトリに空ファイル `finished` を作ってから、2.2 の規則で stop を実行するか保留する。残ったプロセスを自分で kill しない
7. 4 章のスキーマで返す

- 自分の `run_id` の state・auth・証跡だけを使う。他の run の state は 2.2 の生死確認のために読むだけで、書き換え・削除・停止はしない
- ポート探し・Cookie の手注入・ブラウザのバージョン違いの吸収など、ハーネスが自動でやらず手作業で補った箇所はすべて `gaps` に書く

### 2.1 証跡ディレクトリ

ハーネスの生成物 (`pid_file` / `auth_state` のあるディレクトリ) の中には置かない。stop の後始末で消えうるため。
証跡ディレクトリは `<証跡ルート>/<run_id>/` で、証跡ルートは次の 1 か 2 で決まる。

1. `<checkout>/.verify-runner/<run_id>/` を作り、`git -C <checkout> check-ignore -q <そのディレクトリ>` が成功すること、
   かつ `pid_file` / `auth_state` のディレクトリの配下でないことを確かめる
2. どちらかを満たさなければ作ったディレクトリを消し、checkout の外の
   `${XDG_CACHE_HOME:-$HOME/.cache}/op-verify-runner/<checkout のディレクトリ名>/<run_id>/` に置く。
   ignore させるために `.gitignore` や `.git/info/exclude` を書き換えない。
   `gaps` に `{"step": "証跡の置き場", "manual_workaround": "checkout の外に置いた", "suggestion": ".verify-runner/ を gitignore に足す"}` を書く

### 2.2 stop の実行と保留

契約の stop は `run_id` を取らず、この checkout で start した全 run を止める (`verify-harness.md` §1)。
他の run が動いている間に実行するとその run を止めてしまうため、次の順で判断する。
判断の前に自分の `finished` を作っておく (2 章の手順 6)。同時に終わった run 同士が互いを「動いている」と数えて両方とも保留するのを防ぐため。

1. 自分の `pid_file` と同じディレクトリにある JSON のうち、pid_file の書式 (`runId` / `startedAt` / `pids`) を満たし
   `runId` が自分と違うものを他の run の state とみなす。次のどちらかに当たる run は数えず、残りを「動いている run」とする
   - 終了した run: 証跡ルートの候補 (`<checkout>/.verify-runner` と `${XDG_CACHE_HOME:-$HOME/.cache}/op-verify-runner/<checkout のディレクトリ名>`) の
     どちらかに `<runId>/finished` がある。stop を保留して終わった run もこれに当たる
   - 途中で落ちた run の残骸: `pids[].pid` がすべて死んでいる。この state は次に stop を実行した run か controller の stop が消す

   ```bash
   co="<checkout>"; own="<start の pid_file>"; me=$(jq -r '.runId' "$own")
   roots=("$co/.verify-runner" "${XDG_CACHE_HOME:-$HOME/.cache}/op-verify-runner/$(basename "$co")")
   for f in "$(dirname "$own")"/*.json; do
     [ "$f" = "$own" ] && continue
     id=$(jq -er 'select(.runId and .startedAt and (.pids | type == "array")) | .runId' "$f" 2>/dev/null) || continue
     [ "$id" = "$me" ] && continue
     [ -e "${roots[0]}/$id/finished" ] || [ -e "${roots[1]}/$id/finished" ] && continue
     for p in $(jq -r '.pids[].pid' "$f"); do
       if kill -0 "$p" 2>/dev/null; then echo "$id"; break; fi
     done
   done
   ```

2. 動いている run が無ければ stop を実行し、exit code と stderr の末尾を記録する (`harness.stop_status: done`)。
   終了した run と残骸もこの stop で止まる
3. 動いている run があれば stop を実行しない (`harness.stop_status: deferred`、`harness.other_live_runs` にその `runId`)。
   自分の run のプロセスと state はそのまま残る。自分は `finished` を作ってあるので、後続の run の判断では数えられず、
   後で stop を実行した run か、4 章の返却契約に従う controller の stop で止まる。
   `gaps` に `{"step": "stop", "manual_workaround": "他の run が動いていたため stop を保留した", "suggestion": "stop に run_id 指定を足す"}` を書く

`finished` が見つからず PID が生きている run は、動いている run と区別できないので数える (保留側に倒す)。次の場合がこれに当たる。

- その run の証跡ルートが自分から見えない (`XDG_CACHE_HOME` / `HOME` が自分と違う環境で動いた run の checkout 外ルートなど)
- verify-runner が途中で落ち、ハーネスのプロセスだけが残った run

どちらも自分の stop は保留になり、controller の stop で止まる。

この判断は「他の run の pid_file も自分の pid_file と同じディレクトリに置かれる」ことを前提にする。契約はこの配置を定めていないため、
返却の `assumptions` にこの前提を書く。確認してから stop を実行するまでの間に始まった run は検出できない。

## 3. 操作手段の順序

`driver: playwright` では次の順に試し、動いた手段で続ける。手段ごとの結果は `means_attempts` に残す。

| 順 | 手段 | 失敗とみなす条件 |
|---|---|---|
| 1 | Playwright MCP (ToolSearch で `playwright` を検索して読み込む) | ツールが無い / ブラウザを起動できない / target に届かない |
| 2 | Playwright ライブラリのスクリプト (`browser.executable_path` を executablePath に指定) | ライブラリを用意できない / 起動・到達に失敗 |
| 3 | WebDriver (`browser.endpoint`、または `windows_endpoint`) | endpoint が無い / セッションを作れない |

- `driver: webdriver` (Tauri など) では 1・2 を `not_applicable` と記録し、3 から始める
- MCP のブラウザが `auth_state` を読めないときは、手段 1 で粘らず手段 2 に進む
- 手段が起動してページに届いたあとで期待の要素が現れない (待ちの時間切れ) のはシナリオの fail であり、手段の失敗ではない。
  次の手段へ進まず、その時点のスクリーンショットを `evidence` に入れて fail にする (手段 2 では exit 2)
- 操作手段の不調を理由に skipped を返せるのは全手段が失敗したときだけ (`skip_reason: all_means_failed`)。そのときは `probe` の出力と各手段のエラーを verbatim で添える。
  `harness_not_installed` / `requires_runtime` の skipped はこの条件の対象外
- Windows 実行先が要るのに `windows_endpoint` が無ければ、その分は検証せず `requires_runtime` に 1 要素ずつ書く。
  `reason` は ADR-0035 の語 (`windows unavailable` / `windows busy`) で、spawn prompt が理由を示していればそれ、無ければ `windows unavailable`

### 手段 2: Playwright ライブラリ

ライブラリは checkout の依存から解決する。無ければ証跡ディレクトリに `npm install --prefix <証跡ディレクトリ>/pw playwright-core` で入れ
(ブラウザはダウンロードされない)、`PW_FALLBACK_DIR` にそのパスを渡す。どちらにしたかを `gaps` に書く。

```js
// <証跡ディレクトリ>/shot.cjs  (cwd = checkout)
// 使い方: node shot.cjs <start.json> <target 名> <パス> <出力 png> [wait_for のセレクタ]
// exit 0: 撮影できた / exit 2: 要素待ちの時間切れ (撮影と JSON 出力は済み) / それ以外の非 0: 手段の失敗
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const [startJson, target, urlPath, out, waitFor] = process.argv.slice(2);
const start = JSON.parse(fs.readFileSync(startJson, 'utf8'));

function loadPlaywright() {
  const roots = [process.cwd(), process.env.PW_FALLBACK_DIR].filter(Boolean);
  for (const root of roots) {
    for (const name of ['playwright', 'playwright-core', '@playwright/test']) {
      try { return createRequire(path.join(root, 'package.json'))(name); } catch {}
    }
  }
  throw new Error('playwright library not found');
}

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ executablePath: start.browser.executable_path });
  const context = await browser.newContext(start.auth_state ? { storageState: start.auth_state } : {});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const res = await page.goto(new URL(urlPath, start.targets[target]).href, { waitUntil: 'load' });
  let waitTimeout = null;
  try {
    await page.locator(waitFor || 'body').first().waitFor({ state: waitFor ? 'visible' : 'attached' });
  } catch (e) {
    if (e.name !== 'TimeoutError') throw e;
    waitTimeout = e.message.split('\n')[0];
  }
  await page.screenshot({ path: out, fullPage: true });
  console.log(JSON.stringify({ status: res && res.status(), url: page.url(), errors, wait_timeout: waitTimeout }));
  await browser.close();
  process.exitCode = waitTimeout ? 2 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
```

SSE や常時ポーリングのあるページは network が静まらないため、`networkidle` を待たない。描画完了は `load` と、
シナリオの `wait_for` があればその要素の表示、無ければ `body` の存在で判定する。

exit 2 は要素待ちの時間切れで、スクリーンショットと stdout の JSON (`wait_timeout` に時間切れの内容、`errors` にコンソールエラー) は出ている。
シナリオの fail として扱い (`actual` に `wait_timeout`、`evidence` にそのスクリーンショット)、手段 3 へは進まない。
exit 1 などそれ以外の非 0 は手段 2 の失敗として `means_attempts` に stderr を verbatim で残し、手段 3 へ進む。
クリックや入力が要るシナリオは、このスクリプトの要素待ちと `screenshot` の間に操作を足した別ファイルを証跡ディレクトリに作る。exit code の意味は変えない。

### 手段 3: WebDriver

capabilities はハーネスか spawn prompt の指定に従う (Tauri は `tauri:options.application`)。

途中の失敗で空の png を証跡にしないよう、subshell 内で pipefail を有効にし、画像は一時ファイルに書いて中身があるときだけ置き換える。

```bash
(
  set -euo pipefail
  EP="<browser.endpoint>"
  OUT="<証跡ディレクトリ>/<シナリオ名>.png"
  SID=$(curl -sf -X POST "$EP/session" -H 'Content-Type: application/json' \
    -d '{"capabilities":{"alwaysMatch":{}}}' | jq -er '.value.sessionId // empty')
  : "${SID:?WebDriver session を作れなかった}"
  trap 'rm -f "$OUT.part"; curl -sf -o /dev/null -X DELETE "$EP/session/$SID" || true' EXIT
  curl -sf -o /dev/null -X POST "$EP/session/$SID/url" -H 'Content-Type: application/json' -d '{"url":"<target URL>"}'
  curl -sf "$EP/session/$SID/screenshot" | jq -er '.value // empty' | base64 -d > "$OUT.part"
  test -s "$OUT.part"
  mv "$OUT.part" "$OUT"
)
```

非 0 で終わったら手段 3 の失敗として `means_attempts` に stderr を verbatim で残す。

## 4. 返却スキーマ (JSON)

controller への要約テキストは 1 行。詳細は JSON に入れる。パスはすべて絶対パス。

```json
{
  "result": "pass | fail | skipped",
  "skip_reason": "harness_not_installed | all_means_failed | requires_runtime",
  "failed_stage": "harness_start | scenario",
  "summary": "1〜2 文の要約",
  "harness": {
    "run_id": "...", "checkout": "/abs/checkout", "start_json": "/abs/.../start.json",
    "stop_status": "done | deferred", "stop_exit": 0, "stop_stderr_tail": "", "other_live_runs": ["<runId>"]
  },
  "scenarios": [
    {
      "name": "...",
      "result": "pass | fail",
      "means": "playwright_mcp | playwright_library | webdriver",
      "expected": "期待した結果",
      "actual": "観測した結果",
      "evidence": ["/abs/.../scenario.png"],
      "repro_steps": ["1. <target URL> を開く", "2. ... をクリック", "3. 期待: ... / 実際: ..."]
    }
  ],
  "evidence_paths": ["/abs/.../scenario.png", "/abs/.../probe.json"],
  "requires_runtime": [{ "scope": "検証しなかったシナリオ名", "reason": "windows unavailable | windows busy" }],
  "means_attempts": [{ "means": "playwright_mcp", "status": "ok | failed | not_applicable", "error": "verbatim" }],
  "probe": { "exit": 0, "output_path": "/abs/.../probe.json" },
  "gaps": [{ "step": "手作業が要った工程", "manual_workaround": "やったこと", "suggestion": "ハーネスに足すと良いこと" }],
  "assumptions": [],
  "needs_human_decision": { "required": true, "...": "schema は invocation-mode.md" }
}
```

| フィールド | 必須条件 |
|---|---|
| `result` / `summary` / `means_attempts` / `gaps` | 常時 (`gaps` は無ければ空配列) |
| `skip_reason` | `skipped` 時 |
| `failed_stage` | `fail` 時 |
| `harness` | start を実行した時。`stop_exit` / `stop_stderr_tail` は `stop_status: done`、`other_live_runs` は `deferred` の時。`deferred` を受けた controller は下の「保留した stop の引き取り」に従う |
| `requires_runtime` | 常時 (無ければ空配列)。検証しなかった範囲ごとに 1 要素 |
| `scenarios` / `evidence_paths` | `pass` / `fail` 時。`pass` のシナリオは `evidence` にスクリーンショットを 1 枚以上 |
| `repro_steps` | `fail` のシナリオ |
| `probe` | start が成功した時 (`all_means_failed` では必須) |
| `assumptions` | 常時 (無ければ空配列)。2.2 で stop を判断した時は同節の前提を含める |
| `needs_human_decision` | 判断不能時 (正規スキーマは `~/.claude/skills/_shared/invocation-mode.md`) |

`result` は実行したシナリオだけで決める。全シナリオが pass なら `pass`、1 本でも fail なら `fail`。
実行できたシナリオが 0 本で、検証しなかった範囲がすべて `requires_runtime` に載っているときは `skipped` (`skip_reason: requires_runtime`)。

`requires_runtime` は `result` と併存する。空でない `requires_runtime` を持つ `pass` は検証した範囲だけの pass であり、全体の pass ではない。
controller はこれを ADR-0034 決定 5 の `requires_runtime` として受け取る (その後の扱いは controller 側の手順)。

### 保留した stop の引き取り (controller の責務)

`harness.stop_status: deferred` の返却を受けた controller は、その `harness.checkout` について次を行う。

| 項目 | 内容 |
|---|---|
| いつ | その checkout に spawn した verify-runner がすべて返ったあと。worktree の削除や失敗隔離より前 |
| 何を | checkout を cwd にして `verify_harness.stop` を 1 回実行する。保留した run・`finished` の無い run・残骸をまとめて止める |
| 記録 | exit code と stderr の末尾。非 0 はプロセスや state が残ったことを示すので、controller の報告に載せる |

同じ checkout の verify-runner が 1 本でも動いている間は、この stop を実行しない。
