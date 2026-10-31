param(
    [Parameter(Mandatory = $true)][int]$AppProcessId,
    [Parameter(Mandatory = $true)][string]$DialogTitle,
    [ValidateSet('Cancel', 'Choose')][string]$Action = 'Cancel',
    [string]$TargetPath = '',
    [Parameter(Mandatory = $true)][string]$ResultPath
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SmokeDialogNative {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool PostMessageW(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")]
    public static extern IntPtr GetDlgItem(IntPtr hwnd, int id);
}
'@

function Condition($property, $value) {
    return New-Object System.Windows.Automation.PropertyCondition($property, $value)
}

try {
    # Match both the exact test-generated title and the child app's PID. Never
    # send global keystrokes or interact with another application's dialog.
    $processCondition = Condition ([System.Windows.Automation.AutomationElement]::ProcessIdProperty) $AppProcessId
    $titleCondition = Condition ([System.Windows.Automation.AutomationElement]::NameProperty) $DialogTitle
    $dialog = $null
    $deadline = [DateTime]::UtcNow.AddSeconds(25)
    while ([DateTime]::UtcNow -lt $deadline) {
        $appWindows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
            [System.Windows.Automation.TreeScope]::Children, $processCondition)
        foreach ($appWindow in $appWindows) {
            if ($appWindow.Current.Name -eq $DialogTitle) { $dialog = $appWindow; break }
            $dialog = $appWindow.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $titleCondition)
            if ($null -ne $dialog) { break }
        }
        if ($null -ne $dialog) { break }
        Start-Sleep -Milliseconds 100
    }
    if ($null -eq $dialog) { throw "Native dialog did not open for test process $AppProcessId ($DialogTitle)" }
    if ($dialog.Current.ProcessId -ne $AppProcessId) { throw 'Dialog belongs to a different process' }
    $dialogHandle = [IntPtr]$dialog.Current.NativeWindowHandle

    if ($Action -eq 'Choose') {
        if ([string]::IsNullOrWhiteSpace($TargetPath)) { throw 'TargetPath is required' }
        if (Test-Path -LiteralPath $TargetPath) {
            # Open dialogs start in the fixture's parent directory. Select its
            # visible item; save dialogs already have their full default path.
            $leaf = [IO.Path]::GetFileName($TargetPath)
            $nameCondition = Condition ([System.Windows.Automation.AutomationElement]::NameProperty) $leaf
            if (-not (Test-Path -LiteralPath $TargetPath -PathType Container)) {
                # Explorer may hide known file extensions; do not change the
                # user's Explorer settings just to drive this fixture.
                $nameCondition = New-Object System.Windows.Automation.OrCondition(
                    $nameCondition,
                    (Condition ([System.Windows.Automation.AutomationElement]::NameProperty) ([IO.Path]::GetFileNameWithoutExtension($leaf)))
                )
            }
            $itemCondition = New-Object System.Windows.Automation.AndCondition(
                (Condition ([System.Windows.Automation.AutomationElement]::ControlTypeProperty) ([System.Windows.Automation.ControlType]::ListItem)),
                $nameCondition
            )
            $item = $null
            $deadline = [DateTime]::UtcNow.AddSeconds(10)
            while ([DateTime]::UtcNow -lt $deadline) {
                $item = $dialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $itemCondition)
                if ($null -ne $item) { break }
                Start-Sleep -Milliseconds 100
            }
            if ($null -eq $item) { throw "Fixture item not found in native dialog: $leaf" }
            $selection = $item.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
            $selection.Select()
        }
    }

    $buttonId = if ($Action -eq 'Cancel') { '2' } else { '1' }
    $buttonHandle = [SmokeDialogNative]::GetDlgItem($dialogHandle, [int]$buttonId)
    if ($buttonHandle -eq [IntPtr]::Zero) { throw "Native dialog button $buttonId was not found" }
    # Send the button's native command only to this test dialog. UIA's async
    # Invoke provider can return before delivering a click in an STA helper.
    $posted = [SmokeDialogNative]::PostMessageW($dialogHandle,
        0x0111, [IntPtr]([int]$buttonId), $buttonHandle)
    if (-not $posted) { throw 'Could not activate native dialog button' }
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    $closed = $false
    while ([DateTime]::UtcNow -lt $deadline) {
        if (-not [SmokeDialogNative]::IsWindow($dialogHandle)) { $closed = $true; break }
        Start-Sleep -Milliseconds 100
    }
    if (-not $closed) { throw 'Native dialog remained open after activating its button' }
    @{ ok = $true; action = $Action; title = $DialogTitle } | ConvertTo-Json | Set-Content -LiteralPath $ResultPath -Encoding UTF8
    [Environment]::Exit(0)
} catch {
    $details = @()
    if ($null -eq $dialog -and $null -ne $appWindows) {
        foreach ($appWindow in $appWindows) {
            $details += @{ name = $appWindow.Current.Name; id = $appWindow.Current.AutomationId;
                type = $appWindow.Current.ControlType.ProgrammaticName }
        }
    }
    if ($null -ne $dialog) {
        $elements = $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($element in $elements) {
            try {
                $details += @{ name = $element.Current.Name; id = $element.Current.AutomationId;
                    type = $element.Current.ControlType.ProgrammaticName }
            } catch { }
        }
    }
    @{ ok = $false; error = $_.Exception.Message; controls = $details } | ConvertTo-Json -Depth 5 |
        Set-Content -LiteralPath $ResultPath -Encoding UTF8
    [Console]::Error.WriteLine($_.Exception.ToString())
    [Environment]::Exit(1)
}
