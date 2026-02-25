# whatsapp-api - Fly.io / Docker
# Node 20 LTS
FROM node:20-alpine

WORKDIR /app

# Dependências
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Código
COPY index.js ./

# Porta (Fly usa PORT do ambiente)
ENV PORT=3000
EXPOSE 3000

CMD ["node", "index.js"]
