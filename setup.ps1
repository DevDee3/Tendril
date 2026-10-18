$ErrorActionPreference = "Stop"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is not installed or Docker Desktop is not running. Install Docker Desktop, start it, and run this script again."
}

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
}

$envLines = Get-Content ".env"
$tokenLine = $envLines | Where-Object { $_ -match '^TENDRIL_API_TOKEN=' } | Select-Object -First 1
$token = if ($tokenLine) { ($tokenLine -split "=", 2)[1].Trim() } else { "" }
if ([string]::IsNullOrWhiteSpace($token) -or $token -eq "replace-with-a-long-random-token") {
  $bytes = [byte[]]::new(32)
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  $token = ([BitConverter]::ToString($bytes) -replace "-", "").ToLowerInvariant()
  if ($tokenLine) {
    $envLines = $envLines | ForEach-Object { if ($_ -match '^TENDRIL_API_TOKEN=') { "TENDRIL_API_TOKEN=$token" } else { $_ } }
  } else {
    $envLines += "TENDRIL_API_TOKEN=$token"
  }
  Set-Content ".env" $envLines
}

docker compose up --build -d
Write-Host "Waiting for Tendril API..."
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  try {
    $health = Invoke-RestMethod "http://localhost:8787/ready" -TimeoutSec 2
    if ($health.ok) { break }
  } catch { }
  Start-Sleep -Seconds 2
  if ($attempt -eq 29) { throw "Tendril did not become ready. Run: docker compose logs tendril-api" }
}

Write-Host "Tendril is ready. Open http://localhost:3001"
