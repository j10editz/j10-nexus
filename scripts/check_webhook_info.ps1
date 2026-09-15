$Clip = Get-Clipboard
$Token = ""

if ($Clip -match "^\d{8,10}:[A-Za-z0-9_-]{35}$") {
    $Token = $Clip.Trim()
} else {
    $Token = Read-Host -Prompt "Paste Bot Token"
    $Token = $Token.Trim()
}

try {
    $Info = Invoke-RestMethod -Uri "https://api.telegram.org/bot$Token/getWebhookInfo"
    Write-Host "`n=== Telegram Webhook Status ===" -ForegroundColor Cyan
    Write-Host "URL: $($Info.result.url)"
    Write-Host "Has Custom Certificate: $($Info.result.has_custom_certificate)"
    Write-Host "Pending Update Count: $($Info.result.pending_update_count)"
    Write-Host "Last Error Date: $($Info.result.last_error_date)"
    Write-Host "Last Error Message: $($Info.result.last_error_message)"
    Write-Host "Max Connections: $($Info.result.max_connections)"
    Write-Host "Allowed Updates: $($Info.result.allowed_updates -join ', ')"
} catch {
    Write-Host "Error fetching webhook info: $_" -ForegroundColor Red
}
