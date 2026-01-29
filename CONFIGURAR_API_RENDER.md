# Configurar a API WhatsApp no Render (front na Vercel)

Guia para colocar a **whatsapp-api** no Render e conectar ao **painel de solicitações** hospedado na **Vercel**.

---

## 1. Onde cada coisa roda

| Componente | Onde | URL exemplo |
|------------|------|-------------|
| **API WhatsApp** | Render (Web Service) | `https://whatsapp-api-xxxx.onrender.com` |
| **Painel (front)** | Vercel | `https://seu-painel.vercel.app` |

O painel chama a API para enviar mensagens. A API chama o painel (auto-status) quando alguém reage com ✅/❌.

---

## 2. Deploy da API no Render

### 2.1 Conectar o repositório

1. Acesse [dashboard.render.com](https://dashboard.render.com).
2. **New** → **Web Service**.
3. Conecte o repositório **JoaoPedroAFK/whatsapp-api** (ou o que estiver usando).
4. Configure:
   - **Name:** `whatsapp-api` (ou o nome que quiser).
   - **Region:** escolha a mais próxima.
   - **Branch:** `main`.
   - **Runtime:** Node.
   - **Build Command:** `npm install`.
   - **Start Command:** `node index.js`.
   - **Instance Type:** Free (ou pago se quiser evitar sleep).

### 2.2 Disco persistente (obrigatório)

A sessão do WhatsApp fica na pasta `auth/`. Ela precisa persistir entre reinícios.

1. No serviço: **Settings** → **Disks**.
2. **Add Disk**:
   - **Name:** `auth-storage`
   - **Mount Path:** `/app/auth`
   - **Size:** 1 GB.

Sem esse disco, ao reiniciar o serviço você perde a sessão e precisa escanear o QR de novo.

### 2.3 Variáveis de ambiente (Render)

Em **Environment** do serviço, adicione:

```env
NODE_ENV=production
PORT=3000
```

**Para o auto-status por reação (✅/❌) funcionar**, use a URL do painel na **Vercel** (sem barra no final):

```env
PANEL_URL=https://seu-painel.vercel.app
```

Exemplo se o painel for `velotax-painel.vercel.app`:

```env
PANEL_URL=https://velotax-painel.vercel.app
```

Opcionais:

```env
REPLIES_STREAM_ENABLED=0
PING_ENABLED=true
PING_INTERVAL=600000
PING_DELAY=60000
```

### 2.4 Health Check (Render)

O serviço usa o endpoint `/ping` para health check. No `render.yaml` já está configurado como `/ping`. Se criar o serviço manualmente, em **Settings** → **Health Check Path** use: `/ping`.

### 2.5 Deploy e primeiro uso

1. Clique em **Create Web Service** (ou faça o deploy).
2. Quando o deploy subir, abra **Logs**.
3. Deve aparecer algo como: **ESCANEIE O QR CODE AGORA** e um QR no log.
4. Escaneie com o WhatsApp (dispositivo vinculado ao número que vai usar).
5. Depois de conectado, a API responde em:
   - `https://seu-servico.onrender.com/` → mensagem de status.
   - `https://seu-servico.onrender.com/ping` → JSON com status e uptime.
   - `https://seu-servico.onrender.com/grupos` → lista de grupos (use o `id` no painel).

Anote a **URL do serviço** (ex.: `https://whatsapp-api-xxxx.onrender.com`). Você vai usar no painel na Vercel.

---

## 3. Painel na Vercel (front)

O front continua como está; só precisa das variáveis certas na Vercel.

### 3.1 Deploy do painel na Vercel

1. Conecte o repositório do painel (ex.: **JoaoPedroAFK/velotax-painel**) na [Vercel](https://vercel.com).
2. Framework: **Next.js** (detectado automaticamente).
3. Build e deploy padrão.

### 3.2 Variáveis de ambiente (Vercel)

No projeto do painel na Vercel: **Settings** → **Environment Variables**.

| Variável | Obrigatória | Valor | Descrição |
|----------|-------------|--------|-----------|
| **DATABASE_URL** | Sim | `postgresql://...` | PostgreSQL (ex.: Supabase). |
| **NEXT_PUBLIC_API_URL** | Sim | `https://whatsapp-api-xxxx.onrender.com` | URL da API no Render, **sem** barra no final. |
| **NEXT_PUBLIC_DEFAULT_JID** | Sim | `120363400851545835@g.us` | ID do grupo para onde as solicitações vão. |

**Como obter o JID do grupo**

1. Com a API já conectada no Render, abra no navegador:
   `https://seu-servico.onrender.com/grupos`
2. Na resposta JSON, copie o `id` do grupo desejado (ex.: `120363400851545835@g.us`).
3. Cole em **NEXT_PUBLIC_DEFAULT_JID** na Vercel.

Exemplo de variáveis no painel (Vercel):

```env
DATABASE_URL=postgresql://user:pass@host:5432/db?schema=public
NEXT_PUBLIC_API_URL=https://whatsapp-api-xxxx.onrender.com
NEXT_PUBLIC_DEFAULT_JID=120363400851545835@g.us
```

Faça **Redeploy** do projeto na Vercel depois de salvar as variáveis.

---

## 4. Resumo do fluxo

1. **Render (API):**  
   - Build: `npm install`, Start: `node index.js`.  
   - Disco em `/app/auth`.  
   - Variáveis: `PORT`, `PANEL_URL` = URL do painel na Vercel.

2. **Vercel (painel):**  
   - Variáveis: `DATABASE_URL`, `NEXT_PUBLIC_API_URL` = URL da API no Render, `NEXT_PUBLIC_DEFAULT_JID` = id do grupo.

3. **Primeira vez:**  
   - Abrir os logs da API no Render, escanear o QR e aguardar “WHATSAPP CONECTADO!”.  
   - Acessar `/grupos` na API, copiar o `id` do grupo e colocar em `NEXT_PUBLIC_DEFAULT_JID`.

4. **Uso:**  
   - No painel (Vercel), o agente envia a solicitação → painel chama `POST /send` na API → mensagem vai para o grupo.  
   - Quem reagir com ✅/❌ no WhatsApp → API chama `POST {PANEL_URL}/api/requests/auto-status` → status atualizado no painel.

---

## 5. Troubleshooting

| Problema | O que verificar |
|----------|------------------|
| 503 "WhatsApp desconectado" | API no Render caiu ou perdeu sessão. Veja os logs; se perdeu `auth/`, escaneie o QR de novo. |
| Auto-status não atualiza | No Render, `PANEL_URL` deve ser exatamente a URL do painel na Vercel (sem barra final). |
| Painel não envia para o grupo | `NEXT_PUBLIC_API_URL` = URL do serviço no Render. `NEXT_PUBLIC_DEFAULT_JID` = id retornado por `/grupos`. |
| Serviço “dorme” (free) | Após ~15 min sem requisições o free tier desliga. Primeira requisição pode demorar; o ping automático (se ativo) ajuda. |

---

## 6. Referências no código

- **API:** `index.js` — `/send`, `/grupos`, `/ping`, listeners de reação e callback para `PANEL_URL/api/requests/auto-status`.
- **Painel:** `NEXT_PUBLIC_API_URL` e `NEXT_PUBLIC_DEFAULT_JID` usados no formulário de envio; `DATABASE_URL` para `/api/requests` e auto-status.
