$Host.UI.RawUI.WindowTitle = "J10 NEXUS - Secure Telegram Bot Token Entry"
Clear-Host
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "       J10 NEXUS: SECURE PRODUCTION TELEGRAM TOKEN ENTRY          " -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Flow: hidden input -> transient memory -> getMe -> AES-256-GCM vault -> setWebhook -> zero memory" -ForegroundColor Green
Write-Host ""
Write-Host "Instructions:" -ForegroundColor Yellow
Write-Host "1. Revoke and copy the replacement BotFather token in Telegram." -ForegroundColor Yellow
Write-Host "2. Paste the token below. Input is masked and never displayed, logged, or saved to file." -ForegroundColor Yellow
Write-Host "3. Press Enter to rotate production vault & register webhook." -ForegroundColor Yellow
Write-Host ""

$sec = Read-Host -Prompt "Enter Replacement Bot Token" -AsSecureString
if ($null -eq $sec) {
    Write-Host "No token entered. Aborted." -ForegroundColor Red
    Start-Sleep -Seconds 3
    exit 1
}

$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$token = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
$sec = $null

if (-not ($token -match "^\d+:[A-Za-z0-9_-]+$")) {
    $token = $null
    Write-Host "Invalid Telegram bot token format. Must be <bot_id>:<secret>." -ForegroundColor Red
    Start-Sleep -Seconds 5
    exit 1
}

Write-Host "`nEncrypting into production vault and registering webhook..." -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $scriptDir) { $scriptDir = $PSScriptRoot }
if (-not $scriptDir) { $scriptDir = "c:\Users\riche\OneDrive\Desktop\J10 NEXUS\j10-nexus\scripts" }
$projectDir = Split-Path -Parent $scriptDir
if ($projectDir -and (Test-Path $projectDir)) {
    Set-Location $projectDir
}

$applyScript = Join-Path $scriptDir "apply_vault_rotation.js"
$token | node "$applyScript"
$token = $null

Write-Host "`nProcess finished. Press any key to close this window..." -ForegroundColor Green
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
