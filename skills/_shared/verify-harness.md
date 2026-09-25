# 実機検証ハーネス契約 (verify-harness)

対象 repo が持つ実機検証ハーネス (検証環境の起動・停止・健全性確認) の契約の正本。
ハーネスの実体は対象 repo に置き、repo 固有の起動事情はハーネスの中に閉じる。宣言は `op-config.yaml` の `verify_harness`
(`op-config-schema.md` §14)。本ファイルだけを読めば、新しい repo で契約どおりのハーネスを作れる。

## 1. コマンド

3 コマンドとも checkout のルートを cwd として実行する。

| コマンド | 役割 | 成功条件 |
|---|---|---|
| start | 空きポートを選んで `targets` を起動し、ready を確かめてから stdout に §2 の JSON を 1 行出す。起動したプロセスは残したまま戻る | exit 0 + §2 の JSON |
| stop | この checkout で start した全 run を §3 の規則で停止し、その run の state・auth ファイルを消す | exit 0 + §5 の残骸なし |
| smoke | start 済みの run に対し、ハーネスの健全性 (対象が描画され操作できる) を確かめるテストを 1 本だけ実行する | exit 0 |

- stdout に出すのは start の JSON 1 行だけ。進行ログ・警告はすべて stderr に出す。
- start 前に smoke を実行したら非 0 で終わる。
- smoke は、この checkout の run のうち `pid_file` の PID が生きている run から `startedAt` が最も新しいものを対象にする。

## 2. start の stdout JSON

```json
{"run_id":"20260925-102218-a1b2","driver":"playwright","targets":{"site":"http://localhost:3104","cms":"http://localhost:3105","gateway":null},"auth_state":"/abs/path/.verify/storageState-20260925-102218-a1b2.json","pid_file":"/abs/path/.verify/state-20260925-102218-a1b2.json","browser":{"executable_path":"/usr/bin/google-chrome","version":"128.0.6613.84","endpoint":null}}
```

| key | 型 | 必須 | 意味 |
|---|---|---|---|
| `run_id` | string | yes | start ごとに一意な ID。state・auth・ログのファイル名をこれで namespace 化する |
| `driver` | enum | yes | `playwright` / `webdriver`。`verify_harness.driver` と一致する |
| `targets` | object (名前 → URL \| null) | yes | `verify_harness.targets` に宣言した名前はすべて非 null の URL。宣言外の任意 target は起動しなかったとき null |
| `auth_state` | string (絶対パス) \| null | yes | 認証済み状態のファイル (`playwright` なら storageState 互換)。認証が要らなければ null |
| `pid_file` | string (絶対パス) | yes | この run の state ファイル。書式は下の「pid_file の書式」 |
| `browser` | object | yes | start が起動を確かめたブラウザ (§4) |
| `browser.executable_path` | string (絶対パス) \| null | yes | そのブラウザの実行ファイル。`playwright` では非 null |
| `browser.version` | string | yes | そのブラウザ (WebDriver なら操作対象) のバージョン |
| `browser.endpoint` | string (URL) \| null | yes | WebDriver の endpoint。`webdriver` では非 null、`playwright` では null |

- 必須列の yes は key を必ず出すことを指す。null を取れるかは型列で決まる。
- 表にない key を足してよい (読み手は無視する)。

### pid_file の書式

```json
{"runId":"20260925-102218-a1b2","startedAt":"2026-09-25T10:22:18.123Z","pids":[{"pid":41234,"port":3104,"role":"site"}]}
```

| key | 型 | 必須 | 意味 |
|---|---|---|---|
| `runId` | string | yes | start の JSON の `run_id` と同じ値 |
| `startedAt` | string (ISO 8601、ミリ秒精度) | yes | start を始めた時刻 |
| `pids` | array | yes | この run が起動したプロセスごとに 1 要素 |
| `pids[].pid` | integer | yes | プロセスの PID |
| `pids[].port` | integer \| null | yes | そのプロセスが bind したポート。listen しないプロセスは null |
| `pids[].role` | string | yes | プロセスの役割 (target 名など)。stop の本人確認に使う |

- 表にない key を足してよい (読み手は無視する)。

## 3. 並列安全の規則

- state・auth・ログは `run_id` で namespace 化し、run 同士でファイルを上書きしない。
- stop は `pid_file` の各 PID をコマンドライン等で照合し、自分が起動したプロセスと一致したものだけを停止する。ポート番号から逆引きして kill しない。
- 照合して一致しない PID は他のプロセスのものとして停止せず、stderr に警告する。この PID は run の state ファイルを残す理由にしない。
- 生きているのに照合できない PID (`/proc` が無い等) は停止せず、stderr に警告する。
- 停止を試みて生き残ったプロセスか、生きているのに照合できないプロセスが残った run の state ファイルは消さない。stop は残りの run の停止を続けたうえで非 0 で終わる。
- `.env` など tracked・共有の設定ファイルを書き換えない。ポートやオリジンは起動するプロセスの環境変数で渡す。
- `targets` の URL は自分が起動したプロセスが実際に bind したポートを指す。要求ポートと実 bind ポートを照合し、食い違えば起動失敗として扱う。
- start が途中で失敗したら、起動済みのプロセスを自分で停止してから非 0 で終わる。
- 生成物 (state・auth・ログ・スクリーンショット) は gitignore 済みのディレクトリに置く。

## 4. ブラウザの解決

- 操作に使うブラウザの解決はハーネスの責務。start は自分で起動を確かめたブラウザを `browser` に返す。
- Playwright とブラウザのバージョン違いなどは、ハーネス側で executablePath 指定などにより吸収する。
- ブラウザ / ランタイムが無いと言えるのは `op verify probe` の失敗だけ。

## 5. 適合検査

`op verify conformance` が start → §2 の JSON 検証 → smoke → stop → 残骸なし を順に確かめる。
残骸なし = `pid_file` に記録した PID のうち照合して自分が起動したプロセスと一致するものが生きておらず、`targets` のポートが listen されておらず、その run の state・auth ファイルが消えている。

## 6. E2E の方針

- 検証の本体は agent の探索 (Playwright MCP / WebDriver)。ハーネスが持つテストは smoke 1 本だけを必須とする。
- 繰り返し確かめるシナリオだけを、人間の承認を経て regression spec に昇格する。網羅的な spec スイートは作らない。

## 7. 参照実装の適合状況 (daiichi-shoron-web `verify:env`)

| 規則 | 状況 |
|---|---|
| start / stop / smoke | 適合 (`npm run verify:env` / `verify:env:stop` / `verify:smoke`) |
| stdout 1 行 JSON・進行ログは stderr | 適合 |
| `run_id` による namespace 化 | 適合 (`state-<runId>.json` / `storageState-<runId>.json` / ログ) |
| pid_file の書式 | 適合 (`runId` / `startedAt` / `pids[{pid,port,role}]`) |
| PID の本人確認停止 | 不足。`/proc/<pid>/cmdline` で照合し、一致しない PID を停止せず state を消す点は適合。`/proc` を読めないときは生きている PID も照合せずに停止する |
| 停止を試みて生き残った run の state 保持と非 0 終了 | 適合 |
| `.env` 不変・実 bind ポート照合・失敗時の自己回収 | 適合 |
| §2 の JSON | 不足。`run_id` / `driver` / `browser` が無く、URL と auth・state は `siteUrl` / `cmsUrl` / `gatewayUrl` / `storageStatePath` / `pidFile` の flat key。既存 key は残したまま §2 の key を足せる |

適合には、§2 の key の追加と、生きているのに照合できない PID を停止せずにその run の state を残して非 0 で終える修正の両方が要る。
