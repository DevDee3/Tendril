FROM node:20-alpine

WORKDIR /app

# The backend uses the root dependency manifest while keeping its deployment
# configuration in this directory. Render should use the repository root as
# the Docker build context and this file as the Dockerfile path.
COPY package*.json ./
RUN npm ci --omit=dev

COPY tools ./tools
COPY lib ./lib
COPY ingest ./ingest
COPY agent ./agent

ENV NODE_ENV=production
ENV TENDRIL_API_PORT=8787

EXPOSE 8787
USER node
CMD ["node", "tools/server.js"]
