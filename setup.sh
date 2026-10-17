#!/usr/bin/env bash
set -euo pipefail

command -v docker >/dev/null 2>&1 || { echo "Docker is not installed or Docker is not running."; exit 1; }

if [ ! -f .env ]; then cp .env.example .env; fi
if grep -q '^TENDRIL_API_TOKEN=replace-with-a-long-random-token' .env || ! grep -q '^TENDRIL_API_TOKEN=.' .env; then
  token="$(openssl rand -hex 32)"
  if grep -q '^TENDRIL_API_TOKEN=' .env; then
    sed -i.bak "s/^TENDRIL_API_TOKEN=.*/TENDRIL_API_TOKEN=$token/" .env
  else
    printf '\nTENDRIL_API_TOKEN=%s\n' "$token" >> .env
  fi
  rm -f .env.bak
fi

docker compose up --build -d
for attempt in $(seq 1 30); do
  if curl -fsS http://localhost:8787/ready >/dev/null; then
    echo "Tendril is ready. Open http://localhost:3001"
    exit 0
  fi
  sleep 2
done
echo "Tendril did not become ready. Run: docker compose logs tendril-api" >&2
exit 1
