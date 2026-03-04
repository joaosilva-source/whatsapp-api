# Configuração: Painel Netlify + API (ngrok na outra máquina)

## URLs

| O quê | URL |
|-------|-----|
| **Painel** | https://painel-velotax.netlify.app |
| **API (ngrok)** | https://carmina-peskier-balletically.ngrok-free.dev |

---

## 1. Na máquina onde a API roda (C:\whatsapp-api)

Crie ou edite o arquivo **.env** com:

```env
PORT=3000
NODE_ENV=production
PANEL_URL=https://painel-velotax.netlify.app
API_PUBLIC_URL=https://carmina-peskier-balletically.ngrok-free.dev
PING_ENABLED=true
PING_INTERVAL=600000
PING_DELAY=60000
```

Reinicie a API depois de salvar:

```cmd
pm2 restart whatsapp-api
pm2 save
```

---

## 2. No Netlify (painel)

1. Acesse [app.netlify.com](https://app.netlify.com) → site **painel-velotax**.
2. **Site configuration** → **Environment variables**.
3. Adicione ou edite:
   - **NEXT_PUBLIC_API_URL** = `https://carmina-peskier-balletically.ngrok-free.dev` (sem barra no final)
   - **NEXT_PUBLIC_DEFAULT_JID** = ID do grupo (ex.: `120363400851545835@g.us`)
   - **DATABASE_URL** = URI do PostgreSQL (Supabase etc.), se usar
4. **Deploys** → **Trigger deploy** → **Deploy site**.

---

## 3. Na outra máquina: como puxar as correções

### Se tiver Git instalado

```cmd
cd /d C:\whatsapp-api
git fetch origin
git pull origin main
```

Se o repositório estiver em outro remote (ex.: joaopedroafk):

```cmd
cd /d C:\whatsapp-api
git pull joaopedroafk main
```

Depois:

```cmd
npm install
```

Atualize o **.env** com as variáveis da tabela acima (PANEL_URL e API_PUBLIC_URL), então:

```cmd
pm2 restart whatsapp-api
pm2 save
```

### Se NÃO tiver Git

1. Nesta máquina (com Cursor): faça commit e push das alterações para o GitHub.
2. Na outra máquina: baixe o ZIP do repositório em https://github.com/JoaoPedroAFK/whatsapp-api (ou joaosilva-source/whatsapp-api) → **Code** → **Download ZIP**.
3. Extraia e substitua os arquivos em **C:\whatsapp-api** (mantenha a pasta **auth** e o **.env** se já existirem; só sobrescreva **index.js** e outros arquivos do projeto).
4. Na outra máquina:

```cmd
cd /d C:\whatsapp-api
npm install
```

Confira o **.env** (PANEL_URL e API_PUBLIC_URL). Depois:

```cmd
pm2 restart whatsapp-api
pm2 save
```

---

## 4. Ngrok

Na máquina da API, deixe o ngrok rodando para a URL pública funcionar:

```cmd
ngrok http 3000
```

Se a URL do ngrok mudar, atualize **API_PUBLIC_URL** no .env da API e **NEXT_PUBLIC_API_URL** no Netlify, e faça redeploy do painel.
