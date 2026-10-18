# Tendril backend

This directory packages the Tendril API and its local FalkorDB dependency.
The Next.js frontend is deployed separately to Vercel.

## Local backend stack

Run these commands from the repository root:

```powershell
docker compose -f backend/docker-compose.yml up --build -d
```

The services are available at:

- API: `http://localhost:8787`
- FalkorDB browser: `http://localhost:3002`

Stop them with:

```powershell
docker compose -f backend/docker-compose.yml down
```

The API requires these values in the repository `.env` file:

```env
TENDRIL_API_TOKEN=your-long-random-token
TENDRIL_ALLOWED_ORIGINS=http://localhost:3000
```

## Render deployment

Create a Render Docker web service with:

- Dockerfile path: `backend/Dockerfile`
- Docker build context: repository root
- Health check path: `/health`

Set these Render environment variables:

```env
NODE_ENV=production
FALKORDB_HOST=your-falkordb-host
FALKORDB_PORT=6379
TENDRIL_GRAPH=tendril
TENDRIL_API_PORT=10000
TENDRIL_API_TOKEN=your-long-random-token
TENDRIL_ALLOWED_ORIGINS=https://your-frontend.vercel.app
TENDRIL_RATE_LIMIT_REDIS_URL=redis://your-falkordb-host:6379
```

Render provides the public service port through `PORT`; configure the service
to expose port `10000` and set `TENDRIL_API_PORT=10000`.

FalkorDB must run as a persistent service reachable by the API, such as a
FalkorDB-hosted deployment or a persistent private Docker service. Do not use
`localhost` for `FALKORDB_HOST` in Render.
