$WebhookUrl = "https://j10-nexus-git-feature-telegram-business-connections-j1-o.vercel.app/api/webhooks/telegram"
$SecretToken = "j10_nexus_telegram_secret"

Write-Host "`n=== Sync Telegram Test Bot Webhook Secret ===" -ForegroundColor Cyan
Write-Host "Endpoint: $WebhookUrl" -ForegroundColor Gray
Write-Host "Secret: $SecretToken" -ForegroundColor Gray
Write-Host ""

$Clip = Get-Clipboard
$RawInput = ""

if ($Clip -match "(\d{8,10}:[A-Za-z0-9_-]{35})") {
    $RawInput = $Matches[1]
    Write-Host "[OK] Clean Bot Token detected in Clipboard!" -ForegroundColor Green
} else {
    $RawInput = Read-Host -Prompt "Paste your Telegram Bot Token and press Enter"
}

# Regex clean token if double-pasted
if ($RawInput -match "(\d{8,10}:[A-Za-z0-9_-]{35})") {
    $Token = $Matches[1]
} else {
    $Token = $RawInput.Trim()
}

if ([string]::IsNullOrWhiteSpace($Token)) {
    Write-Host "Error: Token cannot be empty." -ForegroundColor Red
    exit 1
}

$Payload = @{
    url = $WebhookUrl
    secret_token = $SecretToken
    allowed_updates = @(
        "message",
        "edited_message",
        "callback_query",
        "business_connection",
        "business_message",
        "edited_business_message",
        "deleted_business_messages"
    )
} | ConvertTo-Json -Depth 5

try {
    $Response = Invoke-RestMethod -Uri "https://api.telegram.org/bot$Token/setWebhook" -Method Post -Body $Payload -ContentType "application/json"
    if ($Response.ok) {
        Write-Host "`n[SUCCESS] Webhook Secret Synced and Webhook was set with Telegram!" -ForegroundColor Green
        Write-Host "Description: $($Response.description)" -ForegroundColor Green
    } else {
        Write-Host "`n[ERROR] Telegram API returned error: $($Response.description)" -ForegroundColor Red
    }
} catch {
    Write-Host "`n[ERROR] Failed to connect to Telegram API: $_" -ForegroundColor Red
}

$Token = $null
$RawInput = $null
$Clip = $null
