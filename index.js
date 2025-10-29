const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(express.json());

let sock;
let reconnecting = false;

// APAGA AUTH ANTIGO (SE QUISER FORÇAR NOVO QR)
if (fs.existsSync('auth') && process.env.FORCE_NEW_QR === 'true') {
  console.log('APAGANDO LOGIN ANTIGO...');
  fs.rmSync('auth', { recursive: true, force: true });
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
      console.log('\nESCANEIE O QR CODE AGORA:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      reconnecting = false;
      console.log('\nWHATSAPP CONECTADO! API PRONTA!');
      const url = process.env.RENDER_EXTERNAL_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
      console.log(`API ONLINE: ${url}/send`);
    }

    if (connection === 'close') {
      const status = lastDisconnect?.error?.output?.statusCode;
      if (status === DisconnectReason.loggedOut) {
        console.log('DESLOGADO → Apagando auth...');
        fs.rmSync('auth', { recursive: true, force: true });
      }
      console.log(`DESCONECTADO (${status || 'desconhecido'}) → Reconectando em 2s...`);
      setTimeout(() => {
        reconnecting = false;
        connect();
      }, 2000); // 2 segundos
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
    console.log('[ERRO] WhatsApp offline → Reconectando...');
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

app.listen(process.env.PORT || 3000, () => {
  console.log(`Servidor rodando na porta ${process.env.PORT || 3000}`);
});
