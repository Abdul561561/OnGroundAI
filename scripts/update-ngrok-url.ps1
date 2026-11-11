<#
.SYNOPSIS
    Syncs the active ngrok HTTPS forwarding URL into backend/.env as PUBLIC_BASE_URL.
.DESCRIPTION
    Queries ngrok's local inspection API (http://127.0.0.1:4040/api/tunnels) for the active HTTPS tunnel,
    updates PUBLIC_BASE_URL in backend/.env without touching or printing secrets,
    and prints the exact Twilio webhook URLs to configure in Twilio Console.
.EXAMPLE
    .\scripts\update-ngrok-url.ps1
    .\scripts\update-ngrok-url.ps1 -PublicUrl https://abcd-1234.ngrok-free.app
#>
param(
    [string]$PublicUrl = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$EnvPath = Join-Path $RepoRoot "backend\.env"

if (-not (Test-Path $EnvPath)) {
    throw "backend\.env was not found at $EnvPath. Copy backend\.env.example first."
}

if ([string]::IsNullOrWhiteSpace($PublicUrl)) {
    try {
        $tunnelsResp = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 3
    } catch {
        throw "Could not reach ngrok inspection API at http://127.0.0.1:4040. Start 'ngrok http 8000' in another terminal first, or pass -PublicUrl https://<host>."
    }

    $httpsTunnel = $tunnelsResp.tunnels | Where-Object { $_.public_url -like "https://*" } | Select-Object -First 1
    if (-not $httpsTunnel) {
        throw "No active HTTPS ngrok tunnel found on port 4040. Ensure 'ngrok http 8000' is running."
    }
    $PublicUrl = $httpsTunnel.public_url
}

$PublicUrl = $PublicUrl.Trim().TrimEnd("/")
if ($PublicUrl -notmatch "^https://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}") {
    throw "Invalid PUBLIC_BASE_URL '$PublicUrl'. Must be a publicly accessible HTTPS URL."
}

$rawLines = Get-Content -Path $EnvPath -Encoding UTF8
$updated = $false
$newLines = foreach ($line in $rawLines) {
    if ($line -match "^\s*PUBLIC_BASE_URL\s*=") {
        $updated = $true
        "PUBLIC_BASE_URL=$PublicUrl"
    } else {
        $line
    }
}
if (-not $updated) {
    $newLines += "PUBLIC_BASE_URL=$PublicUrl"
}

[System.IO.File]::WriteAllLines($EnvPath, $newLines, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "Updated PUBLIC_BASE_URL in backend/.env -> $PublicUrl" -ForegroundColor Green
Write-Host ""
Write-Host "Twilio Webhook URLs:" -ForegroundColor Cyan
Write-Host "  Voice Webhook (A call comes in, HTTP POST): $PublicUrl/api/telephony/webhook/voice"
Write-Host "  Status Callback (HTTP POST):                $PublicUrl/api/telephony/webhook/status"
Write-Host ""

try {
    $status = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/telephony/status" -TimeoutSec 10
    Write-Host "FastAPI backend live check:" -ForegroundColor Cyan
    Write-Host "  public_webhook_ready : $($status.public_webhook_ready)"
    Write-Host "  is_operational       : $($status.is_operational)"
    Write-Host "  status message       : $($status.message)"
} catch {
    Write-Host "Note: FastAPI does not appear to be running on port 8000 yet; start uvicorn to activate." -ForegroundColor Yellow
}
