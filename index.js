const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

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
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\nESCANEIE O QR CODE (SÓ NA 1ª VEZ):\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      reconnecting = false;
      console.log('\nWHATSAPP CONECTADO!');
      console.log(`API ONLINE: ${process.env.RENDER_EXTERNAL_URL || 'https://' + process.env.RENDER_EXTERNAL_HOSTNAME}`);
    }

    if (connection === 'close') {
      const status = lastDisconnect?.error?.output?.statusCode;
      console.log(`Conexão fechada. Código: ${status}`);

      if (status === DisconnectReason.loggedOut) {
        console.log('Deslogado. Reescaneie o QR.');
      } else {
        console.log('Reconectando em 10s...');
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

// Health check (evita sleep)
app.get('/', (req, res) => res.send('WhatsApp API Online - Velotax'));

app.post('/send', async (req, res) => {
  const { numero, mensagem } = req.body;
  
  if (!sock || sock.state !== 'open') {
    return res.status(503).send('Reconectando...');
  }

  try {
    await sock.sendMessage(`${numero}@s.whatsapp.net`, { text: mensagem });
    res.send('Enviado!');
  } catch (e) {
    res.status(500).send('Erro: ' + e.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor na porta ${PORT}`);
});
