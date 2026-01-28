// index.js - Backend Render (Express + Baileys)
// VERSION: v1.1.1 | DATE: 2025-01-28 | AUTHOR: VeloHub Development Team
// CHANGELOG: v1.1.1 - Ignorar protocolMessage no upsert para reduzir log; v1.1.0 - Ping automático

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

// Meta e stream de respostas em memória (não persistente)
const metaByMessageId = new Map(); // messageId -> { cpf, solicitacao }
const recentReplies = []; // ring buffer simples
const recentMax = 200;
const sseClients = new Set(); // Set<{ res, agent: string|null }>

const norm = (s = '') => String(s).toLowerCase().trim().replace(/\s+/g, ' ');

function publishReply(ev) {
  try {
    recentReplies.push(ev);
    if (recentReplies.length > recentMax) recentReplies.shift();
    const data = `event: reply\n` + `data: ${JSON.stringify(ev)}\n\n`;
    for (const client of sseClients) {
      try {
        const want = client?.agent ? (norm(client.agent) === norm(ev?.agente || '')) : true;
        if (want) client.res.write(data);
      } catch {}
    }
  } catch {}
}

// Endpoint para obter últimas respostas (útil para debug/consumo inicial)
app.get('/replies/recent', (req, res) => {
  res.json(recentReplies);
});

// SSE: stream de replies em tempo real
app.get('/stream/replies', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const agent = (req.query?.agent ? String(req.query.agent) : null) || null;
  if (!agent) {
    try { res.write(`event: init\n` + `data: []\n\n`); } catch {}
    return res.end();
  }
  const client = { res, agent };
  sseClients.add(client);
  // enviar estado inicial
  try {
    const initial = recentReplies.filter(ev => norm(ev?.agente||'') === norm(agent));
    res.write(`event: init\n` + `data: ${JSON.stringify(initial)}\n\n`);
  } catch {}
  req.on('close', () => {
    try { sseClients.delete(client); } catch {}
  });
});

/**
 * Função para atualizar status via reação do WhatsApp
 * Chama o backend do VeloHub
 */
