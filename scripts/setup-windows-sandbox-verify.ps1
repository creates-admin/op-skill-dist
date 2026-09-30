<#
.SYNOPSIS
    開発者 PC を `op verify windows lease` で検証できる状態にする初回セットアップ (ADR-0035 決定7)。

.DESCRIPTION
    1. Windows Sandbox 機能を有効化する (管理者・再起動)
    2. Store 版 Windows Sandbox (wsb.exe) を取得する
    3. ホスト FW に中継ポート 19500-19599 の受信許可規則を常設する
       (vEthernet (Default Switch) / vEthernet (WSL...) に届く、同じサブネットからの接続だけ)
    4. WebView2 の Fixed Version Runtime・Evergreen インストーラー・msedgedriver をキャッシュする
       (取得した .cab と exe は Microsoft の Authenticode 署名が Valid のときだけ展開・配置する)

    変更を伴う手順 (ダウンロードを含む) はそれぞれ実行前に確認を求める (-Confirm:$false を付けたときだけ省く)。
    再起動は restart と入力したときだけ行う。何度実行してもよく、済んでいる手順は飛ばす。
    開発者本人のアカウントで Windows PowerShell 5.1 (powershell.exe) を「管理者として実行」して実行する
    (別アカウントの管理者では %LOCALAPPDATA% がずれる)。PowerShell 7 (pwsh) では Get-WindowsOptionalFeature が失敗する。
    5.1 が要るのはこの初回セットアップだけで、lease のホスト操作は従来どおり pwsh 7 を使う。
    -WhatIf は管理者でなくても実行でき、要る手順を表示する (Sandbox 機能は WindowsSandbox.exe の有無で見る)。

.PARAMETER CacheRoot
    キャッシュの置き場所。`op verify windows lease --windows-cache` と同じ値にする。

.PARAMETER FixedVersionCab
    WebView2 Fixed Version Runtime (x64) の .cab (手元のファイル)。
    省略時は既存のキャッシュを使い、無ければ lease は Evergreen に切り替えて動く。

.PARAMETER FixedVersionCabUrl
    WebView2 Fixed Version Runtime (x64) の .cab の URL (https、*.microsoft.com)。-FixedVersionCab と同時には使わない。
    ファイル名の版がキャッシュ済みの版と同じなら取得しない。

.PARAMETER RefreshEvergreen
    Evergreen インストーラーを取得し直す。

.PARAMETER LogPath
    実行の記録 (transcript) を書くファイル。昇格したプロセスの結果を後から読むときに使う。親フォルダは既にあること。

.EXAMPLE
    .\setup-windows-sandbox-verify.ps1 -FixedVersionCab $HOME\Downloads\Microsoft.WebView2.FixedVersionRuntime.140.0.3485.66.x64.cab

.EXAMPLE
    .\setup-windows-sandbox-verify.ps1 -WhatIf -FixedVersionCabUrl https://msedge.sf.dl.delivery.mp.microsoft.com/filestreamingservice/files/<guid>/Microsoft.WebView2.FixedVersionRuntime.<ver>.x64.cab
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [string]$CacheRoot = 'C:\op-verify',
    [string]$FixedVersionCab,
    [string]$FixedVersionCabUrl,
    [switch]$RefreshEvergreen,
    [string]$LogPath
)

$ErrorActionPreference = 'Stop'
# 5.1 の Invoke-WebRequest は進捗表示があると数百 MB の取得が極端に遅くなる
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version 3

$RelayPortRange = '19500-19599'
$RuleName = 'op-verify-relay'
$EvergreenUrl = 'https://go.microsoft.com/fwlink/?linkid=2124701'
$EvergreenName = 'MicrosoftEdgeWebView2RuntimeInstallerX64.exe'
$FixedDir = Join-Path $CacheRoot 'webview2\fixed'
$EvergreenDir = Join-Path $CacheRoot 'webview2\evergreen'
$DriverDir = Join-Path $CacheRoot 'msedgedriver'
$script:Cmdlet = $PSCmdlet
$script:IsAdmin = $false

function Write-Step([string]$Message) {
    Write-Host ('==> ' + $Message) -ForegroundColor Cyan
}

function Confirm-Change([string]$Target, [string]$Action) {
    return $script:Cmdlet.ShouldProcess($Target, $Action)
}

