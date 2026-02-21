param(
  [switch]$Api,
  [switch]$Web,
  [switch]$Infra
)

if ($Infra) {
  docker compose -f .\infra\docker-compose.yml up -d postgres redis
}

if ($Api) {
  Push-Location .\apps\api
  if (!(Test-Path .\.venv)) {
    python -m venv .venv
  }
  .\.venv\Scripts\Activate.ps1
  pip install -e .
  uvicorn app.main:app --reload --port 4000
  Pop-Location
}

if ($Web) {
  Push-Location .\apps\web
  npm install
  npm run dev
  Pop-Location
}
