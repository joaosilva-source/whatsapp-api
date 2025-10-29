const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
app.use(express.json());

let sock;
let reconnecting = false;

async function connect() {
  if (reconnecting) return;
  reconnecting = true;

  const { state, saveCreds } = await useMultiFileAuthState('auth');
  
  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      reconnecting = false;
      console.log('\nWHATSAPP CONECTADO!');
      const url = process.env.RENDER_EXTERNAL_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
      console.log(`API ONLINE: ${url}/send`);
    }

    if (connection === 'close') {
      const status = lastDisconnect?.error?.output?.statusCode;
      if (status === DisconnectReason.loggedOut) {
        console.log('Deslogado. Reescaneie.');
      } else {
        console.log(`Reconectando em 10s... (${status})`);
        setTimeout(() => {
          reconnecting = false;
          connect();
        }, 10000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

connect();

// Health check - ACORDA O RENDER
app.get('/', (req, res) => {
  const url = process.env.RENDER_EXTERNAL_URL || `https://${req.headers.host}`;
  res.send(`Velotax WhatsApp API - ONLINE 24h\n\nPOST para: ${url}/send`);
});

app.post('/send', async (req, res) => {
  const { numero, mensagem } = req.body;
  console.log(`[ENVIO] ${numero}: ${mensagem.substring(0, 50)}...`);
  
  if (!sock || sock.state !== 'open') {
    return res.status(503).send('Reconectando...');
  }

  try {
    await sock.sendMessage(`${numero}@s.whatsapp.net`, { text: mensagem });
    console.log('[OK] Enviado!');
    res.send('Enviado!');
  } catch (e) {
    console.log('[ERRO] ' + e.message);
    res.status(500).send('Erro: ' + e.message);
  }
});

// Usa a porta do Render (pública)
app.listen(process.env.PORT, () => {
  console.log(`Servidor na porta ${process.env.PORT}`);
});
