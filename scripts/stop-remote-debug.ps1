param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "SilentlyContinue"

function Stop-ListenersOnPort {
  param([int]$Port)
  $connections = Get-NetTCPConnection -State Listen -LocalPort $Port
  if (-not $connections) { return }
  $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $processIds) {
    if ($processId -gt 0 -and $processId -ne $PID) {
      Stop-Process -Id $processId -Force
    }
  }
}

$sessionPath = Join-Path $ProjectRoot ".firstline-remote-session.json"
if (Test-Path $sessionPath) {
  $session = Get-Content $sessionPath | ConvertFrom-Json
  $pidValues = @(
    $session.pids.web_tunnel,
    $session.pids.api_process,
    $session.pids.api_tunnel,
    $session.pids.web_process
  ) | Where-Object { $_ }
  foreach ($processId in $pidValues) {
    Stop-Process -Id ([int]$processId) -Force
  }
  Remove-Item $sessionPath -Force
}

Stop-ListenersOnPort -Port 4000
Stop-ListenersOnPort -Port 5173
Stop-ListenersOnPort -Port 4040
Stop-ListenersOnPort -Port 4041

Write-Host "FirstLine remote debug session stopped."
