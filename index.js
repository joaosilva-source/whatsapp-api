// index.js - Backend Render (Express + Baileys)
// Node >= 18 (fetch nativo)

const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const cors = require('cors');

const app = express();
app.use(express.json());

// CORS (abra geral em testes; restrinja em produção)
app.use(cors());

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

  // Conexão / QR
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
      if (url) console.log(`API ONLINE: ${url}/send`);
    }

    if (connection === 'close') {
      isConnected = false;

      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log('Status de disconnect:', reason);

      if (reason === DisconnectReason.loggedOut) {
        console.log('DESLOGADO -> apagando auth e pedindo QR novamente...');
        fs.rmSync('auth', { recursive: true, force: true });
      } else {
        console.log('Desconectado -> tentando reconectar sem pedir QR...');
      }

      setTimeout(() => {
        reconnecting = false;
        connect();
      }, 2000);
    }
  });

  // Listener de reações (algumas versões entregam via messages.update)
  sock.ev.on('messages.update', async (updates) => {
    try {
      for (const u of updates) {
        const rx = u?.update?.reactionMessage;
        if (!rx) continue;

        const emoji = rx.text;
        const key = rx.key;
        const reactorJid = key?.participant || key?.remoteJid || '';
        const reactorDigits = String(reactorJid || '').replace(/\D/g, '');
        const allowed = (process.env.AUTHORIZED_REACTION_NUMBER || '').replace(/\D/g, '');

        if (emoji === '✅' && allowed && (reactorDigits.endsWith(allowed) || reactorDigits === allowed)) {
          const panel = process.env.PANEL_URL; // ex.: https://velotax-painel.vercel.app
          const waMessageId = key?.id;
          if (panel && waMessageId) {
            console.log('[AUTO-STATUS/UPDATE] Marcando FEITO via reação ✅', { waMessageId, reactorDigits });
            await fetch(`${panel}/api/requests/auto-status`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ waMessageId, reactor: reactorDigits, status: 'feito' })
            }).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.log('[REACTION UPDATE ERROR]', e.message);
    }
  });

  // Listener extra: outras versões entregam reações via messages.upsert
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    try {
      if (!messages || !messages.length) return;
      for (const msg of messages) {
        const rx = msg?.message?.reactionMessage;
        if (!rx) continue;

        const emoji = rx.text;
        const key = rx.key;
        const reactorJid = key?.participant || key?.remoteJid || '';
        const reactorDigits = String(reactorJid || '').replace(/\D/g, '');
        const allowed = (process.env.AUTHORIZED_REACTION_NUMBER || '').replace(/\D/g, '');

        if (emoji === '✅' && allowed && (reactorDigits.endsWith(allowed) || reactorDigits === allowed)) {
          const panel = process.env.PANEL_URL; // ex.: https://velotax-painel.vercel.app
          const waMessageId = key?.id;
          if (panel && waMessageId) {
            console.log('[AUTO-STATUS/UPSERT] Marcando FEITO via reação ✅', { waMessageId, reactorDigits });
            await fetch(`${panel}/api/requests/auto-status`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ waMessageId, reactor: reactorDigits, status: 'feito' })
            }).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.log('[REACTION UPSERT ERROR]', e.message);
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

connect();

// Health
app.get('/', (req, res) => {
  const url = process.env.RENDER_EXTERNAL_URL || `https://${req.headers.host}`;
  res.send(`Velotax WhatsApp API - ONLINE\n\nPOST: ${url}/send\nStatus: ${isConnected ? 'CONECTADO' : 'Desconectado'}`);
});

// Envio: retorna messageId para o painel salvar
app.post('/send', async (req, res) => {
  const { jid, numero, mensagem } = req.body;
  const destino = jid || numero;
  console.log(`[TENTATIVA] ${destino}: ${String(mensagem || '').substring(0, 80)}...`);

  if (!isConnected || !sock) {
    return res.status(503).json({ ok: false, error: 'WhatsApp desconectado' });
  }

  try {
    let destinatario = destino;

    if (!destinatario || destinatario.length === 0) {
      return res.status(400).json({ ok: false, error: 'Destino inválido' });
    }

    if (!destinatario.includes('@')) {
      destinatario = destinatario.includes('-')
        ? `${destinatario}@g.us`
        : `${destinatario}@s.whatsapp.net`;
    }

    const sent = await sock.sendMessage(destinatario, { text: mensagem || '' });
    const messageId = sent?.key?.id || null;

    console.log('[SUCESSO] Enviado! messageId:', messageId);
    res.json({ ok: true, messageId });
  } catch (e) {
    console.log('[FALHA]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Lista de grupos (opcional)
app.get('/grupos', async (req, res) => {
  if (!isConnected || !sock) {
    return res.status(503).json({ ok: false, error: 'WhatsApp desconectado' });
  }

  try {
    const grupos = await sock.groupFetchAllParticipating();
    const lista = Object.values(grupos).map(g => ({
      nome: g.subject,
      id: g.id
    }));
    res.json(lista);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('API escutando porta', PORT));