FROM node:20-alpine

WORKDIR /app

# Instalar dependências do sistema
RUN apk add --no-cache \
    ffmpeg \
    imagemagick \
    && rm -rf /var/cache/apk/*

# Copiar package.json
COPY package*.json ./

# Instalar dependências Node.js
RUN npm ci --only=production && npm cache clean --force

# Copiar código fonte
COPY . .

# Criar diretório para autenticação com permissões corretas
RUN mkdir -p auth && chown -R node:node /app

# Mudar para usuário não-root
USER node

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/status', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Iniciar aplicação
CMD ["node", "index.js"]
