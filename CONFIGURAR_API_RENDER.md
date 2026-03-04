# API no Render + Painel (Vercel ou Netlify) — Passo a passo resumido

**Exemplo de API no Render:** `https://whatsapp-api-y40p.onrender.com`

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
PANEL_URL=https://painel-velotax.netlify.app
```

Se o painel estiver na Vercel, use a URL do painel na Vercel (ex.: `https://seu-painel.vercel.app`). Sem barra no final.

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

## Parte 2: Painel (Netlify ou Vercel)

### Painel na Netlify

1. [app.netlify.com](https://app.netlify.com) → Site do painel (ex.: **painel-velotax**)
2. **Site configuration** → **Environment variables** → **Add a variable** / **Edit**
3. Defina:

| Nome | Valor |
|------|--------|
| **NEXT_PUBLIC_API_URL** | `https://whatsapp-api-y40p.onrender.com` (sem barra no final) |
| **NEXT_PUBLIC_DEFAULT_JID** | ID do grupo (ex.: `120363400851545835@g.us`) — copie de `https://whatsapp-api-y40p.onrender.com/grupos` |

4. **Trigger deploy** para aplicar as variáveis.

### Painel na Vercel

1. [vercel.com](https://vercel.com) → Projeto do painel
2. **Settings** → **Environment Variables**
3. Adicione **NEXT_PUBLIC_API_URL** = `https://whatsapp-api-y40p.onrender.com` e **NEXT_PUBLIC_DEFAULT_JID** = id do grupo (de `/grupos`)
4. **Redeploy** do projeto.

---

## Resumo das variáveis

### Render (API)

| Nome | Valor (exemplo) |
|------|------------------|
| NODE_ENV | `production` |
| PORT | `3000` |
| PANEL_URL | `https://painel-velotax.netlify.app` (ou URL do painel na Vercel) |

### Netlify / Vercel (Painel)

| Nome | Valor (exemplo) |
|------|------------------|
| NEXT_PUBLIC_API_URL | `https://whatsapp-api-y40p.onrender.com` |
| NEXT_PUBLIC_DEFAULT_JID | `120363400851545835@g.us` (copiar de `/grupos` na API) |

---

## Ordem recomendada

1. Deploy da **API no Render** (disco + variáveis) → escanear QR
2. Abrir **/grupos** na API e copiar o **id** do grupo
3. Deploy do **painel na Vercel** com as 3 variáveis (incluindo o id em NEXT_PUBLIC_DEFAULT_JID)
4. No Render, conferir se **PANEL_URL** é a URL do painel (Netlify ou Vercel)

Pronto: envio pelo painel e auto-status por reação ✅/❌ funcionando.
