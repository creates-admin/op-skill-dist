# `--provision-windows`: Windows 検証の環境の準備

開発者 PC ごとに 1 回、WebView2 や tauri-driver の版を上げるときにも行う (ADR-0036 決定7)。
Claude が不足を見つけて提案し、人間が承認し (AskUserQuestion と UAC)、スクリプト 2 本が実行する。承認の前にダウンロードや Windows の設定変更をしない。

| スクリプト | 実行する場所 | 用意するもの |
|---|---|---|
| `scripts/setup-wsl-verify.sh` | WSL | rustup target `x86_64-pc-windows-msvc`・cargo-xwin・PATH に見える `llvm-rc`・静的 CRT の `<cache>\tauri-driver\tauri-driver.exe` |
| `scripts/setup-windows-sandbox-verify.ps1` | 管理者の Windows PowerShell 5.1 | Sandbox 機能・Store 版 wsb・ホスト FW 規則・WebView2 Fixed Version Runtime / Evergreen・Fixed と同じ版の msedgedriver |

どちらも変更の前に確認を取り、`--dry-run` / `-WhatIf` では何も変えず、済んだ手順は飛ばす。取得した .cab と exe は Microsoft の署名が Valid のときだけ置く。

## 1. スクリプトの場所

plugin root (skill_dir の 2 つ上) の `scripts/` に 2 本があればそれを使う。無ければ op-skill の checkout のパスを人間に聞いてその `scripts/` を使い、checkout が無ければ終了する。
以降の fence の `<scripts>` はその絶対パス、`<scripts_win>` は `wslpath -w <scripts>` の結果、`<cache>` は `--windows-cache` (既定 `C:\op-verify`)、`<cache_wsl>` は `wslpath -u '<cache>'` の結果。

## 2. 検出 (何も変えない)

WSL 側 (exit 0 = 済み / 1 = `What if:` の行が要る手順 / 2 = エラー):

```bash
bash "<scripts>/setup-wsl-verify.sh" --dry-run --windows-cache '<cache>'
```

Windows 側 (管理者でなくてよい。`WhatIf:` (英語の Windows では `What if:`) の行が要る手順、exit 1 はエラー):

```bash
cd /mnt/c && powershell.exe -NoProfile -ExecutionPolicy Bypass -Command - <<'PS'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
& '<scripts_win>\setup-windows-sandbox-verify.ps1' -WhatIf -CacheRoot '<cache>'

PS
```

Fixed Version Runtime の .cab の URL は、Windows 側が Fixed を `キャッシュ済み` と出し、`--webview2-version` の指定も無ければ要らない。要るときは配布ページに埋め込まれた直リンクから選ぶ
(提案を作るためにページを読むだけで、.cab は取得しない):

```bash
curl -fsSL https://developer.microsoft.com/en-us/microsoft-edge/webview2/ | sed 's#\\u002F#/#g' \
  | grep -oE 'https://msedge\.sf\.dl\.delivery\.mp\.microsoft\.com/filestreamingservice/files/[0-9A-Fa-f-]+/Microsoft\.WebView2\.FixedVersionRuntime\.[0-9.]+\.x64\.cab' \
  | sort -u
```

- `--webview2-version <ver>` があればその版、無ければ最も新しい版のうち、msedgedriver が同じ版で取れるものを選ぶ
  (`curl -sI -o /dev/null -w '%{http_code}' https://msedgedriver.microsoft.com/<ver>/edgedriver_win64.zip` が `200`)
- 見つからなければ配布ページの URL を示して、x64 の .cab の URL を人間に聞く
- 選んだ URL を `-FixedVersionCabUrl '<url>'` に付けて Windows 側の `-WhatIf` をもう一度実行し、提案に使う

呼び出し元から lease の `requires_runtime: windows not provisioned` と `details.reason` (op-run の `WINDOWS_DETAIL`) を受けていれば、提案の冒頭に載せる。
2 本とも要る手順が無ければ手順 6 の確認へ進む。

## 3. 提案と承認

```
## op-verify --provision-windows 提案

| # | 側 | 手順 | 取得する物・版 | 取得元 | 実行するコマンド | 権限 |
|---|---|---|---|---|---|---|
| 1 | WSL | <What if の行> | <例: tauri-driver 2.0.6 (静的 CRT)> | <例: crates.io> | bash <scripts>/setup-wsl-verify.sh --yes | 利用者 |
| 2 | Windows | スクリプトを <cache>\setup\ に置く | - | - | cp | 利用者 |
| 3 | Windows | <WhatIf の行> | <例: WebView2 Fixed 153.0.4234.48 / msedgedriver 153.0.4234.48> | <URL> | setup-windows-sandbox-verify.ps1 (UAC で昇格) | 管理者 |

実行しますか?  1. 提案どおり実行する  2. WSL 側だけ実行する  3. キャンセル
```

