const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const cors = require('cors');
const app = express();
app.use(express.json());

// enquanto testa, pode liberar geral:
app.use(cors());
// depois restrinja:
// app.use(cors({ origin: ['https://SEU-SITE-NA-VERCEL.vercel.app', 'http://localhost:3000'] }));


const app = express();
app.use(express.json());

let sock = null;
let isConnected = false;
let reconnecting = false;

async function connect() {
  if (reconnecting) return;
  reconnecting = true;
  isConnected = false;

  const { state, saveCreds } = await useMultiFileAuthState('auth');

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Chrome', 'Ubuntu', '20.04'],
    keepAliveIntervalMs: 10000,
    syncFullHistory: true,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\nESCANEIE O QR CODE AGORA:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      isConnected = true;
      reconnecting = false;
      console.log('\nWHATSAPP CONECTADO! API PRONTA!');
      const url = process.env.RENDER_EXTERNAL_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
      console.log(`API ONLINE: ${url}/send`);
    }

    if (connection === 'close') {
      isConnected = false;

      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log("Status de disconnect:", reason);

      if (reason === DisconnectReason.loggedOut) {
        console.log("DESLOGADO -> apagando auth e pedindo QR novamente...");
        fs.rmSync('auth', { recursive: true, force: true });
      } else {
        console.log("Desconectado -> tentando reconectar sem pedir QR...");
      }

      setTimeout(() => {
        reconnecting = false;
        connect();
      }, 2000);
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

connect();

app.get('/', (req, res) => {
  const url = process.env.RENDER_EXTERNAL_URL || `https://${req.headers.host}`;
  res.send(`Velotax WhatsApp API - ONLINE\n\nPOST: ${url}/send\nStatus: ${isConnected ? 'CONECTADO' : 'Desconectado'}`);
});

app.post('/send', async (req, res) => {
  const { jid, numero, mensagem } = req.body;
  const destino = jid || numero;
  console.log(`[TENTATIVA] ${destino}: ${mensagem?.substring(0, 50)}...`);

  if (!isConnected || !sock) {
    return res.status(503).send('WhatsApp desconectado');
  }

  try {
    let destinatario = destino;

    if (!destinatario.includes('@')) {
      destinatario = destinatario.includes('-')
        ? `${destinatario}@g.us`
        : `${destinatario}@s.whatsapp.net`;
    }

    await sock.sendMessage(destinatario, { text: mensagem });
    console.log('[SUCESSO] Enviado!');
    res.send('Enviado!');
  } catch (e) {
    console.log('[FALHA]', e);
    res.status(500).send('Erro: ' + e.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

app.get('/grupos', async (req, res) => {
  if (!isConnected || !sock) {
    return res.status(503).send('WhatsApp desconectado');
  }

  try {
    const grupos = await sock.groupFetchAllParticipating();
    const lista = Object.values(grupos).map(g => ({
      nome: g.subject,
      id: g.id
    }));

    console.log(lista);
    res.json(lista);
  } catch (e) {
    res.status(500).send('Erro: ' + e.message);
  }
});
