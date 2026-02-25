# Deploy da whatsapp-api no Fly.io

## Pré-requisitos

1. **Conta:** [fly.io](https://fly.io) → sign up (GitHub ou e-mail).
2. **CLI:** instale o `flyctl`:
   - **Windows (PowerShell):** `powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"`
   - **Mac/Linux:** `curl -L https://fly.io/install.sh | sh`
3. **Login:** `fly auth login` (abre o navegador).

---

## Passo a passo

### 1. No diretório do projeto

```bash
cd repos-joaosilva/whatsapp-api
```

### 2. Criar o app (sem deploy ainda)

```bash
fly launch --no-deploy
```

- **App name:** confirme ou mude (ex.: `whatsapp-api-velotax`).
- **Region:** escolha a mais próxima (ex.: `gru` = São Paulo).
- **Postgres/Redis:** No para ambos.
- **Deploy now:** No (já usamos `--no-deploy`).

Anote a **região** escolhida (ex.: `gru`).

### 3. Criar o volume (persistir a pasta `auth`)

Troque `gru` pela região que você escolheu:

```bash
fly volumes create whatsapp_auth --region gru --size 1
```

### 4. Variáveis de ambiente (secrets)

Defina as mesmas variáveis que você usava no Render:

```bash
fly secrets set PANEL_URL=https://SEU-PAINEL.vercel.app
fly secrets set PING_ENABLED=true
fly secrets set PING_INTERVAL=600000
fly secrets set PING_DELAY=60000
```

(Opcional) Outras:

```bash
fly secrets set AUTHORIZED_REACTORS=5511999999999
fly secrets set REPLIES_STREAM_ENABLED=0
```

**Importante:** No painel (Vercel), atualize `NEXT_PUBLIC_API_URL` para a URL do Fly, que será: `https://<nome-do-app>.fly.dev`.

### 5. Deploy

```bash
fly deploy
```

Aguarde o build e o deploy. A URL ficará: **https://&lt;nome-do-app&gt;.fly.dev**.

### 6. Escanear o QR

- Abra no navegador: **https://&lt;nome-do-app&gt;.fly.dev/qr**
- Ou no painel: **Conectar WhatsApp** (QR WhatsApp).
- Escaneie com o celular (WhatsApp → Dispositivos conectados → Conectar dispositivo).

### 7. Conferir logs

```bash
fly logs
```

---

## Comandos úteis

| Comando | Descrição |
|---------|-----------|
| `fly status` | Status do app e da máquina |
| `fly logs` | Logs em tempo real |
| `fly open` | Abre a URL do app no navegador |
| `fly ssh console` | Acesso SSH à máquina |
| `fly secrets list` | Lista secrets |
| `fly scale count 1` | Garante 1 máquina rodando |

---

## Troubleshooting

- **"Volume not found" no deploy:** crie o volume antes (`fly volumes create whatsapp_auth -r <regiao>`) na mesma região do app.
- **QR não aparece:** confira `fly logs`; se der 405, a versão do WhatsApp no código já está atualizada — aguarde o backoff.
- **Painel não chama a API:** em Vercel, defina `NEXT_PUBLIC_API_URL=https://<seu-app>.fly.dev` e faça redeploy.
- **API no Render:** no Render, você pode desligar o serviço após migrar para o Fly.
