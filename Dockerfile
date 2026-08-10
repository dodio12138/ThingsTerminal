FROM node:20-trixie-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .

RUN mkdir -p /app/data/runtime /app/public/uploads && chown -R node:node /app/data/runtime /app/public/uploads

ENV NODE_ENV=production
EXPOSE 3000

USER node

VOLUME ["/app/data/runtime", "/app/public/uploads"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
