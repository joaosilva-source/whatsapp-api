const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(express.json());

let sock;
let reconnecting = false;

// APAGA O AUTH ANTIGO PARA FORÇAR NOVO QR
const authDir = 'auth';
if (fs.existsSync(authDir)) {
  console.log('APAGANDO LOGIN ANTIGO...');
  fs.rmSync(authDir, { recursive: true, force: true });
  console.log('LOGIN ANTIGO REMOVIDO! NOVO QR SERÁ GERADO.');
}

async function connect() {
  if (reconnecting) return;
  reconnecting = true;

  const { state, saveCreds } = await useMultiFileAuthState('auth');
  
  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\nESCANEIE O QR CODE AGORA (NOVO LOGIN):\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      reconnecting = false;
      console.log('\nWHATSAPP CONECTADO COM SUCESSO!');
      const url = process.env.RENDER_EXTERNAL_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
      console.log(`API PRONTA: ${url}/send`);
    }

    if (connection === 'close') {
      const status = lastDisconnect?.error?.output?.statusCode;
      if (status === DisconnectReason.loggedOut) {
        console.log('Deslogado. Novo QR será gerado.');
      } else {
        console.log(`Reconectando em 5s... (${status})`);
        setTimeout(() => {
          reconnecting = false;
          connect();
        }, 5000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

connect();

app.get('/', (req, res) => {
  const url = process.env.RENDER_EXTERNAL_URL || `https://${req.headers.host}`;
  res.send(`Velotax WhatsApp API - ONLINE\n\nPOST: ${url}/send`);
});

app.post('/send', async (req, res) => {
  const { numero, mensagem } = req.body;
  console.log(`[TENTATIVA] ${numero}: ${mensagem.substring(0, 50)}...`);
  
  if (!sock || sock.state !== 'open') {
    console.log('[STATUS] Reconectando...');
    return res.status(503).send('Reconectando...');
  }

  try {
    const jid = `${numero}@s.whatsapp.net`;
    const exists = await sock.onWhatsApp(jid);
    if (!exists?.exists) {
      console.log(`[ERRO] ${numero} não tem WhatsApp`);
      return res.status(400).send('Número sem WhatsApp');
    }

    await sock.sendMessage(jid, { text: mensagem });
    console.log('[SUCESSO] Enviado!');
    res.send('Enviado!');
  } catch (e) {
    console.log('[FALHA] ' + e.message);
    res.status(500).send('Erro: ' + e.message);
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Servidor rodando na porta ${process.env.PORT}`);
});
