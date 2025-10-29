const express = require('express');
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(express.json());

let sock;

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  
  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, qr } = update;

    if (qr) {
      console.log('\nESCANEIE O QR CODE COM O WHATSAPP:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('\nWHATSAPP CONECTADO!');
      console.log('API rodando em http://localhost:3000');
    }

    if (connection === 'close') {
      console.log('Conexão fechada. Reconectando...');
      setTimeout(connect, 3000);
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

connect();

app.post('/send', async (req, res) => {
  const { numero, mensagem } = req.body;
  if (!sock || !sock.user) return res.status(500).send('Offline');

  try {
    await sock.sendMessage(`${numero}@s.whatsapp.net`, { text: mensagem });
    res.send('Enviado!');
  } catch (e) {
    res.status(500).send('Erro: ' + e.message);
  }
});

app.listen(3000, () => {
  console.log('Servidor iniciado...');
});