- cargo-xwin の導入か tauri-driver のビルドがあるときは、cargo-xwin が Microsoft の CRT / Windows SDK を取得し、使用をもって Microsoft のライセンス
  (https://go.microsoft.com/fwlink/?LinkId=2086102) に同意したとみなされることを書く
- WSL 側が `sudo apt-get install -y llvm` を残したときは、人間が実行する手順として載せる (スクリプトは sudo を使わない)
- WebView2 Fixed と msedgedriver は同じ版を並べる
- Sandbox 機能の有効化があるときは、再起動が要り、昇格したウィンドウで `restart` と入力したときだけ再起動し、再起動後に `--provision-windows` をもう一度実行することを書く

AskUserQuestion で聞く。1 か 2 以外は何も変えずに終了する。

## 4. WSL 側の実行

WSL 側の手順があるときだけ実行する。exit 1 は残った手順 (人間の作業) を報告して終了し、exit 2 は stderr を報告して終了する。

```bash
bash "<scripts>/setup-wsl-verify.sh" --yes --windows-cache '<cache>'
```

## 5. Windows 側の実行 (UAC)

1 が選ばれ、Windows 側の手順があるときだけ実行する。昇格したプロセスは WSL のファイルを読めないことがあるので、スクリプトをキャッシュの下に置いてから起動する。

```bash
mkdir -p "<cache_wsl>/setup" && cp "<scripts>/setup-windows-sandbox-verify.ps1" "<cache_wsl>/setup/" && rm -f "<cache_wsl>/setup/setup.log"
```

UAC の承認が管理者の承認になる。手順 3 で承認を取ったので `-Confirm:$false` で起動する。`-FixedVersionCabUrl` は手順 2 で URL を選んだときだけ付ける。

```bash
cd /mnt/c && powershell.exe -NoProfile -Command - <<'PS'
$ErrorActionPreference = 'Stop'
try {
    $a = '-NoProfile -ExecutionPolicy Bypass -Command & ''<cache>\setup\setup-windows-sandbox-verify.ps1'' -Confirm:$false -CacheRoot ''<cache>'' -LogPath ''<cache>\setup\setup.log'' -FixedVersionCabUrl ''<承認した .cab の URL>''; exit $LASTEXITCODE'
    $p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -WorkingDirectory C:\ -ArgumentList $a
    exit $p.ExitCode
} catch {
    Write-Host ('昇格したプロセスを起動できませんでした (UAC で承認されなかったなど): ' + $_.Exception.Message)
    exit 1
}

PS
```

結果は `<cache_wsl>/setup/setup.log` (UTF-8、CRLF) を読んで判断する。`==> 完了` があれば成功、`失敗:` の行があればその理由を報告して終了する。
setup.log が無ければ昇格したプロセスは起動していない (UAC で承認されなかったなど) ので、wrapper の出力と exit を報告して終了する。
再起動を求めて終わったときは、再起動後にもう一度実行するよう伝えて終了する。

## 6. 確認

手順 2 の 2 本をもう一度実行し、WSL 側が exit 0、Windows 側に `WhatIf:` / `What if:` の行が無いことを確かめる。続けて lease を借りて必ず返す:

```bash
op verify windows lease --holder opverify-provision-<YYYYMMDD-HHMMSS> --windows-cache '<cache>'
```

```bash
op verify windows release --holder opverify-provision-<YYYYMMDD-HHMMSS>
```

- lease が exit 0 で `details.provision.webview2.mode` が `fixed` なら準備できている
- exit 1 の `windows busy` は他の検証が使用中なので、時間を置いて確かめるよう報告する。`windows not provisioned` は `details.reason` を添えて手順 2 に 1 回だけ戻る
- tauri-driver の起動まで確かめるのは、Windows 用 exe が手元にあるとき (`--driver tauri-driver --app <exe>` を付ける) だけ。無ければ次の `--windows` の実機検証で確かめると報告する

## 完了報告

```
## op-verify provision-windows
- 検出: <WSL / Windows の要る手順、lease の理由>
- 承認: <選んだ選択肢>
- 実行: <WSL の exit と残った手順 / Windows の exit と setup.log の要点>
- 確認: <lease / release の exit、webview2.mode>
- 人間の作業: <apt / 再起動など残ったもの>
```
