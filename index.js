const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

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
    printQRInTerminal: true,
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\nESCANEIE O QR CODE AGORA:\n');
      require('qrcode-terminal').generate(qr, { small: true });
    }

    if (connection === 'open') {
      reconnecting = false;
      console.log('\nWHATSAPP CONECTADO! API PRONTA!');
    }

    if (connection === 'close') {
      const status = lastDisconnect?.error?.output?.statusCode;
      console.log(`DESCONECTADO (código: ${status}) → Reconectando em 3s...`);
      setTimeout(() => {
        reconnecting = false;
        connect();
      }, 3000); // 3 segundos
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

connect();

app.get('/', (req, res) => {
  const url = process.env.RENDER_EXTERNAL_URL || `https://${req.headers.host}`;
  res.send(`Velotax API ONLINE\nPOST: ${url}/send`);
});

app.post('/send', async (req, res) => {
  const { numero, mensagem } = req.body;
  console.log(`[TENTATIVA] ${numero}: ${mensagem}`);

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
