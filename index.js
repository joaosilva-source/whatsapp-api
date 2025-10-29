const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
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
    printQRInTerminal: true,
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\nESCANEIE O QR CODE (PRIMEIRA VEZ NO RENDER):\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('\nWHATSAPP CONECTADO COM SUCESSO!');
      console.log(`API ONLINE: https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost'}:${process.env.PORT || 3000}`);
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Conexão fechada:', lastDisconnect?.error?.output?.statusCode);
      if (shouldReconnect) {
        console.log('Reconectando em 5 segundos...');
        setTimeout(connect, 5000);
      } else {
        console.log('Deslogado. Pare o serviço e reescaneie o QR.');
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

connect();

app.post('/send', async (req, res) => {
  const { numero, mensagem } = req.body;
  if (!sock || sock.state !== 'open') {
    return res.status(503).send('WhatsApp offline. Reconectando...');
  }

  try {
    await sock.sendMessage(`${numero}@s.whatsapp.net`, { text: mensagem });
    res.send('Enviado com sucesso!');
  } catch (e) {
    res.status(500).send('Erro: ' + e.message);
  }
});

// Usa a porta do Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
