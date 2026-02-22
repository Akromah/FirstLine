param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

function Set-EnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Key,
    [Parameter(Mandatory = $true)][string]$Value
  )
  $lines = @()
  if (Test-Path $Path) {
    $lines = Get-Content -Path $Path
  }
  $updated = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s*$Key=") {
      $lines[$i] = "$Key=$Value"
      $updated = $true
    }
  }
  if (-not $updated) {
    $lines += "$Key=$Value"
  }
  Set-Content -Path $Path -Value $lines -Encoding ascii
}

function Stop-ListenersOnPort {
  param([int]$Port)
  $connections = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  if (-not $connections) { return }
  $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $processIds) {
    if ($processId -gt 0 -and $processId -ne $PID) {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
  }
}

function Wait-TryCloudflareUrl {
  param(
    [Parameter(Mandatory = $true)][string]$LogPath,
    [int]$TimeoutSec = 90
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $LogPath) {
      $raw = Get-Content $LogPath -Raw -ErrorAction SilentlyContinue
      if ($raw -match "https://[-a-z0-9]+\.trycloudflare\.com") {
        return $matches[0]
      }
    }
    Start-Sleep -Seconds 1
  }
  throw "Timed out waiting for tunnel URL in $LogPath"
}

function Wait-HttpUp {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [int]$TimeoutSec = 70
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $null = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 4
      return
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  throw "Timed out waiting for $Url"
}

$cloudflaredExe = "C:\Users\jared\tools\cloudflared\cloudflared.exe"
if (-not (Test-Path $cloudflaredExe)) {
  throw "cloudflared not found at $cloudflaredExe. Download it first."
}

$apiDir = Join-Path $ProjectRoot "apps\api"
$webDir = Join-Path $ProjectRoot "apps\web"
$apiPython = Join-Path $apiDir ".venv\Scripts\python.exe"
$apiEnvPath = Join-Path $apiDir ".env"
$webEnvPath = Join-Path $webDir ".env"
$sessionPath = Join-Path $ProjectRoot ".firstline-remote-session.json"
$logDir = Join-Path $ProjectRoot ".remote-logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$apiTunnelLog = Join-Path $logDir "cloudflared-api.log"
$apiTunnelErr = Join-Path $logDir "cloudflared-api.err.log"
$webTunnelLog = Join-Path $logDir "cloudflared-web.log"
$webTunnelErr = Join-Path $logDir "cloudflared-web.err.log"

if (-not (Test-Path $apiPython)) {
  throw "API venv not found at $apiPython"
}

Write-Host "Stopping listeners on ports 4000 and 5173..."
Stop-ListenersOnPort -Port 4000
Stop-ListenersOnPort -Port 5173
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Remove-Item $apiTunnelLog, $apiTunnelErr, $webTunnelLog, $webTunnelErr -ErrorAction SilentlyContinue

Write-Host "Starting Cloudflare tunnel for API..."
$apiTunnelProc = Start-Process -FilePath $cloudflaredExe `
  -ArgumentList @("tunnel", "--url", "http://localhost:4000") `
  -RedirectStandardOutput $apiTunnelLog `
  -RedirectStandardError $apiTunnelErr `
  -PassThru

Write-Host "Starting Cloudflare tunnel for Web..."
$webTunnelProc = Start-Process -FilePath $cloudflaredExe `
  -ArgumentList @("tunnel", "--url", "http://localhost:5173") `
  -RedirectStandardOutput $webTunnelLog `
  -RedirectStandardError $webTunnelErr `
  -PassThru

$apiPublicUrl = Wait-TryCloudflareUrl -LogPath $apiTunnelLog -TimeoutSec 90
$webPublicUrl = Wait-TryCloudflareUrl -LogPath $webTunnelLog -TimeoutSec 90

Set-EnvValue -Path $apiEnvPath -Key "CORS_ORIGINS" -Value "[`"http://localhost:5173`",`"http://127.0.0.1:5173`",`"$webPublicUrl`"]"
Set-EnvValue -Path $webEnvPath -Key "VITE_API_BASE_URL" -Value $apiPublicUrl
Set-EnvValue -Path $webEnvPath -Key "VITE_MAP_STYLE_URL" -Value "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"

Write-Host "Starting API..."
$apiProc = Start-Process -FilePath $apiPython -WorkingDirectory $apiDir -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4000", "--reload") -PassThru
Wait-HttpUp -Url "http://127.0.0.1:4000/health" -TimeoutSec 90

Write-Host "Starting Web..."
$webProc = Start-Process -FilePath "npm.cmd" -WorkingDirectory $webDir -ArgumentList @("run", "dev", "--", "--host", "0.0.0.0", "--port", "5173") -PassThru
Wait-HttpUp -Url "http://127.0.0.1:5173" -TimeoutSec 90

$session = [ordered]@{
  started_at = (Get-Date).ToString("o")
  project_root = $ProjectRoot
  method = "cloudflared"
  web_public_url = $webPublicUrl
  api_public_url = $apiPublicUrl
  pids = @{
    web_tunnel = $webTunnelProc.Id
    api_process = $apiProc.Id
    api_tunnel = $apiTunnelProc.Id
    web_process = $webProc.Id
  }
  logs = @{
    web_tunnel = $webTunnelLog
    api_tunnel = $apiTunnelLog
  }
}
$session | ConvertTo-Json -Depth 6 | Set-Content -Path $sessionPath -Encoding ascii

Write-Host ""
Write-Host "FirstLine remote debug session is up (Cloudflare):"
Write-Host "  Web URL: $webPublicUrl"
Write-Host "  API URL: $apiPublicUrl"
Write-Host ""
Write-Host "Session file: $sessionPath"
