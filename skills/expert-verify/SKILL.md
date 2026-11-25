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
| windows_endpoint | 任意。Windows 実行先 (Windows Sandbox) の WebDriver endpoint。controller が借りた lease の中継 URL (`details.provision.relay.webdriver_url`) |
| windows_capabilities | 任意。windows_endpoint で New Session に渡す capabilities (`capabilities.alwaysMatch` の中身。lease の `details.provision.driver.capabilities`) |
| windows の理由 | 任意。controller が Windows を借りられなかったときの reason (`windows unavailable` / `windows busy` / `windows not provisioned`) と detail |
| windows_provision | 任意。lease の `details.provision` の JSON。中身は `references/windows-target.md`「windows_provision の中身」 |

scenarios が無ければ、diff が触れた画面を開いて描画と主要操作が通るかだけを確かめる。網羅的な探索はしない。

windows_endpoint か windows の理由が渡されたら、controller が Windows での検証が要ると判定したことを示す (3 章「Windows 実行先」)。
Windows の貸し借りは controller が「lease → try { verify-runner の検証 } finally { release }」の形で持つ
(`skills/op-run/references/runtime-verify-dispatcher.md` 1.1 と 4 章)。verify-runner は lease も release もしない。

## 2. 手順

1. `op-config.yaml` の `verify_harness` を読む。節が無ければ何も起動せず `result: skipped` / `skip_reason: harness_not_installed` で返す。
   `runtime: windows` なら手順 2・4・6 (この checkout での start / probe / stop) を実行せず、全シナリオを 3 章「Windows 実行先」で扱う
   (Windows 分は controller が借りた Sandbox の WebDriver で検証する)。証跡ディレクトリの `<run_id>` には `windows-<YYYYMMDD-HHMMSS>` を使う
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

   確かめ方は `references/live-runs-check.md` を読む。

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
| 3 | WebDriver (`browser.endpoint`。Windows 実行先では `windows_endpoint`) | endpoint が無い / セッションを作れない |

- `driver: webdriver` (Tauri など) では 1・2 を `not_applicable` と記録し、3 から始める
- MCP のブラウザが `auth_state` を読めないときは、手段 1 で粘らず手段 2 に進む
- 手段が起動してページに届いたあとで期待の要素が現れない (待ちの時間切れ) のはシナリオの fail であり、手段の失敗ではない。
  次の手段へ進まず、その時点のスクリーンショットを `evidence` に入れて fail にする (手段 2 では exit 2)
- 操作手段の不調を理由に skipped を返せるのは全手段が失敗したときだけ (`skip_reason: all_means_failed`)。そのときは `probe` の出力と各手段のエラーを verbatim で添える。
  `harness_not_installed` / `requires_runtime` の skipped はこの条件の対象外
- Windows 実行先の検証は下の「Windows 実行先」で扱い、ここでの手段の順序と `all_means_failed` の対象に含めない

### 手段 2: Playwright ライブラリ

手段 2 を使う前に `references/means-scripts.md`「手段 2: Playwright ライブラリ」を読む。

### 手段 3: WebDriver

手段 3 を使う前に `references/means-scripts.md`「手段 3: WebDriver」を読む。

### Windows 実行先

windows_endpoint か windows の理由が渡されたら `references/windows-target.md` を読む。

## 4. 返却スキーマ (JSON)

返す前に `references/report-schema.md` を読む。

### 保留した stop の引き取り (controller の責務)

`harness.stop_status: deferred` の返却を受けた controller は `references/deferred-stop.md` に従う。
