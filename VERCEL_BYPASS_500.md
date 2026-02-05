# Corrigir HTTP 500 "Tenant or user not found" (auto-status → painel Vercel)

Esse erro **não vem do código do painel**: é a **Vercel** bloqueando a requisição (Deployment Protection / Authentication) antes de chegar na API.

## 1. Confirmar no Render se o bypass está sendo enviado

Depois do próximo deploy, ao receber uma reação ✅/❌, nos logs do serviço no Render você verá uma destas linhas:

- `(bypass header enviado)` → o header está sendo enviado; o problema é a configuração na Vercel (passos 2–3).
- `(sem bypass - defina PANEL_BYPASS_SECRET no Render)` → defina a variável no Render (passo 2) e faça redeploy.

## 2. Variável no Render (whatsapp-api)

1. **Dashboard Render** → seu serviço (whatsapp-api) → **Environment**.
2. Adicione (ou edite):
   - **Key:** `PANEL_BYPASS_SECRET`
   - **Value:** o mesmo valor que você configurar no passo 3 (ex.: uma senha longa e aleatória).
3. **Save Changes** e aguarde o **redeploy** (ou dispare um deploy manual).

## 3. Bypass no projeto Vercel (velotax-painel)

1. **Vercel Dashboard** → projeto **velotax-painel** → **Settings** → **Deployment Protection**.
2. Se existir **"Protection Bypass for Automation"**:
   - Ative e defina um **secret** (copie/cole o **mesmo** valor usado em `PANEL_BYPASS_SECRET` no Render).
3. Se a proteção estiver em **Team/Account**:
   - Vá em **Team** (ou Account) → **Settings** → **Deployment Protection** / **Security** e configure o bypass lá com o **mesmo** secret, ou desative a proteção para esse projeto se for aceitável.

## 4. Conferir proteção no time/conta

Se mesmo com bypass o erro continuar:

- **Team** → **Settings** → **Deployment Protection**: veja se há "Vercel Authentication" ou proteção que exija login; pode ser necessário configurar bypass no nível do time ou liberar o projeto.
- Garanta que o **mesmo** secret está em:
  - Render: `PANEL_BYPASS_SECRET`
  - Vercel: Protection Bypass for Automation (projeto ou team).

## 5. Testar

Após redeploy do serviço no Render e salvar o secret na Vercel, envie uma reação ✅ ou ❌ no WhatsApp. O log deve mostrar `(bypass header enviado)` e a resposta do painel deve ser **200** (não 500).

Se ainda for 500, confira os **logs da função** na Vercel: **Deployments** → último deploy → **Functions** ou **Logs** para o path `api/requests/auto-status`. Se não houver nenhuma linha para essa chamada, a requisição está sendo bloqueada antes da função (proteção Vercel).