function Assert-MicrosoftSignature([string]$Path) {
    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    $subject = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { '' }
    if ($signature.Status -ne 'Valid' -or $subject -notmatch '^CN=Microsoft Corporation,') {
        throw ('Microsoft の署名を確かめられないので展開・配置しません: ' + $Path + ' (Status ' + $signature.Status + ', 署名者 ' + $subject + ')')
    }
}

function Save-SignedDownload([string]$Url, [string]$Destination) {
    $partial = Join-Path $env:TEMP ('op-verify-' + (Split-Path -Leaf $Destination))
    Invoke-WebRequest -Uri $Url -OutFile $partial -UseBasicParsing
    try {
        Assert-MicrosoftSignature $partial
    } catch {
        Remove-Item -LiteralPath $partial -Force
        throw
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
    Move-Item -LiteralPath $partial -Destination $Destination -Force
}

function Get-CabVersion {
    $name = if ($FixedVersionCabUrl) { Split-Path -Leaf ([Uri]$FixedVersionCabUrl).AbsolutePath } elseif ($FixedVersionCab) { Split-Path -Leaf $FixedVersionCab } else { '' }
    if ($name -match '^Microsoft\.WebView2\.FixedVersionRuntime\.(\d+(\.\d+){3})\.x64\.cab$') {
        return $Matches[1]
    }
    return $null
}

function Assert-Prerequisite {
    if ($PSVersionTable.PSEdition -ne 'Desktop') {
        throw ('Windows PowerShell 5.1 (powershell.exe) を「管理者として実行」して、このスクリプトを実行し直してください (PowerShell ' + $PSVersionTable.PSVersion + ' では Windows Sandbox 機能の確認 Get-WindowsOptionalFeature が失敗します)')
    }
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    $script:IsAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $script:IsAdmin -and -not $WhatIfPreference) {
        throw '管理者として実行した PowerShell で実行してください (Sandbox 機能の有効化とホスト FW 規則に管理者権限が要ります。-WhatIf だけは管理者でなくても実行できます)'
    }
    if ($FixedVersionCab -and $FixedVersionCabUrl) {
        throw '-FixedVersionCab と -FixedVersionCabUrl はどちらか一方だけ指定してください'
    }
    if ($FixedVersionCabUrl) {
        $uri = $null
        if (-not [Uri]::TryCreate($FixedVersionCabUrl, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.Host -notlike '*.microsoft.com' -or $uri.AbsolutePath -notmatch '\.cab$') {
            throw ('-FixedVersionCabUrl は *.microsoft.com の https の .cab にしてください (got ' + $FixedVersionCabUrl + ')')
        }
    }
    $build = [Environment]::OSVersion.Version.Build
    if ($build -lt 26100) {
        throw ('wsb CLI には Windows 11 24H2 (build 26100) 以降が必要です (この PC は build ' + $build + ')')
    }
    if ($CacheRoot -notmatch '^[A-Za-z]:\\' -or $CacheRoot.Contains('"')) {
        throw '-CacheRoot は C:\op-verify のような絶対パスにしてください'
    }
}

function Enable-SandboxFeature {
    Write-Step 'Windows Sandbox 機能'
    if ($script:IsAdmin) {
        $feature = Get-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -ErrorAction SilentlyContinue
        if (-not $feature) {
            throw 'Windows Sandbox 機能が見つかりません (Windows の Pro / Enterprise / Education が必要です)'
        }
        $enabled = $feature.State -eq 'Enabled'
    } else {
        $enabled = Test-Path -LiteralPath (Join-Path $env:SystemRoot 'System32\WindowsSandbox.exe')
    }
    if ($enabled) {
        Write-Host '有効化済み'
        return $false
    }
    if (-not (Confirm-Change 'Containers-DisposableClientVM' 'Windows Sandbox 機能を有効化する (反映には再起動が必要)')) {
        if ($WhatIfPreference) { return $false }
        Write-Warning '機能を有効化しなかったので、ここで終了します'
        exit 1
    }
    $result = Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All -NoRestart
    return [bool]$result.RestartNeeded
}

function Request-Restart {
    Write-Host '機能の有効化を反映するには再起動が必要です。再起動後にもう一度このスクリプトを実行してください。' -ForegroundColor Yellow
    $answer = Read-Host '今すぐ再起動する場合は restart と入力してください (それ以外は再起動せずに終了します)'
    if ($answer -eq 'restart') {
        Restart-Computer
    }
    exit 0
}

function Get-WsbPath {
    return Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\wsb.exe'
}

function Install-StoreSandbox {
    Write-Step 'Store 版 Windows Sandbox (wsb.exe)'
    if (Test-Path -LiteralPath (Get-WsbPath)) {
        Write-Host '取得済み'
        return
    }
    if (-not (Confirm-Change 'WindowsSandbox.exe' 'Windows Sandbox を 1 回起動して Store 版 (wsb.exe) を取得する')) {
        if ($WhatIfPreference) { return }
        Write-Warning 'wsb.exe を取得しなかったので、ここで終了します'
        exit 1
    }
    # 昇格したプロセスから直接起動せず explorer 経由で利用者として起動する (スパイクの落とし穴 1・2)
    Start-Process -FilePath explorer.exe -ArgumentList (Join-Path $env:SystemRoot 'System32\WindowsSandbox.exe')
    for ($i = 0; $i -lt 60; $i++) {
        if (Test-Path -LiteralPath (Get-WsbPath)) { break }
        Start-Sleep -Seconds 3
    }
    if (-not (Test-Path -LiteralPath (Get-WsbPath))) {
        throw 'wsb.exe が現れませんでした。Microsoft Store / Windows Update に繋がるか確かめて、もう一度実行してください'
    }
    Write-Host '取得しました。起動した Sandbox のウィンドウは閉じてください (「初期化できませんでした」と出た場合も閉じてかまいません)'
}

function Remove-QueryUserBlockRule {
    # 許可ダイアログをキャンセルすると PowerShell の受信 Block 規則が自動で作られ、許可規則より優先される (スパイクの落とし穴 7)
    $rules = @(Get-NetFirewallApplicationFilter |
        Where-Object { $_.Program -match '\\(pwsh|powershell)\.exe$' } |
        Get-NetFirewallRule |
        Where-Object { $_.Direction -eq 'Inbound' -and $_.Action -eq 'Block' })
    foreach ($rule in $rules) {
        if (Confirm-Change $rule.DisplayName ('中継を塞ぐ PowerShell の受信 Block 規則を削除する (' + $rule.Name + ')')) {
            Remove-NetFirewallRule -Name $rule.Name
        }
    }
}

# 規則の InterfaceAlias は、その adapter があれば別名で、vEthernet が作り直されて無くなっていれば作成時の GUID で返る
function Test-RelayRuleCurrent($Rule, [string[]]$Aliases) {
    $port = $Rule | Get-NetFirewallPortFilter
    $address = $Rule | Get-NetFirewallAddressFilter
    $ruleInterfaces = @(($Rule | Get-NetFirewallInterfaceFilter).InterfaceAlias | ForEach-Object { ([string]$_).ToLowerInvariant() } | Sort-Object)
    $currentInterfaces = @($Aliases | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object)
    return ($Rule.Enabled -eq 'True') -and ($Rule.Direction -eq 'Inbound') -and ($Rule.Action -eq 'Allow') -and
        ($port.Protocol -eq 'TCP') -and ((@($port.LocalPort) -join ',') -eq $RelayPortRange) -and
        ((@($address.RemoteAddress) -join ',') -eq 'LocalSubnet') -and
        (($ruleInterfaces -join '|') -eq ($currentInterfaces -join '|'))
}

function Set-RelayFirewallRule {
    Write-Step ('ホスト FW の中継ポート許可規則 (TCP ' + $RelayPortRange + ')')
    $aliases = @(Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.InterfaceAlias -eq 'vEthernet (Default Switch)' -or $_.InterfaceAlias -like 'vEthernet (WSL*' } |
        ForEach-Object { $_.InterfaceAlias } |
        Sort-Object -Unique)
    $missing = $null
    if ($aliases -notcontains 'vEthernet (Default Switch)') {
        $missing = 'vEthernet (Default Switch) が見つかりません (機能を有効化したあと再起動したか確かめてください)'
    } elseif (-not ($aliases | Where-Object { $_ -like 'vEthernet (WSL*' })) {
        $missing = 'vEthernet (WSL...) が見つかりません。WSL (NAT モード) を起動してから実行してください'
    }
    if ($missing) {
        if ($WhatIfPreference) {
            Write-Host ('規則は作れる状態になってから作ります: ' + $missing)
            return
        }
        throw $missing
    }
    Remove-QueryUserBlockRule
    $existing = Get-NetFirewallRule -Name $RuleName -ErrorAction SilentlyContinue
    if ($existing -and (Test-RelayRuleCurrent $existing $aliases)) {
        Write-Host '作成済み'
        return
    }
    $action = '受信 TCP ' + $RelayPortRange + ' を ' + ($aliases -join ' / ') + ' の同じサブネットからだけ許可する'
    if ($existing) { $action = '既存の規則 (ポート・網・vEthernet が今と違う) を作り直す: ' + $action }
    if (-not (Confirm-Change $RuleName $action)) {
        if ($WhatIfPreference) { return }
        if ($existing) {
            Write-Host '既存の規則を残します'
            return
        }
        Write-Warning 'FW 規則を作らなかったので、中継には届きません'
        return
    }
    if ($existing) {
        Remove-NetFirewallRule -Name $RuleName
    }
    New-NetFirewallRule -Name $RuleName -DisplayName 'op verify relay (WSL / Windows Sandbox)' `
        -Direction Inbound -Action Allow -Protocol TCP -LocalPort $RelayPortRange `
        -RemoteAddress LocalSubnet -InterfaceAlias $aliases -Profile Any | Out-Null
    Write-Host '作成しました'
}

