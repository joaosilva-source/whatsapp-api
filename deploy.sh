#!/bin/bash

# Script de Deploy - WhatsApp API
# Uso: ./deploy.sh [render|docker|local]

set -e

echo "🚀 Iniciando deploy da WhatsApp API..."

# Verificar se está no diretório correto
if [ ! -f "index.js" ]; then
    echo "❌ Erro: index.js não encontrado. Execute este script no diretório raiz da API."
    exit 1
fi

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Erro: Node.js não está instalado."
    exit 1
fi

# Verificar npm
if ! command -v npm &> /dev/null; then
    echo "❌ Erro: npm não está instalado."
    exit 1
fi

# Instalar dependências
echo "📦 Instalando dependências..."
npm install

# Verificar se as dependências foram instaladas
if [ ! -d "node_modules" ]; then
    echo "❌ Erro: Falha ao instalar dependências."
    exit 1
fi

# Criar diretório auth se não existir
echo "📁 Verificando diretório de autenticação..."
mkdir -p auth

# Tipo de deploy
DEPLOY_TYPE=${1:-render}

case $DEPLOY_TYPE in
    "render")
        echo "🎨 Deploy para Render..."
        
        # Verificar se tem Render CLI
        if ! command -v railway &> /dev/null; then
            echo "📥 Instalando Render CLI..."
            npm install -g @render/cli
        fi
        
        # Verificar se tem Git
        if ! command -v git &> /dev/null; then
            echo "❌ Erro: Git não está instalado."
            exit 1
        fi
        
        # Inicializar Git se necessário
        if [ ! -d ".git" ]; then
            git init
            git add .
            git commit -m "Initial commit - WhatsApp API"
        fi
        
        # Deploy
        render deploy
        ;;
        
    "railway")
        echo "🚂 Deploy para Railway..."
        
        # Verificar se tem Railway CLI
        if ! command -v railway &> /dev/null; then
            echo "📥 Instalando Railway CLI..."
            npm install -g @railway/cli
        fi
        
        # Login no Railway
        railway login
        
        # Deploy
        railway up
        ;;
        
    "docker")
        echo "🐳 Build e deploy com Docker..."
        
        # Verificar se tem Docker
        if ! command -v docker &> /dev/null; then
            echo "❌ Erro: Docker não está instalado."
            exit 1
        fi
        
        # Verificar se tem docker-compose
        if ! command -v docker-compose &> /dev/null; then
            echo "❌ Erro: docker-compose não está instalado."
            exit 1
        fi
        
        # Build e run
        docker-compose down
        docker-compose build --no-cache
        docker-compose up -d
        
        echo "✅ API rodando em http://localhost:3000"
        echo "📊 Verificar logs: docker-compose logs -f"
        ;;
        
    "local")
        echo "🏠 Iniciando servidor local..."
        
        # Verificar porta 3000
        if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
            echo "⚠️ Porta 3000 já está em uso."
            echo "Deseja parar o processo existente? (y/n)"
            read -r response
            if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
                lsof -ti:3000 | xargs kill -9
                echo "✅ Processo parado."
            else
                echo "❌ Cancelando deploy."
                exit 1
            fi
        fi
        
        # Iniciar servidor
        node index.js
        ;;
        
    *)
        echo "❌ Tipo de deploy inválido. Opções: render, railway, docker, local"
        exit 1
        ;;
esac

echo "✅ Deploy concluído com sucesso!"

# Pós-deploy
echo "🔍 Verificação pós-deploy..."

# Testar se a API está respondendo
if command -v curl &> /dev/null; then
    sleep 5  # Esperar a API iniciar
    
    if curl -f http://localhost:3000/status &> /dev/null 2>&1; then
        echo "✅ API respondendo corretamente!"
    elif curl -f https://whatsapp-api-y40p.onrender.com/status &> /dev/null 2>&1; then
        echo "✅ API respondendo corretamente em produção!"
    else
        echo "⚠️ Aviso: API não está respondendo. Verifique os logs."
    fi
fi

echo "🎉 Deploy finalizado!"
echo "📋 Próximos passos:"
echo "   1. Escanear o QR code (se necessário)"
echo "   2. Testar envio de mensagens"
echo "   3. Configurar webhook no painel Velotax"
echo "   4. Monitorar logs e conexão"

# Comandos úteis
echo ""
echo "🔧 Comandos úteis:"
echo "   Ver logs: docker-compose logs -f (se Docker)"
echo "   Ver status: curl http://localhost:3000/status"
echo "   Reiniciar: docker-compose restart (se Docker)"
echo "   Parar: docker-compose down (se Docker)"
