# Windows 実行先

windows_endpoint か windows の理由が渡されたときの扱い (SKILL.md 3 章「Windows 実行先」)。

## windows_provision の中身

lease の `details.provision` の JSON。`relay.webdriver_url` (= windows_endpoint)・`relay.api_url_in_sandbox` (Sandbox 内のアプリが WSL の API に繋ぐ URL、API 中継なしなら null)・`webview2.mode` (`fixed` / `evergreen` / `none`)・`webview2.env` (アプリに渡す環境変数。`["WEBVIEW2_BROWSER_EXECUTABLE_FOLDER", "<Sandbox 内のパス>"]` の 2 要素配列か null)・`driver.capabilities` (= windows_capabilities)・`driver.app` (Sandbox 内の exe のパス)・`driver.log` (Sandbox 内の driver のログのパス)

## 扱いの順序

windows_endpoint か windows の理由が渡されたとき、scenarios (無ければ diff が触れた画面) の Windows 分を、Linux 側の実行とは別に 1 本ずつ次の順で扱う。
`requires_runtime` の要素の `scope` は `<シナリオ名> (Windows)` にする。`reason` は ADR-0035 の語
(`windows unavailable` / `windows busy` / `windows not provisioned`) を言い換えずに使い、補足は `detail` に書く。

| 順 | 状況 | 扱い |
|---|---|---|
| 1 | windows_endpoint か windows_capabilities が無い | 検証せず `requires_runtime` に書く。`reason` は windows の理由 (無ければ `windows unavailable`)、`detail` は windows の理由の detail |
| 2 | `curl -sf --max-time 10 "<windows_endpoint>/status"` が失敗する | 検証せず `requires_runtime` に `reason: "windows unavailable"`、`detail: "<windows_endpoint> の /status が応答しない"` で書く |
| 3 | `/status` が応答する | `means-scripts.md`「手段 3: WebDriver」の fence を、`EP` = windows_endpoint、`CAPS` = `{"capabilities":{"alwaysMatch":<windows_capabilities>}}` にして実行し、シナリオ `<シナリオ名> (Windows)` の pass / fail として扱う。`/url` は送らない (driver が起動したアプリは自分の画面を開く)。セッションを作れなければ検証せず `requires_runtime` に `reason: "windows unavailable"`、`detail` にエラーを verbatim で書く |

- セッション作成が即座に失敗するのは Windows 用 exe が Sandbox で起動しないとき (静的 CRT でない等) が多い。`detail` に windows_provision の `driver.log` のパスを添える
- verify-runner は Sandbox 内で何も起動しない (driver は lease が、アプリは New Session で driver が起動する)
- Windows 分の失敗は `means_attempts` と `all_means_failed` の判断に入れない (probe は Linux 側のハーネスしか確かめられないため)
