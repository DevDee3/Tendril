FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY tools ./tools
COPY lib ./lib
COPY ingest ./ingest
COPY agent ./agent

ENV TENDRIL_API_PORT=8787
EXPOSE 8787
USER node
CMD ["node", "tools/server.js"]
