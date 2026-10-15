$ErrorActionPreference = 'Stop'
$appUri = 'https://ajabo1113-sudo.github.io/benchpilot-mobile/'

$browserCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe"
)
$browser = $browserCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $browser) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('Please install Microsoft Edge or Google Chrome to open BenchPilot.', 'BenchPilot') | Out-Null
    exit 1
}

Start-Process -FilePath $browser -ArgumentList "--app=$appUri"
