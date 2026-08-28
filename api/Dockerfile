FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++ linux-headers
COPY package.json ./
RUN npm install --omit=dev

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY package.json server.js sow-schema.js ./
COPY templates/sow-template.docx ./templates/sow-template.docx

ENV NODE_ENV=production
ENV DB_PATH=/data/quotes.db
VOLUME ["/data"]

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://127.0.0.1:3001/healthz || exit 1
CMD ["node", "server.js"]
