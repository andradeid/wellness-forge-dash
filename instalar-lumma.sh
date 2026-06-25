#!/bin/bash
set -e

echo ""
echo "=================================================="
echo "        INSTALANDO LUMMA NA VPS"
echo "=================================================="
echo ""

# 1. ATUALIZA O SISTEMA
echo "📦 [1/7] Atualizando sistema..."
apt update -y && apt upgrade -y

# 2. INSTALA DEPENDÊNCIAS
echo ""
echo "🔧 [2/7] Instalando dependências..."
apt install -y curl git nginx certbot python3-certbot-nginx

# 3. INSTALA DOCKER
echo ""
echo "🐳 [3/7] Instalando Docker..."
curl -fsSL https://get.docker.com | bash
systemctl enable docker
systemctl start docker

# 4. INSTALA BUN
echo ""
echo "🥟 [4/7] Instalando Bun..."
curl -fsSL https://bun.sh/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# 5. CLONA O REPOSITÓRIO
echo ""
echo "📥 [5/7] Clonando repositório..."
rm -rf /var/www/lumma
git clone https://github.com/andradeid/wellness-forge-dash.git /var/www/lumma
cd /var/www/lumma

# 6. CRIA O .ENV
echo ""
echo "⚙️  [6/7] Configurando variáveis de ambiente..."
cat > /var/www/lumma/.env << 'EOF'
SUPABASE_PROJECT_ID="bidarktpgytizdgmmqrg"
SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZGFya3RwZ3l0aXpkZ21tcXJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNDg2NzgsImV4cCI6MjA5MzkyNDY3OH0.l4vRyyKIfSozA6-3WkbrkEO1mvDHMjme71w8_XZWjNg"
SUPABASE_URL="https://bidarktpgytizdgmmqrg.supabase.co"
VITE_SUPABASE_PROJECT_ID="bidarktpgytizdgmmqrg"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZGFya3RwZ3l0aXpkZ21tcXJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNDg2NzgsImV4cCI6MjA5MzkyNDY3OH0.l4vRyyKIfSozA6-3WkbrkEO1mvDHMjme71w8_XZWjNg"
VITE_SUPABASE_URL="https://bidarktpgytizdgmmqrg.supabase.co"
EOF

# 7. BUILD E SOBE
echo ""
echo "🔨 [7/7] Fazendo build e subindo aplicação..."
bun install
bun run build

# CONFIGURA NGINX
echo ""
echo "🌐 Configurando Nginx..."
cat > /etc/nginx/sites-available/lumma << 'NGINX'
server {
    listen 80;
    server_name lumma.ia.br;
    root /var/www/lumma/dist;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /health {
        return 200 'ok';
        add_header Content-Type text/plain;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/lumma /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# SSL
echo ""
echo "🔒 Configurando SSL (HTTPS)..."
certbot --nginx -d lumma.ia.br --non-interactive --agree-tos -m andradeid@gmail.com

echo ""
echo "=================================================="
echo "           ✅ LUMMA INSTALADO COM SUCESSO!"
echo "=================================================="
echo ""
echo "🌐 Acesse: https://lumma.ia.br"
echo ""
