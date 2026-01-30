# API no Render + Painel na Vercel — Passo a passo resumido

---

## Parte 1: API no Render

### 1. Criar o serviço

1. [dashboard.render.com](https://dashboard.render.com) → **New** → **Web Service**
2. Conecte o repo **JoaoPedroAFK/whatsapp-api**
3. Preencha:

| Campo | Valor |
|-------|--------|
| **Name** | `whatsapp-api` |
| **Branch** | `main` |
| **Runtime** | Node |
| **Build Command** | `npm install` (não use `npm start` aqui) |
| **Start Command** | `npm start` ou `node index.js` |
| **Instance Type** | Free (ou pago) |

4. **Health Check Path:** `/ping`

### 2. Disco (obrigatório)

**Settings** → **Disks** → **Add Disk**

| Campo | Valor |
|-------|--------|
| **Name** | `auth-storage` |
| **Mount Path** | `/app/auth` |
| **Size** | 1 GB |

### 3. Variáveis de ambiente (Render)

**Environment** → **Add Environment Variable** — cole cada linha ou adicione uma a uma:

```
NODE_ENV=production
PORT=3000
PANEL_URL=https://SEU-PAINEL.vercel.app
```

Troque `https://SEU-PAINEL.vercel.app` pela URL real do painel na Vercel (sem barra no final).

Opcionais (evitar sleep / respostas citadas):

```
PING_ENABLED=true
PING_INTERVAL=600000
PING_DELAY=60000
REPLIES_STREAM_ENABLED=0
```

### 4. Deploy e QR

1. **Create Web Service**
2. Abra **Logs** → quando aparecer o QR, escaneie com o WhatsApp
3. Anote a URL do serviço (ex.: `https://whatsapp-api-xxxx.onrender.com`)
4. No navegador: `https://whatsapp-api-xxxx.onrender.com/grupos` → copie o **id** do grupo (ex.: `120363400851545835@g.us`) para usar no painel

---

## Parte 2: Painel na Vercel

### 1. Deploy

1. [vercel.com](https://vercel.com) → **Add New** → **Project**
2. Importe o repo **JoaoPedroAFK/velotax-painel**
3. Framework: Next.js (automático) → **Deploy**

### 2. Variáveis de ambiente (Vercel)

**Settings** → **Environment Variables** — adicione:

```
DATABASE_URL=postgresql://USUARIO:SENHA@HOST:5432/BANCO?schema=public
NEXT_PUBLIC_API_URL=https://whatsapp-api-xxxx.onrender.com
NEXT_PUBLIC_DEFAULT_JID=120363400851545835@g.us
```

Substitua:

- **DATABASE_URL:** sua connection string do Postgres (Supabase ou outro)
- **NEXT_PUBLIC_API_URL:** URL do serviço no Render (a que você anotou), sem barra no final
- **NEXT_PUBLIC_DEFAULT_JID:** o `id` que você copiou de `/grupos`

Depois: **Redeploy** do projeto.

---

## Resumo das variáveis

### Render (API)

| Nome | Valor (exemplo) |
|------|------------------|
| NODE_ENV | `production` |
| PORT | `3000` |
| PANEL_URL | `https://velotax-painel.vercel.app` |

### Vercel (Painel)

| Nome | Valor (exemplo) |
|------|------------------|
| DATABASE_URL | `postgresql://user:pass@host:5432/db?schema=public` |
| NEXT_PUBLIC_API_URL | `https://whatsapp-api-xxxx.onrender.com` |
| NEXT_PUBLIC_DEFAULT_JID | `120363400851545835@g.us` |

---

## Ordem recomendada

1. Deploy da **API no Render** (disco + variáveis) → escanear QR
2. Abrir **/grupos** na API e copiar o **id** do grupo
3. Deploy do **painel na Vercel** com as 3 variáveis (incluindo o id em NEXT_PUBLIC_DEFAULT_JID)
4. No Render, conferir se **PANEL_URL** é a URL do painel na Vercel

Pronto: envio pelo painel e auto-status por reação ✅/❌ funcionando.
