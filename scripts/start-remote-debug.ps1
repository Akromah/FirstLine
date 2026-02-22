param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$NgrokAuthToken = "",
  [switch]$InstallNgrokIfMissing
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
  $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($pid in $pids) {
    if ($pid -gt 0 -and $pid -ne $PID) {
      Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
  }
}

function Wait-HttpUp {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [int]$TimeoutSec = 60
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

function Wait-NgrokPublicUrl {
  param(
    [int]$ApiPort,
    [int]$TimeoutSec = 45
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/tunnels" -TimeoutSec 4
      $httpsTunnel = $response.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1
      if ($httpsTunnel -and $httpsTunnel.public_url) {
        return [string]$httpsTunnel.public_url
      }
    } catch {
      Start-Sleep -Seconds 1
      continue
    }
    Start-Sleep -Seconds 1
  }
  throw "Timed out waiting for ngrok tunnel on 127.0.0.1:$ApiPort"
}

function Require-Command {
  param(
    [Parameter(Mandatory = $true)][string]$Name
  )
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }
  return $null
}

$ngrokExe = Require-Command "ngrok"
if (-not $ngrokExe) {
  if ($InstallNgrokIfMissing) {
    winget install ngrok.ngrok --silent --accept-package-agreements --accept-source-agreements | Out-Null
    $ngrokExe = Require-Command "ngrok"
  }
}
if (-not $ngrokExe) {
  throw "ngrok is not installed. Install it first (winget install ngrok.ngrok)."
}

$npmCmd = Require-Command "npm.cmd"
if (-not $npmCmd) {
  throw "npm.cmd not found in PATH."
}

$apiDir = Join-Path $ProjectRoot "apps\api"
$webDir = Join-Path $ProjectRoot "apps\web"
$apiPython = Join-Path $apiDir ".venv\Scripts\python.exe"
$apiEnvPath = Join-Path $apiDir ".env"
$webEnvPath = Join-Path $webDir ".env"
$sessionPath = Join-Path $ProjectRoot ".firstline-remote-session.json"

if (-not (Test-Path $apiPython)) {
  throw "API venv not found at $apiPython. Create it first: cd apps\api; python -m venv .venv; .\.venv\Scripts\pip install -e ."
}

if (-not (Test-Path $webDir)) {
  throw "Web directory not found at $webDir"
}

if (-not (Test-Path $apiDir)) {
  throw "API directory not found at $apiDir"
}

if ($NgrokAuthToken.Trim()) {
  & $ngrokExe config add-authtoken $NgrokAuthToken | Out-Null
}

Write-Host "Stopping listeners on ports 4000, 5173, 4040, 4041..."
Stop-ListenersOnPort -Port 4000
Stop-ListenersOnPort -Port 5173
Stop-ListenersOnPort -Port 4040
Stop-ListenersOnPort -Port 4041

Write-Host "Starting ngrok tunnel for web (port 5173)..."
$webTunnelProc = Start-Process -FilePath $ngrokExe -ArgumentList @("http", "5173", "--web-addr=127.0.0.1:4040") -PassThru
$webPublicUrl = Wait-NgrokPublicUrl -ApiPort 4040

$corsJson = "[`"http://localhost:5173`",`"http://127.0.0.1:5173`",`"$webPublicUrl`"]"
Set-EnvValue -Path $apiEnvPath -Key "CORS_ORIGINS" -Value $corsJson

Write-Host "Starting API on port 4000..."
$apiProc = Start-Process -FilePath $apiPython -WorkingDirectory $apiDir -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4000", "--reload") -PassThru
Wait-HttpUp -Url "http://127.0.0.1:4000/health" -TimeoutSec 70

Write-Host "Starting ngrok tunnel for API (port 4000)..."
$apiTunnelProc = Start-Process -FilePath $ngrokExe -ArgumentList @("http", "4000", "--web-addr=127.0.0.1:4041") -PassThru
$apiPublicUrl = Wait-NgrokPublicUrl -ApiPort 4041

Set-EnvValue -Path $webEnvPath -Key "VITE_API_BASE_URL" -Value $apiPublicUrl
Set-EnvValue -Path $webEnvPath -Key "VITE_MAP_STYLE_URL" -Value "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"

Write-Host "Starting web dev server on port 5173..."
$webProc = Start-Process -FilePath $npmCmd -WorkingDirectory $webDir -ArgumentList @("run", "dev", "--", "--host", "0.0.0.0", "--port", "5173") -PassThru
Wait-HttpUp -Url "http://127.0.0.1:5173" -TimeoutSec 70

$session = [ordered]@{
  started_at = (Get-Date).ToString("o")
  project_root = $ProjectRoot
  web_public_url = $webPublicUrl
  api_public_url = $apiPublicUrl
  pids = @{
    web_tunnel = $webTunnelProc.Id
    api_process = $apiProc.Id
    api_tunnel = $apiTunnelProc.Id
    web_process = $webProc.Id
  }
}
$session | ConvertTo-Json -Depth 5 | Set-Content -Path $sessionPath -Encoding ascii

Write-Host ""
Write-Host "FirstLine remote debug session is up:"
Write-Host "  Web URL: $webPublicUrl"
Write-Host "  API URL: $apiPublicUrl"
Write-Host ""
Write-Host "Session file:"
Write-Host "  $sessionPath"
Write-Host ""
Write-Host "To stop everything, run:"
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$ProjectRoot\scripts\stop-remote-debug.ps1`""
