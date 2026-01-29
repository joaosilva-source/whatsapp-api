# Configuração de Reações do WhatsApp para Inova-Hub

## ✅ Status da Implementação

O listener de reações **já está implementado** no código! Você só precisa configurar a variável de ambiente.

## 🔧 Configuração Necessária

### Variável de Ambiente

Adicione a seguinte variável de ambiente no seu serviço (Render, Railway, Heroku, etc.):

```bash
INOVA_HUB_API_URL=https://velohub-278491073220.us-east1.run.app
```

**Ou para desenvolvimento local:**
```bash
INOVA_HUB_API_URL=http://localhost:8090
```

### Compatibilidade

O código suporta ambas as variáveis (para compatibilidade):
- `INOVA_HUB_API_URL` (prioridade)
- `BACKEND_URL` (fallback)

## 📍 Onde Configurar

### Render.com

1. Acesse o painel do seu serviço
2. Vá em **Environment**
3. Adicione:
   - **Key:** `INOVA_HUB_API_URL`
   - **Value:** `https://velohub-278491073220.us-east1.run.app`
4. Clique em **Save Changes**
5. O serviço reiniciará automaticamente

### Railway / Heroku / Outros

1. Acesse o painel do serviço
2. Vá em **Variables** ou **Config Vars**
3. Adicione a variável `INOVA_HUB_API_URL`
4. Reinicie o serviço

### Desenvolvimento Local

Crie um arquivo `.env` na raiz do projeto:

```bash
INOVA_HUB_API_URL=http://localhost:8090
```

## 🧪 Como Funciona

1. **Usuário reage** com ✅ ou ❌ a uma mensagem no WhatsApp
2. **Listener detecta** a reação (já implementado nas linhas 182-221 e 224-327)
3. **Chama o endpoint** `/api/escalacoes/solicitacoes/auto-status` do Inova-Hub
4. **Status é atualizado** automaticamente no banco de dados

## 📊 Logs Esperados

Quando uma reação for processada, você verá nos logs:

```
[REACTION][update] { emoji: '✅', reactorDigits: '5511999999999', keyId: '3EB0C767F26C747C5A30' }
[AUTO-STATUS/UPDATE] Marcando via reação ✅ { waMessageId: '3EB0C767F26C747C5A30', reactorDigits: '5511999999999' }
[AUTO-STATUS] Fazendo requisição HTTP...
[AUTO-STATUS] URL: https://velohub-278491073220.us-east1.run.app/api/escalacoes/solicitacoes/auto-status
[AUTO-STATUS] ✅ Status atualizado com sucesso!
```

## 🐛 Troubleshooting

### Reações não estão sendo detectadas

- ✅ Verifique se o WhatsApp está conectado
- ✅ Verifique os logs para erros
- ✅ Teste reagindo manualmente a uma mensagem

### Status não está sendo atualizado

- ✅ Verifique se `INOVA_HUB_API_URL` está configurada corretamente
- ✅ Verifique se o Inova-Hub está acessível
- ✅ Verifique os logs para erros de conexão
- ✅ Verifique se o `waMessageId` corresponde ao da solicitação

### Erro 404 (Solicitação não encontrada)

- ✅ Verifique se a solicitação foi criada com sucesso
- ✅ Verifique se o `waMessageId` está salvo na solicitação
- ✅ Verifique se o `waMessageId` da reação corresponde ao da mensagem

## 📝 Checklist

- [ ] Variável `INOVA_HUB_API_URL` configurada
- [ ] Serviço reiniciado após configurar a variável
- [ ] Teste com reação ✅ funcionou
- [ ] Teste com reação ❌ funcionou
- [ ] Status atualiza no Inova-Hub

## 🔗 Referências

- Endpoint: `/api/escalacoes/solicitacoes/auto-status`
- Código do listener: linhas 182-221 e 224-327 do `index.js`
- Função de atualização: linhas 76-125 do `index.js`

