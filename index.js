// index.js - Backend Render (Express + Baileys)
// Node >= 18 (fetch nativo)

const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const cors = require('cors');

const app = express();
// Aumentar limite do body para suportar imagens em base64
app.use(express.json({ limit: '15mb' }));

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
        if (!rx) {
          // log ponta de prova
          if (u && u.update && u.update.message) {
            console.log('[REACTION DEBUG][update] update.message keys:', Object.keys(u.update.message));
          }
        }
        if (!rx) continue;

        const emoji = rx.text;
        const key = rx.key; // key da MENSAGEM REAGIDA (use para waMessageId)
        // O REATOR é o remetente deste evento (fora do rx): use u.key se existir
        const outerKey = u?.key || u?.update?.key || {};
        const reactorJid = outerKey.participant || outerKey.remoteJid || '';
        const reactorDigits = String(reactorJid || '').replace(/\D/g, '');
        const allowed = (process.env.AUTHORIZED_REACTION_NUMBER || '').replace(/\D/g, '');

        console.log('[REACTION][update]', {
          emoji,
          reactorDigits,
          keyId: key?.id,
          allowed,
        });

        // Temporariamente sem checagem de autorizado para validar fluxo end-to-end
        if (emoji === '✅') {
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
        const m = msg?.message || {};
        const rx = m?.reactionMessage;
        if (!rx) {
          if (msg && msg.message) {
            console.log('[REACTION DEBUG][upsert] message keys:', Object.keys(msg.message));
          }
        } else {
          const emoji = rx.text;
          const key = rx.key; // mensagem reagida (usa id no painel)
          // O REATOR é o sender deste upsert (msg.key)
          const reactorJid = msg?.key?.participant || msg?.key?.remoteJid || '';
          const reactorDigits = String(reactorJid || '').replace(/\D/g, '');
          const allowed = (process.env.AUTHORIZED_REACTION_NUMBER || '').replace(/\D/g, '');

          console.log('[REACTION][upsert]', {
            emoji,
            reactorDigits,
            keyId: key?.id,
            allowed,
          });

          // Temporariamente sem checagem de autorizado para validar fluxo end-to-end
          if (emoji === '✅') {
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

        // Hook de reply: quando alguém responde (cita) uma mensagem enviada pelo bot
        try {
          const text =
            m.conversation ||
            m.extendedTextMessage?.text ||
            m.imageMessage?.caption ||
            m.videoMessage?.caption || '';
          const quoted =
            m.extendedTextMessage?.contextInfo?.stanzaId ||
            m.extendedTextMessage?.contextInfo?.quotedMessage?.key?.id ||
            null;
          if (text && quoted) {
            const reactorJid = msg?.key?.participant || msg?.key?.remoteJid || '';
            const reactorDigits = String(reactorJid || '').replace(/\D/g, '');
            const panel = process.env.PANEL_URL;
            if (panel) {
              await fetch(`${panel}/api/requests/reply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ waMessageId: quoted, reactor: reactorDigits, text })
              }).catch(() => {});
            }
          }
        } catch {}
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
  const { jid, numero, mensagem, imagens } = req.body || {};
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

    let messageId = null;
    const messageIds = [];

    // Se houver imagens, enviar a primeira com legenda; demais sem legenda
    const imgs = Array.isArray(imagens) ? imagens : [];
    if (imgs.length > 0) {
      try {
        const first = imgs[0];
        const buf = Buffer.from(String(first?.data || ''), 'base64');
        const sentFirst = await sock.sendMessage(destinatario, {
          image: buf,
          mimetype: first?.type || 'image/jpeg',
          caption: mensagem || ''
        });
        const firstId = sentFirst?.key?.id || null;
        messageId = firstId;
        if (firstId) messageIds.push(firstId);

        // Enviar demais imagens sem legenda
        for (let i = 1; i < imgs.length; i++) {
          const it = imgs[i];
          try {
            const b = Buffer.from(String(it?.data || ''), 'base64');
            const sentMore = await sock.sendMessage(destinatario, {
              image: b,
              mimetype: it?.type || 'image/jpeg'
            });
            const mid = sentMore?.key?.id || null; if (mid) messageIds.push(mid);
          } catch (ie) {
            console.log('[WARN] Falha ao enviar imagem extra', ie?.message);
          }
        }
      } catch (imgErr) {
        console.log('[WARN] Falha envio de imagem; caindo para texto', imgErr?.message);
      }
    }

    // Se não houve imagem enviada (ou falhou), enviar texto
    if (!messageId) {
      const sent = await sock.sendMessage(destinatario, { text: mensagem || '' });
      const tid = sent?.key?.id || null;
      messageId = tid;
      if (tid) messageIds.push(tid);
    }

    console.log('[SUCESSO] Enviado! messageId:', messageId, 'all:', messageIds);
    res.json({ ok: true, messageId, messageIds });
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