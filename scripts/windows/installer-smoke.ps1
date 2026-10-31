param([string]$Installer = '')
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
Set-Location -LiteralPath $repoRoot
$smokeName = 'InfinityExpress Smoke Test'
$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$smokeName"
$manufacturerKey = "HKCU:\Software\infinityexpress\$smokeName"
$desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) "$smokeName.lnk"
$menuDir = Join-Path ([Environment]::GetFolderPath('Programs')) $smokeName
$menuLink = Join-Path $menuDir "$smokeName.lnk"

if (-not $Installer) {
    $packages = @(Get-ChildItem -LiteralPath 'src-tauri/target/release/bundle/nsis' -Filter "$smokeName*-setup.exe")
    if ($packages.Count -ne 1) { throw 'Build exactly one isolated smoke-test NSIS package first' }
    $Installer = $packages[0].FullName
}
$Installer = (Resolve-Path -LiteralPath $Installer).Path
if ((Get-Item -LiteralPath $Installer).VersionInfo.ProductName -ne $smokeName) {
    throw 'Refusing to run an installer without the isolated smoke-test product name'
}
foreach ($existing in @($uninstallKey, $manufacturerKey, $desktopLink, $menuDir)) {
    if (Test-Path -LiteralPath $existing) { throw "Smoke-test identity already exists; refusing to overwrite: $existing" }
}

$output = Join-Path $repoRoot '.cache/windows-installer'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$fixture = Join-Path $output ('run-' + [Guid]::NewGuid().ToString('N'))
$installDir = Join-Path $fixture 'Installed app with spaces'
$uninstaller = Join-Path $installDir 'uninstall.exe'
$installedBinary = Join-Path $installDir 'app.exe'
$sentinelDir = Join-Path $fixture 'player game data'
New-Item -ItemType Directory -Path $sentinelDir -Force | Out-Null
$sentinel = Join-Path $sentinelDir 'keep.txt'
Set-Content -LiteralPath $sentinel -Value 'player data must survive uninstall' -Encoding UTF8
$checks = New-Object System.Collections.Generic.List[string]
$oldBinary = $env:IE_SMOKE_BINARY
$oldResults = $env:IE_SMOKE_RESULT_DIR
$installed = $false
$success = $false

function Run-Silent([string]$binary, [string]$arguments) {
    $process = Start-Process -FilePath $binary -ArgumentList $arguments -WindowStyle Hidden -PassThru
    if (-not $process.WaitForExit(120000)) {
        $process.Kill()
        throw "Silent installer process timed out: $binary"
    }
    if ($process.ExitCode -ne 0) { throw "Installer process failed ($($process.ExitCode)): $binary" }
}

function Assert-InstallOwnership {
    # Validate absolute targets before running an uninstaller or deleting files.
    $resolvedFixture = [IO.Path]::GetFullPath($fixture)
    $resolvedInstall = [IO.Path]::GetFullPath($installDir)
    if ((Split-Path -Parent $resolvedFixture) -ne $output -or
        (Split-Path -Leaf $resolvedFixture) -notlike 'run-*' -or
        (Split-Path -Parent $resolvedInstall) -ne $resolvedFixture) {
        throw 'Installer cleanup path escaped the test fixture'
    }
    if (Test-Path -LiteralPath $uninstallKey) {
        $registration = Get-ItemProperty -LiteralPath $uninstallKey
        if ($registration.DisplayName -ne $smokeName -or
            [IO.Path]::GetFullPath($registration.InstallLocation.Trim('"')) -ne $resolvedInstall) {
            throw 'Uninstall registration does not belong to this test fixture'
        }
    }
}

function Uninstall-Fixture {
    Assert-InstallOwnership
    if (Test-Path -LiteralPath $uninstaller) {
        # _?= runs in place and lets WaitForExit observe the real uninstaller,
        # rather than its temporary self-copy launcher. This argument goes last.
        Run-Silent $uninstaller "/S _?=$installDir"
        Remove-Item -LiteralPath $uninstaller -Force -ErrorAction SilentlyContinue
    }
}

try {
    # NSIS /D must be last and unquoted, including when the path contains spaces.
    # https://nsis.sourceforge.io/Docs/Chapter3.html#installerusage
    Run-Silent $Installer "/S /D=$installDir"
    $installed = $true
    Assert-InstallOwnership
    if (-not (Test-Path -LiteralPath $uninstallKey)) { throw 'Uninstall registration was not created' }
    & node (Join-Path $repoRoot 'scripts/windows/verify-install.mjs') $installDir
    if ($LASTEXITCODE -ne 0) { throw 'Installed application or bundled tool differs from its package payload' }
    $shell = New-Object -ComObject WScript.Shell
    foreach ($shortcut in @($desktopLink, $menuLink)) {
        if (-not (Test-Path -LiteralPath $shortcut)) { throw "Installer shortcut missing: $shortcut" }
        if ($shell.CreateShortcut($shortcut).TargetPath -ne $installedBinary) { throw 'Shortcut targets the wrong executable' }
    }
    $checks.Add('Silent per-user install, resource hashes, uninstall registration, and shortcuts')
    Write-Output "PASS: $($checks[$checks.Count - 1])"

    $env:IE_SMOKE_BINARY = $installedBinary
    $env:IE_SMOKE_RESULT_DIR = Join-Path $output 'desktop'
    & node (Join-Path $repoRoot 'scripts/windows/desktop-smoke.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Installed application desktop smoke test failed' }
    $checks.Add('Installed app: React/WebView2, native dialogs, project switching, WeiDU, and restore')

    Uninstall-Fixture
    $installed = $false
    foreach ($removed in @($installedBinary, (Join-Path $installDir 'weidu/weidu.exe'),
        (Join-Path $installDir '7zip/7z.exe'), $uninstallKey, $desktopLink, $menuLink)) {
        if (Test-Path -LiteralPath $removed) { throw "Uninstaller left an installed artifact: $removed" }
    }
    if ((Get-Content -LiteralPath $sentinel).Trim() -ne 'player data must survive uninstall') {
        throw 'Uninstall modified player game data outside the install folder'
    }
    $checks.Add('Silent uninstall removes application, resources, registration, and shortcuts; player data remains')
    Write-Output "PASS: $($checks[$checks.Count - 1])"
    $success = $true
} catch {
    @{ ok = $false; checks = @($checks.ToArray()); error = $_.Exception.Message } |
        ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $output 'result.json') -Encoding UTF8
    throw
} finally {
    $env:IE_SMOKE_BINARY = $oldBinary
    $env:IE_SMOKE_RESULT_DIR = $oldResults
    if ($installed -or (Test-Path -LiteralPath $uninstallKey)) { Uninstall-Fixture }
    Assert-InstallOwnership
    # NSIS deliberately retains the install-location preference. Remove only
    # this test-created product key, whose absence was checked before installing.
    if (Test-Path -LiteralPath $manufacturerKey) { Remove-Item -LiteralPath $manufacturerKey -Recurse -Force }
    if ($success) {
        @{ ok = $true; checks = @($checks.ToArray()) } | ConvertTo-Json -Depth 4 |
            Set-Content -LiteralPath (Join-Path $output 'result.json') -Encoding UTF8
        Remove-Item -LiteralPath $fixture -Recurse -Force
    }
}
