if (connection === 'close') {
  const status = lastDisconnect?.error?.output?.statusCode;
  console.log(`DESCONECTADO (${status}) → Reconectando em 2s...`);
  setTimeout(() => {
    reconnecting = false;
    connect();
  }, 2000); // 2 segundos
}
