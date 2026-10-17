# Production deployment notes

Use `nginx.conf.example` behind a real domain and provide certificates from
your certificate manager (for example, Let's Encrypt). Do not expose ports
6379 or 3000 publicly. Expose only HTTPS through the reverse proxy.

Set these secrets outside source control:

- `TENDRIL_API_TOKEN`
- `TENDRIL_API_TOKENS` (optional comma-separated rotation set)
- `FALKORDB_PASSWORD` (when authentication is enabled)
- TLS certificate and private key files

Set `TENDRIL_RATE_LIMIT_REDIS_URL` to a shared Redis-compatible endpoint when
running more than one API replica. The Docker stack defaults this to FalkorDB's
Redis endpoint so the local stack shares limits across API processes.
