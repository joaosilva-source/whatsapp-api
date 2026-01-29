# Guia de Deploy - WhatsApp API

## 🚀 Visão Geral

API WhatsApp construída com Express + Baileys para envio de mensagens e gerenciamento de conexão.

## 📁 Estrutura do Projeto

```
whatsapp-api/
├── index.js          # Servidor principal
├── package.json      # Dependências
├── auth/            # Sessão WhatsApp
├── node_modules/    # Dependências instaladas
└── DEPLOY.md        # Este arquivo
```

## 🌐 Opções de Deploy

### Opção 1: Render (Recomendado)
Ideal para APIs Node.js com suporte a persistência de dados.

#### Passos:
1. **Criar conta em [render.com](https://render.com)**

2. **Criar Web Service**
   - Type: Web Service
   - Name: whatsapp-api
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `node index.js`

3. **Variáveis de Ambiente**
   ```
   NODE_ENV=production
   PORT=3000
   ```

4. **Deploy Automático**
   - Conecte ao GitHub/GitLab
   - Render fará deploy automático a cada push

### Opção 2: Railway
Simples e rápido para APIs.

#### Passos:
1. **Instalar CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login e Deploy**
   ```bash
   cd whatsapp-api
   railway login
   railway init
   railway up
   ```

3. **Configurar Variáveis**
   ```bash
   railway variables set NODE_ENV=production
   railway variables set PORT=3000
   ```

### Opção 3: Vercel
Para APIs serverless.

#### Criar vercel.json:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "index.js"
    }
  ]
}
```

#### Deploy:
```bash
npm install -g vercel
vercel --prod
```

### Opção 4: Docker + VPS
Máximo controle e performance.

#### Criar Dockerfile:
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copiar package.json
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production

# Copiar código fonte
COPY . .

# Criar diretório para autenticação
RUN mkdir -p auth

# Expor porta
EXPOSE 3000

# Iniciar aplicação
CMD ["node", "index.js"]
```

#### Criar docker-compose.yml:
```yaml
version: '3.8'
services:
  whatsapp-api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    volumes:
      - ./auth:/app/auth
    restart: unless-stopped
```

#### Deploy:
```bash
docker-compose up -d --build
```

## 🔧 Configurações Importantes

### 1. Persistência de Sessão
A pasta `auth/` contém a sessão WhatsApp. É crucial que ela persista entre reinicializações.

#### Render:
- Usa persistência automática
- A pasta `auth/` será mantida

#### Railway:
- Adicionar volume no deploy:
  ```yaml
  volumes:
    - /app/auth
  ```

#### Docker:
- Mapear volume: `./auth:/app/auth`

#### VPS:
- A pasta `auth/` persiste no filesystem

### 2. Variáveis de Ambiente
Criar `.env`:
```env
NODE_ENV=production
PORT=3000
```

### 3. Segurança
- Adicionar autenticação nas rotas
- Usar HTTPS em produção
- Limitar taxa de requisições

## 📋 Pré-Deploy Checklist

### 1. Testes Locais
```bash
# Instalar dependências
npm install

# Iniciar servidor
node index.js

# Testar endpoints
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{"jid":"1234567890@s.whatsapp.net","mensagem":"Teste"}'
```

### 2. Verificar Conexão
- Escanear QR code no primeiro deploy
- Verificar logs para confirmação de conexão
- Testar envio de mensagens

### 3. Performance
- Monitorar uso de memória
- Verificar limites do plano
- Configurar health checks

## 🚀 Comandos de Deploy

### Render
```bash
# Via CLI
railway up

# Via GitHub (automático)
git push origin main
```

### Railway
```bash
# Deploy manual
railway up

# Deploy automático (com GitHub)
git push origin main
```

### Vercel
```bash
# Deploy produção
vercel --prod

# Deploy preview
vercel
```

### Docker
```bash
# Build e run
docker-compose up -d --build

# Verificar logs
docker-compose logs -f

# Parar
docker-compose down
```

## 🔍 Monitoramento e Logs

### Render
- Acessar dashboard.render.com
- Verificar logs em tempo real
- Monitorar métricas

### Railway
- Acessar railway.app
- Logs disponíveis no dashboard
- Métricas básicas

### Docker
```bash
# Logs do container
docker-compose logs -f whatsapp-api

# Estatísticas
docker stats whatsapp-api

# Reiniciar se necessário
docker-compose restart whatsapp-api
```

## 🆘 Troubleshooting

### Problemas Comuns

1. **QR Code não aparece**
   - Verificar logs
   - Limpar pasta `auth/`
   - Reiniciar aplicação

2. **Conexão cai frequentemente**
   - Aumentar keepAliveIntervalMs
   - Verificar qualidade da internet
   - Configurar reconexão automática

3. **Mensagens não enviam**
   - Verificar se está conectado
   - Validar formato do JID
   - Checar limites de taxa

4. **Erro de permissão**
   - Verificar permissões da pasta `auth/`
   - Criar pasta se não existir

### Logs Úteis
```bash
# Verificar conexão
console.log('WhatsApp conectado:', isConnected);

# Debug de mensagens
console.log('Enviando mensagem:', jid, mensagem);

// Adicionar mais logs em index.js se necessário
```

## 📊 Endpoints da API

### POST /send
Envia mensagem de texto ou com mídia.

```bash
curl -X POST https://sua-api.render.com/send \
  -H "Content-Type: application/json" \
  -d '{
    "jid": "1234567890@s.whatsapp.net",
    "mensagem": "Olá! Teste da API",
    "imagens": ["data:image/jpeg;base64,..."],
    "videos": ["data:video/mp4;base64,..."]
  }'
```

### GET /status
Verifica status da conexão.

```bash
curl https://sua-api.render.com/status
```

### GET /qr
Retorna QR code (se não conectado).

```bash
curl https://sua-api.render.com/qr
```

## 🎯 Recomendações

### Para Produção:
1. **Render** - Mais simples e confiável
2. Configurar health checks
3. Monitorar uso de recursos
4. Backup regular da pasta `auth/`

### Para Desenvolvimento:
1. **Local** - Testes rápidos
2. **Railway** - Preview deployments
3. **Docker** - Ambiente consistente

### Para Alta Performance:
1. **VPS Docker** - Máximo controle
2. Load balancing
3. Redis para cache
4. Monitoramento avançado

---

## 🚀 Deploy Rápido (Render)

```bash
# 1. Fazer commit das mudanças
git add .
git commit -m "Deploy WhatsApp API"
git push origin main

# 2. Configurar no Render
# - Conectar repositório
# - Adicionar variáveis de ambiente
# - Fazer deploy

# 3. Testar API
curl https://seu-app.render.com/status
```

Pronto! Sua API WhatsApp estará no ar.