function Save-Evergreen {
    Write-Step 'WebView2 Evergreen インストーラー'
    $target = Join-Path $EvergreenDir $EvergreenName
    if ((Test-Path -LiteralPath $target) -and -not $RefreshEvergreen) {
        Write-Host 'キャッシュ済み'
        return
    }
    if (-not (Confirm-Change $target ('WebView2 Evergreen インストーラーを ' + $EvergreenUrl + ' から取得し、Microsoft の署名を確かめて置く'))) {
        return
    }
    Save-SignedDownload $EvergreenUrl $target
    Write-Host ('保存しました: ' + $target)
}

function Save-FixedVersion {
    Write-Step 'WebView2 Fixed Version Runtime'
    $exe = Join-Path $FixedDir 'msedgewebview2.exe'
    $current = if (Test-Path -LiteralPath $exe) { (Get-Item -LiteralPath $exe).VersionInfo.ProductVersion } else { $null }
    if (-not $FixedVersionCab -and -not $FixedVersionCabUrl) {
        if ($current) {
            Write-Host ('キャッシュ済み (' + $current + ')')
            return
        }
        Write-Host 'Fixed Version Runtime がありません。https://developer.microsoft.com/microsoft-edge/webview2/ の Fixed Version (x64) の .cab を -FixedVersionCabUrl (URL) か -FixedVersionCab (手元のファイル) に渡して再実行してください。それまでは lease が Evergreen に切り替えて動きます。' -ForegroundColor Yellow
        return
    }
    if ($current -and (Get-CabVersion) -eq $current) {
        Write-Host ('キャッシュ済み (' + $current + ')')
        return
    }
    $source = if ($FixedVersionCabUrl) { $FixedVersionCabUrl } else { $FixedVersionCab }
    if (-not (Confirm-Change $FixedDir ('Fixed Version Runtime の .cab を ' + $source + ' から取り、Microsoft の署名を確かめて展開して置く'))) {
        return
    }
    $cab = $FixedVersionCab
    if ($FixedVersionCabUrl) {
        $cab = Join-Path (Join-Path $CacheRoot 'downloads') (Split-Path -Leaf ([Uri]$FixedVersionCabUrl).AbsolutePath)
        Save-SignedDownload $FixedVersionCabUrl $cab
    } else {
        Assert-MicrosoftSignature $cab
    }
    $work = Join-Path $CacheRoot 'webview2\expand'
    try {
        if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
        New-Item -ItemType Directory -Force -Path $work | Out-Null
        & (Join-Path $env:SystemRoot 'System32\expand.exe') $cab '-F:*' $work | Out-Null
        if ($LASTEXITCODE -ne 0) { throw ('expand.exe が失敗しました (exit ' + $LASTEXITCODE + ')') }
        $found = Get-ChildItem -LiteralPath $work -Recurse -Filter msedgewebview2.exe | Select-Object -First 1
        if (-not $found) { throw 'cab の中に msedgewebview2.exe がありません' }
        Assert-MicrosoftSignature $found.FullName
        if (Test-Path -LiteralPath $FixedDir) { Remove-Item -LiteralPath $FixedDir -Recurse -Force }
        Move-Item -LiteralPath $found.Directory.FullName -Destination $FixedDir
    } finally {
        if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
        if ($FixedVersionCabUrl -and (Test-Path -LiteralPath $cab)) { Remove-Item -LiteralPath $cab -Force }
    }
    # Fixed Version のレンダラーは AppContainer で動くので ALL (RESTRICTED) APPLICATION PACKAGES に読み取りが要る
    & (Join-Path $env:SystemRoot 'System32\icacls.exe') $FixedDir /grant '*S-1-15-2-1:(OI)(CI)(RX)' /grant '*S-1-15-2-2:(OI)(CI)(RX)' /T /Q | Out-Null
    if ($LASTEXITCODE -ne 0) { throw ('icacls.exe が失敗しました (exit ' + $LASTEXITCODE + ')') }
    Write-Host ('展開しました: ' + $FixedDir)
}