async function atualizarStatusViaReacao(waMessageId, reaction, reactorDigits) {
  // Prioridade: BACKEND_URL > VELOHUB_BACKEND_URL > fallback para produção
  const BACKEND_URL = process.env.BACKEND_URL || 
                      process.env.VELOHUB_BACKEND_URL || 
                      'https://velohub-278491073220.us-east1.run.app';
  const AUTO_STATUS_ENDPOINT = `${BACKEND_URL}/api/escalacoes/solicitacoes/auto-status`;

  try {
    const body = {
      waMessageId: waMessageId,
      reaction: reaction, // '✅' ou '❌'
      reactor: reactorDigits
    };

    console.log('[AUTO-STATUS] Fazendo requisição HTTP...');
    console.log('[AUTO-STATUS] URL:', AUTO_STATUS_ENDPOINT);
    console.log('[AUTO-STATUS] Body:', JSON.stringify(body));

    const response = await fetch(AUTO_STATUS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    console.log('[AUTO-STATUS] Status HTTP:', response.status);
    console.log('[AUTO-STATUS] Status Text:', response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AUTO-STATUS] ❌ Erro HTTP:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('[AUTO-STATUS] ✅ Resposta do backend:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('[AUTO-STATUS] ✅ Status atualizado com sucesso!');
      console.log('[AUTO-STATUS] Novo status:', result.data?.status);
    } else {
      console.error('[AUTO-STATUS] ❌ Erro na resposta:', result.error);
    }

    return result;
  } catch (error) {
    console.error('[AUTO-STATUS] ❌ Erro ao fazer requisição:', error.message);
    console.error('[AUTO-STATUS] Stack:', error.stack);
    // Não relançar o erro para não quebrar o fluxo do renderer
    return null;
  }
}

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

        // Processar reações ✅ e ❌
        if (emoji === '✅' || emoji === '❌') {
          const waMessageId = key?.id;
          if (waMessageId) {
            console.log('[AUTO-STATUS/UPDATE] Marcando via reação', emoji, { waMessageId, reactorDigits });
            await atualizarStatusViaReacao(waMessageId, emoji, reactorDigits);
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
        // Ignorar protocolMessage (sincronização WhatsApp) para evitar log em excesso e REPLY IGNORED
        const keys = msg?.message ? Object.keys(msg.message) : [];
        if (keys.length === 1 && m?.protocolMessage) continue;

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

          // Processar reações ✅ e ❌
          if (emoji === '✅' || emoji === '❌') {
            const waMessageId = key?.id;
            if (waMessageId) {
              console.log('[AUTO-STATUS/UPSERT] Marcando via reação', emoji, { waMessageId, reactorDigits });
              await atualizarStatusViaReacao(waMessageId, emoji, reactorDigits);
            }
          }
        }

        // Hook de reply: quando alguém responde (cita) uma mensagem enviada pelo bot
        try {
          const m = msg?.message || {};
          const text =
            m.conversation ||
            m.extendedTextMessage?.text ||
            m.imageMessage?.caption ||
            m.videoMessage?.caption || '';
          const ctx = m.extendedTextMessage?.contextInfo || {};
          const quoted =
            ctx.stanzaId ||
            ctx?.quotedMessage?.key?.id ||
            ctx?.stanzaID ||
            ctx?.quotedStanzaID ||
            null;

          const enabled = String(process.env.REPLIES_STREAM_ENABLED || '0') === '1';
          const panel = process.env.PANEL_URL;
          const reactor = String(msg?.key?.participant || msg?.key?.remoteJid || '').replace(/\D/g, '');

          // Só processa se feature estiver habilitada e se o quoted pertencer a um messageId conhecido (enviado via /send)
          const knownMeta = quoted ? metaByMessageId.get(quoted) : null;
          if (!enabled || !quoted || !knownMeta) {
            // opcional: log leve para diagnóstico
            if (!enabled) console.log('[REPLY IGNORED] stream desabilitado');
            else if (!quoted) console.log('[REPLY IGNORED] sem quoted messageId');
            else console.log('[REPLY IGNORED] quoted desconhecido (não enviado pelo bot)');
            return;
          }

          if (panel && text && quoted) {
            const url = `${panel}/api/requests/reply`;
            const payload = { waMessageId: quoted, reactor, text };
            const postOnce = async () => {
              const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              const ok = r.ok; let bodyText = ''; let status = r.status;
              try { bodyText = await r.text(); } catch {}
              console.log('[REPLY POST]', { status, ok, quoted, reactor, textLen: String(text).length, sample: bodyText?.slice(0,200) });
              return ok;
            };
            let ok = false; try { ok = await postOnce(); } catch (e) { console.log('[REPLY POST ERROR 1]', e?.message); }
            if (!ok) { await new Promise(r => setTimeout(r, 500)); try { await postOnce(); } catch (e2) { console.log('[REPLY POST ERROR 2]', e2?.message); } }

            // Publicar na fila local e SSE somente com metadados conhecidos
            const meta = knownMeta || {};
            const event = {
              type: 'reply',
              at: new Date().toISOString(),
              waMessageId: quoted,
              reactor,
              text,
              cpf: meta.cpf || null,
              solicitacao: meta.solicitacao || null,
              agente: meta.agente || null,
            };
            publishReply(event);
          }
        } catch (er) {
          console.log('[REPLY HOOK ERROR]', er?.message);
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

// ============================================
// ENDPOINTS DE HEALTH CHECK E PING
// Versão: v1.0.0 | Data: 2025-01-31
// Objetivo: Manter API ativa e evitar sleep mode
// ============================================

/**
 * Endpoint simples de ping/health check
 * Retorna status básico da API
 */
app.get('/ping', (req, res) => {
  try {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      whatsapp: isConnected ? 'connected' : 'disconnected',
      message: 'API está ativa e funcionando'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * Endpoint completo de health check
 * Retorna informações detalhadas do sistema
 */
app.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB'
      },
      whatsapp: isConnected ? 'connected' : 'disconnected',
      nodeVersion: process.version,
      platform: process.platform,
      pingEnabled: process.env.PING_ENABLED !== 'false',
      pingInterval: process.env.PING_INTERVAL || '600000'
    };
    
    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Debug endpoint para validar configuração do painel e hook de reply
app.get('/debug/reply-test', async (req, res) => {
  const panel = process.env.PANEL_URL;
  const pingUrl = panel ? `${panel}/api/requests` : null;
  const info = { panel, pingUrl, isConnected };
  try {
    if (pingUrl) {
      const r = await fetch(pingUrl, { method: 'GET' });
      info.requestsOk = r.ok; info.requestsStatus = r.status;
    }
  } catch (e) {
    info.requestsError = e?.message;
  }
  res.json(info);
});

// Envio: retorna messageId para o painel salvar
app.post('/send', async (req, res) => {
  const { jid, numero, mensagem, imagens, videos, cpf, solicitacao, agente } = req.body || {};
  // fallback: extrair meta do texto quando não enviados como campos
  const parseMeta = (txt = '') => {
    try {
      const s = String(txt || '');
      let cpfTxt = null;
      // procurar linha que começa com CPF:
      const mCpf = s.match(/^\s*CPF\s*:\s*(.+)$/im);
      if (mCpf && mCpf[1]) {
        const dig = String(mCpf[1]).replace(/\D/g, '');
        if (dig) cpfTxt = dig;
      }
      let sol = null;
      // tentar padrão do título: *Nova Solicitação Técnica - X*
      const mSol1 = s.match(/\*Nova\s+Solicitação\s+Técnica\s*-\s*([^*]+)\*/i);
      if (mSol1 && mSol1[1]) sol = mSol1[1].trim();
      // fallback: procurar linha que começa com Tipo de Solicitação:
      if (!sol) {
        const mSol2 = s.match(/^\s*Tipo\s+de\s+Solicitação\s*:\s*(.+)$/im);
        if (mSol2 && mSol2[1]) sol = mSol2[1].trim();
      }
      return { cpf: cpfTxt, solicitacao: sol };
    } catch { return { cpf: null, solicitacao: null }; }
  };
  const parsed = (!cpf || !solicitacao) ? parseMeta(mensagem) : { cpf: null, solicitacao: null };
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

    // Se houver vídeos, enviar com legenda
    const vids = Array.isArray(videos) ? videos : [];
    if (vids.length > 0) {
      try {
        for (const video of vids) {
          try {
            const buf = Buffer.from(String(video?.data || ''), 'base64');
            const sentVideo = await sock.sendMessage(destinatario, {
              video: buf,
              mimetype: video?.type || 'video/mp4',
              caption: imgs.length === 0 ? (mensagem || '') : '' // Legenda só se não houver imagens
            });
            const videoId = sentVideo?.key?.id || null;
            if (videoId) {
              messageId = messageId || videoId; // Usa primeiro vídeo como messageId principal se não houver imagens
              messageIds.push(videoId);
            }
            console.log('[VIDEO] Enviado com sucesso:', videoId);
          } catch (vidErr) {
            console.log('[WARN] Falha ao enviar vídeo', vidErr?.message, video?.name);
          }
        }
      } catch (vidErr) {
        console.log('[WARN] Falha geral no envio de vídeos', vidErr?.message);
      }
    }

    // Se não houve imagem ou vídeo enviada (ou falhou), enviar texto
    if (!messageId) {
      try {
        const sent = await sock.sendMessage(destinatario, { text: mensagem || '' });
        const tid = sent?.key?.id || null;
        messageId = tid;
        if (tid) messageIds.push(tid);
      } catch (textErr) {
        console.log('[ERROR] Falha ao enviar texto', textErr?.message);
        throw textErr;
      }
    }

    console.log('[SUCESSO] Enviado! messageId:', messageId, 'all:', messageIds);
    // Guardar metadados (se informados) ou extraídos do texto para correlacionar replies
    const metaCpf = cpf || parsed.cpf || null;
    const metaSol = solicitacao || parsed.solicitacao || null;
    const metaAgent = agente || null;
    if ((metaCpf || metaSol) && Array.isArray(messageIds) && messageIds.length) {
      for (const mid of messageIds) {
        if (!mid) continue;
        metaByMessageId.set(mid, { cpf: metaCpf, solicitacao: metaSol, agente: metaAgent });
      }
    }
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

// ============================================
// SISTEMA DE PING AUTOMÁTICO
// Versão: v1.0.0 | Data: 2025-01-31
// Objetivo: Manter servidor ativo para evitar sleep mode no Render.com
// ============================================

/**
 * Função para fazer ping interno na própria API
 * Mantém o servidor ativo evitando sleep mode
 */
const fazerPingInterno = async () => {
  try {
    // Obter URL base (Render.com fornece RENDER_EXTERNAL_URL automaticamente)
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    const pingUrl = `${baseUrl}/ping`;
    
    // Fazer requisição HTTP para o próprio servidor
    const response = await fetch(pingUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Baileys-API-Ping-System/1.0.0'
      },
      // Timeout de 10 segundos
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Log de sucesso
    console.log(`[PING] ${new Date().toISOString()} - Status: ${data.status} | Uptime: ${data.uptime}s`);
    
    return { success: true, data };
  } catch (error) {
    // Log de erro (não interrompe o processo)
    console.error(`[PING ERROR] ${new Date().toISOString()} - ${error.message}`);
    
    // Se for erro de conexão local, pode ser que o servidor ainda esteja iniciando
    if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
      console.warn(`[PING WARNING] Servidor pode estar iniciando. Tentando novamente no próximo ciclo.`);
    }
    
    return { success: false, error: error.message };
  }
};

// Configurações via variáveis de ambiente
const PING_ENABLED = process.env.PING_ENABLED !== 'false'; // Default: true
const PING_INTERVAL = parseInt(process.env.PING_INTERVAL || '600000', 10); // Default: 10 minutos (600000ms)
const PING_DELAY = parseInt(process.env.PING_DELAY || '60000', 10); // Default: 1 minuto após iniciar

// Validar intervalo (mínimo 5 minutos, máximo 20 minutos)
const MIN_INTERVAL = 5 * 60 * 1000; // 5 minutos
const MAX_INTERVAL = 20 * 60 * 1000; // 20 minutos

const validInterval = Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, PING_INTERVAL));

// Inicializar sistema de ping
if (PING_ENABLED) {
  console.log('='.repeat(50));
  console.log('[PING SYSTEM] Sistema de ping automático ATIVADO');
  console.log(`[PING SYSTEM] Intervalo: ${validInterval / 1000 / 60} minutos`);
  console.log(`[PING SYSTEM] Primeiro ping em: ${PING_DELAY / 1000} segundos`);
  console.log(`[PING SYSTEM] URL base: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}`);
  console.log('='.repeat(50));
  
  // Fazer primeiro ping após delay inicial (permite servidor iniciar completamente)
  setTimeout(() => {
    console.log('[PING SYSTEM] Executando primeiro ping...');
    fazerPingInterno();
  }, PING_DELAY);
  
  // Configurar ping periódico
  const pingIntervalId = setInterval(() => {
    fazerPingInterno();
  }, validInterval);
  
  // Salvar interval ID para possível limpeza futura
  // (útil se precisar parar o ping em algum momento)
  if (typeof global !== 'undefined') {
    global.pingIntervalId = pingIntervalId;
  }
  
  // Log de confirmação
  console.log(`[PING SYSTEM] Ping automático configurado com sucesso!`);
} else {
  console.log('[PING SYSTEM] Sistema de ping automático DESATIVADO (PING_ENABLED=false)');
}

// Função de limpeza (opcional) - útil para parar o ping se necessário
const pararPing = () => {
  if (typeof global !== 'undefined' && global.pingIntervalId) {
    clearInterval(global.pingIntervalId);
    global.pingIntervalId = null;
    console.log('[PING SYSTEM] Sistema de ping parado');
    return true;
  }
  return false;
};

// Expor função globalmente (opcional)
if (typeof global !== 'undefined') {
  global.pararPing = pararPing;
}

// Endpoint para controlar o sistema de ping (opcional)
app.get('/ping/status', (req, res) => {
  res.json({
    enabled: PING_ENABLED,
    interval: validInterval,
    intervalMinutes: validInterval / 1000 / 60,
    running: typeof global !== 'undefined' && global.pingIntervalId !== null
  });
});

// Graceful shutdown - parar ping quando servidor for encerrado
process.on('SIGTERM', () => {
  console.log('[PING SYSTEM] Recebido SIGTERM, parando ping...');
  pararPing();
});

process.on('SIGINT', () => {
  console.log('[PING SYSTEM] Recebido SIGINT, parando ping...');
  pararPing();
});

// Relatório por email (SendGrid) - semanal e geral, disparado por endpoint
app.post('/report/email', async (req, res) => {
  try {
    const panel = process.env.PANEL_URL;
    const key = process.env.SENDGRID_API_KEY; // SG.xxxxx
    const to = process.env.REPORT_TO; // emails separados por vírgula
    const from = process.env.REPORT_FROM || 'no-reply@velotax.local';
    if (!panel) return res.status(400).json({ ok: false, error: 'PANEL_URL ausente' });
    if (!key || !to) return res.status(400).json({ ok: false, error: 'SENDGRID_API_KEY ou REPORT_TO ausente' });

    const r = await fetch(`${panel}/api/requests`);
    if (!r.ok) return res.status(502).json({ ok: false, error: 'Falha ao buscar requests do painel' });
    const list = await r.json();
    const arr = Array.isArray(list) ? list : [];

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7*24*60*60*1000);
    const inWeek = arr.filter((x) => new Date(x?.createdAt||0) >= weekAgo);

    const count = (xs, fn) => xs.reduce((m, x) => (m[fn(x)] = (m[fn(x)]||0)+1, m), {});
    const byStatusWeek = count(inWeek, x => String(x?.status||'').toLowerCase()||'—');
    const byStatusAll = count(arr, x => String(x?.status||'').toLowerCase()||'—');
    const byAgentWeek = count(inWeek, x => String(x?.agente||'')||'—');
    const byAgentAll = count(arr, x => String(x?.agente||'')||'—');
    const perDayWeek = count(inWeek, x => new Date(x?.createdAt||0).toISOString().slice(0,10));

    const fmt = (obj) => Object.entries(obj).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}: ${v}`).join('<br>');
    const html = `
      <h2>Relatório de Uso do Painel</h2>
      <h3>Últimos 7 dias</h3>
      Total: ${inWeek.length}<br>
      Por dia:<br>${fmt(perDayWeek)}<br><br>
      Por status:<br>${fmt(byStatusWeek)}<br><br>
      Por agente:<br>${fmt(byAgentWeek)}<br><br>
      <h3>Geral</h3>
      Total: ${arr.length}<br>
      Por status:<br>${fmt(byStatusAll)}<br><br>
      Por agente:<br>${fmt(byAgentAll)}<br><br>
      <small>Gerado em ${now.toLocaleString('pt-BR')}</small>
    `;

    const toList = String(to).split(',').map(s=>s.trim()).filter(Boolean);
    const payload = {
      personalizations: [{ to: toList.map(e=>({ email: e })) }],
      from: { email: from, name: 'Velotax Painel' },
      subject: 'Relatório de Uso do Painel (Semanal e Geral)',
      content: [{ type: 'text/html', value: html }]
    };
    const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const ok = sgRes.status === 202;
    let sgText = '';
    try { sgText = await sgRes.text(); } catch {}
    console.log('[REPORT EMAIL]', { status: sgRes.status, ok, sample: sgText?.slice(0,200) });
    if (!ok) return res.status(502).json({ ok: false, status: sgRes.status, body: sgText });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

