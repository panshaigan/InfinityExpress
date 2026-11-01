param([switch]$Install)
$ErrorActionPreference = 'Stop'

# Microsoft's documented Evergreen detection: Edge Stable is not the runtime.
# https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution
function Get-WebView2Version {
    $client = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
    foreach ($key in @(
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$client",
        "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$client",
        "HKCU:\Software\Microsoft\EdgeUpdate\Clients\$client"
    )) {
        $value = (Get-ItemProperty -LiteralPath $key -Name pv -ErrorAction SilentlyContinue).pv
        $version = $null
        if ([version]::TryParse($value, [ref]$version) -and $version -gt [version]'0.0.0.0') {
            return $version
        }
    }
}

$version = Get-WebView2Version
if (-not $version -and $Install) {
    $downloadDir = Join-Path ([IO.Path]::GetTempPath()) ('ie-webview2-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $downloadDir | Out-Null
    try {
        $bootstrapper = Join-Path $downloadDir 'MicrosoftEdgeWebview2Setup.exe'
        Invoke-WebRequest -UseBasicParsing -TimeoutSec 120 -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $bootstrapper
        $signature = Get-AuthenticodeSignature -LiteralPath $bootstrapper
        if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation(?:,|$)') {
            throw 'WebView2 bootstrapper does not have a valid Microsoft signature'
        }
        $installerProcess = Start-Process -FilePath $bootstrapper -ArgumentList '/silent', '/install' -WindowStyle Hidden -PassThru
        if (-not $installerProcess.WaitForExit(240000)) {
            $installerProcess.Kill()
            throw 'WebView2 runtime installation timed out'
        }
        if ($installerProcess.ExitCode -ne 0) {
            throw "WebView2 runtime installer failed ($($installerProcess.ExitCode))"
        }
        $version = Get-WebView2Version
    } finally {
        # Only remove the uniquely named bootstrapper created by this script.
        if (Test-Path -LiteralPath $bootstrapper) { Remove-Item -LiteralPath $bootstrapper -Force }
        Remove-Item -LiteralPath $downloadDir
    }
}
if (-not $version) {
    throw 'WebView2 Evergreen Runtime is missing for this user. Run powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/ensure-webview2.ps1 -Install before desktop smoke tests.'
}
Write-Output "WebView2 Evergreen Runtime: $version"