function Save-EdgeDriver {
    Write-Step 'msedgedriver (Fixed Version Runtime と同じバージョン)'
    $exe = Join-Path $FixedDir 'msedgewebview2.exe'
    $version = $null
    if ($WhatIfPreference) { $version = Get-CabVersion }
    if (-not $version -and (Test-Path -LiteralPath $exe)) { $version = (Get-Item -LiteralPath $exe).VersionInfo.ProductVersion }
    if (-not $version) {
        Write-Host 'Fixed Version Runtime が無いので飛ばします' -ForegroundColor Yellow
        return
    }
    $stamp = Join-Path $DriverDir 'version.txt'
    if ((Test-Path -LiteralPath $stamp) -and ((Get-Content -LiteralPath $stamp -Raw).Trim() -eq $version)) {
        Write-Host ('キャッシュ済み (' + $version + ')')
        return
    }
    $url = 'https://msedgedriver.microsoft.com/' + $version + '/edgedriver_win64.zip'
    if (-not (Confirm-Change $DriverDir ('msedgedriver ' + $version + ' を ' + $url + ' から取得し、Microsoft の署名を確かめて置く'))) {
        return
    }
    $zip = Join-Path $env:TEMP ('edgedriver_win64-' + $version + '.zip')
    $staging = Join-Path $CacheRoot 'msedgedriver.new'
    try {
        Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
        if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
        Expand-Archive -LiteralPath $zip -DestinationPath $staging
        Assert-MicrosoftSignature (Join-Path $staging 'msedgedriver.exe')
        if (Test-Path -LiteralPath $DriverDir) { Remove-Item -LiteralPath $DriverDir -Recurse -Force }
        Move-Item -LiteralPath $staging -Destination $DriverDir
    } finally {
        if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
        if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
    }
    Set-Content -LiteralPath $stamp -Value $version -Encoding Ascii
    Write-Host ('保存しました: ' + $DriverDir + ' (' + $version + ')')
}

# -WhatIf のまま NetTCPIP が自動で読み込まれると、モジュール内の New-Alias が WhatIf の行を出す
$requestedWhatIf = $WhatIfPreference
$WhatIfPreference = $false
Import-Module NetTCPIP
$WhatIfPreference = $requestedWhatIf

if ($LogPath) {
    Start-Transcript -LiteralPath $LogPath -Force -WhatIf:$false -Confirm:$false | Out-Null
}
try {
    Assert-Prerequisite
    if (Enable-SandboxFeature) {
        Request-Restart
    }
    Install-StoreSandbox
    Set-RelayFirewallRule
    Save-Evergreen
    Save-FixedVersion
    Save-EdgeDriver
    Write-Step '完了'
    Write-Host ('WSL で確認: op verify windows lease --holder manual-check --windows-cache ' + $CacheRoot)
} catch {
    Write-Host ('失敗: ' + $_.Exception.Message) -ForegroundColor Red
    throw
} finally {
    if ($LogPath) { Stop-Transcript | Out-Null }
}
