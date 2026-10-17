param(
  [string]$OutputDirectory = "backups"
)

$ErrorActionPreference = "Stop"
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $resolvedOutput "falkordb-$stamp.rdb"

docker compose exec -T falkordb redis-cli BGSAVE | Out-Host
Start-Sleep -Seconds 3
docker cp tendril-falkordb:/data/dump.rdb $target
Write-Output "FalkorDB backup written to $target"
