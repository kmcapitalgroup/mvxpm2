#!/bin/bash

# Script de déploiement PM2 pour MultiversX Timestamp Service
# Usage: ./deploy.sh [production|development]

set -e

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction pour afficher les messages
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Vérifier les arguments
ENV=${1:-production}

if [[ "$ENV" != "production" && "$ENV" != "development" ]]; then
    log_error "Environnement invalide. Utilisez 'production' ou 'development'"
    exit 1
fi

log_info "🚀 Déploiement en mode: $ENV"

# Vérifier que npm est installé
if ! command -v npm &> /dev/null; then
    log_error "npm n'est pas installé. Installation de Node.js et npm..."
    
    # Détecter le système d'exploitation et installer Node.js/npm
    if [ -f /etc/debian_version ]; then
        log_info "📦 Installation de Node.js et npm via NodeSource (Ubuntu/Debian)..."
        
        # Supprimer les anciens packages Node.js pour éviter les conflits
        log_info "🧹 Suppression des anciens packages Node.js..."
        sudo apt-get remove -y nodejs npm libnode-dev node-gyp
        sudo apt-get autoremove -y
        sudo apt-get autoclean
        
        # Installer Node.js 18 via NodeSource
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif [ -f /etc/redhat-release ]; then
        log_info "📦 Installation de Node.js et npm via NodeSource (CentOS/RHEL)..."
        curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
        sudo yum install -y nodejs
    else
        log_error "❌ Système d'exploitation non supporté pour l'installation automatique"
        log_error "Veuillez installer Node.js et npm manuellement depuis: https://nodejs.org/"
        exit 1
    fi
    
    # Vérifier que npm est maintenant disponible
    if ! command -v npm &> /dev/null; then
        log_error "❌ Échec de l'installation de npm"
        exit 1
    fi
    
    log_success "✅ Node.js et npm installés avec succès"
fi

# Vérifier que PM2 est installé
if ! command -v pm2 &> /dev/null; then
    log_error "PM2 n'est pas installé. Installation..."
    npm install -g pm2
fi

# Vérifier que Redis est disponible (optionnel)
if command -v redis-cli &> /dev/null; then
    if redis-cli ping &> /dev/null; then
        log_success "Redis est disponible"
    else
        log_warning "Redis n'est pas accessible. Le cache sera désactivé."
    fi
else
    log_warning "Redis n'est pas installé. Le cache sera désactivé."
fi

# Créer les dossiers nécessaires
log_info "📁 Création des dossiers..."
mkdir -p logs
mkdir -p temp
mkdir -p cache

# Configuration automatique des ports et du firewall
log_info "🔧 Configuration automatique des ports..."

# Fonction pour configurer le firewall
configure_firewall() {
    local port=$1
    local service_name=$2
    
    log_info "🔓 Ouverture du port $port pour $service_name..."
    
    # Vérifier si UFW est disponible (Ubuntu/Debian)
    if command -v ufw &> /dev/null; then
        log_info "📦 Configuration UFW (Ubuntu/Debian)..."
        
        # Activer UFW si pas déjà fait
        if ! sudo ufw status | grep -q "Status: active"; then
            log_info "🔥 Activation du firewall UFW..."
            echo "y" | sudo ufw enable
        fi
        
        # Ouvrir le port
        sudo ufw allow $port/tcp comment "$service_name"
        log_success "✅ Port $port ouvert via UFW"
        
    # Vérifier si firewalld est disponible (CentOS/RHEL)
    elif command -v firewall-cmd &> /dev/null; then
        log_info "📦 Configuration Firewalld (CentOS/RHEL)..."
        
        # Démarrer firewalld si pas déjà fait
        if ! sudo firewall-cmd --state &> /dev/null; then
            log_info "🔥 Démarrage du firewall..."
            sudo systemctl start firewalld
            sudo systemctl enable firewalld
        fi
        
        # Ouvrir le port
        sudo firewall-cmd --permanent --add-port=$port/tcp
        sudo firewall-cmd --reload
        log_success "✅ Port $port ouvert via Firewalld"
        
    # Vérifier si iptables est disponible
    elif command -v iptables &> /dev/null; then
        log_info "📦 Configuration iptables..."
        
        # Ajouter la règle iptables
        sudo iptables -A INPUT -p tcp --dport $port -j ACCEPT
        
        # Sauvegarder les règles selon le système
        if command -v iptables-save &> /dev/null; then
            if [ -f /etc/debian_version ]; then
                sudo iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
            elif [ -f /etc/redhat-release ]; then
                sudo service iptables save 2>/dev/null || true
            fi
        fi
        
        log_success "✅ Port $port ouvert via iptables"
    else
        log_warning "⚠️  Aucun firewall détecté ou configuré"
        log_info "💡 Le port $port devrait être accessible, mais vérifiez votre configuration réseau"
    fi
}

# Configuration des ports nécessaires
log_info "🌐 Configuration des ports pour MultiversX Timestamp Service..."

# Port principal de l'application (3000 par défaut)
APP_PORT=$(grep -E '^PORT=' .env 2>/dev/null | cut -d'=' -f2 || echo "3000")
if [[ -z "$APP_PORT" ]]; then
    APP_PORT=3000
fi

configure_firewall $APP_PORT "MultiversX Timestamp API"

# Port SSH (22) - s'assurer qu'il reste ouvert
configure_firewall 22 "SSH Access"

# Port HTTP (80) - pour Nginx si utilisé
if command -v nginx &> /dev/null; then
    configure_firewall 80 "HTTP Nginx"
    log_info "📦 Nginx détecté, port 80 configuré"
fi

# Port HTTPS (443) - pour Nginx SSL si utilisé
if command -v nginx &> /dev/null && [ -d "/etc/nginx/ssl" ]; then
    configure_firewall 443 "HTTPS Nginx SSL"
    log_info "🔒 Configuration SSL détectée, port 443 configuré"
fi

# Ajouter HOST=0.0.0.0 dans .env si pas présent
if ! grep -q "^HOST=" .env 2>/dev/null; then
    log_info "🔧 Configuration HOST=0.0.0.0 dans .env..."
    echo "" >> .env
    echo "# Network Configuration" >> .env
    echo "HOST=0.0.0.0" >> .env
    log_success "✅ HOST=0.0.0.0 ajouté à .env"
else
    # Vérifier si HOST n'est pas localhost
    CURRENT_HOST=$(grep "^HOST=" .env | cut -d'=' -f2)
    if [[ "$CURRENT_HOST" == "localhost" || "$CURRENT_HOST" == "127.0.0.1" ]]; then
        log_warning "⚠️  HOST configuré sur $CURRENT_HOST (accès local uniquement)"
        log_info "🔧 Modification vers HOST=0.0.0.0 pour accès externe..."
        sed -i 's/^HOST=.*/HOST=0.0.0.0/' .env
        log_success "✅ HOST modifié vers 0.0.0.0"
    fi
fi

# Afficher un résumé de la configuration réseau
log_info "📋 Résumé de la configuration réseau:"
echo "  - Port application: $APP_PORT"
echo "  - Host: 0.0.0.0 (toutes interfaces)"
echo "  - SSH: 22"
if command -v nginx &> /dev/null; then
    echo "  - HTTP: 80 (Nginx)"
    if [ -d "/etc/nginx/ssl" ]; then
        echo "  - HTTPS: 443 (Nginx SSL)"
    fi
fi

# Nettoyer le cache npm et installer les dépendances
log_info "🧹 Nettoyage du cache npm..."
npm cache clean --force

log_info "📦 Installation des dépendances..."
rm -rf node_modules package-lock.json
npm install --production

# Vérifier le fichier .env
if [[ ! -f ".env" ]]; then
    log_warning "Fichier .env manquant. Copie depuis .env.example..."
    cp .env.example .env
    log_warning "⚠️  IMPORTANT: Configurez le fichier .env avant de continuer!"
    log_info "Ouverture automatique de nano pour éditer .env..."
    nano .env
    log_info "✅ Configuration .env terminée, poursuite du déploiement..."
fi

# Vérifier que le script principal existe
if [[ ! -f "src/app.js" ]]; then
    log_error "Le fichier src/app.js n'existe pas!"
    log_error "Vérifiez que vous êtes dans le bon répertoire du projet."
    exit 1
fi

# Vérifier la version de Node.js pour compatibilité
log_info "📋 Vérification de la version Node.js..."
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
log_info "Version Node.js détectée: v$NODE_VERSION"

if [ "$NODE_VERSION" -lt 18 ]; then
    log_warning "⚠️  Node.js v$NODE_VERSION détecté - Version insuffisante!"
    log_warning "Ce projet nécessite Node.js 18+ pour fonctionner correctement."
    log_info "🔄 Mise à jour automatique de Node.js..."
    
    # Vérifier si nvm est disponible
    if command -v nvm &> /dev/null; then
        log_info "📦 Utilisation de nvm pour installer Node.js 18..."
        nvm install 18
        nvm use 18
        log_info "✅ Node.js mis à jour via nvm"
    elif command -v curl &> /dev/null && [ -f /etc/debian_version ]; then
        log_info "📦 Installation de Node.js 18 via NodeSource (Ubuntu/Debian)..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
        log_info "✅ Node.js mis à jour via apt"
    elif command -v yum &> /dev/null; then
        log_info "📦 Installation de Node.js 18 via NodeSource (CentOS/RHEL)..."
        curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
        sudo yum install -y nodejs
        log_info "✅ Node.js mis à jour via yum"
    else
        log_error "❌ Impossible de mettre à jour Node.js automatiquement"
        log_error "Veuillez installer Node.js 18+ manuellement:"
        log_error "- Via nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
        log_error "- Ou télécharger depuis: https://nodejs.org/"
        exit 1
    fi
    
    # Vérifier la nouvelle version
    NEW_NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NEW_NODE_VERSION" -ge 18 ]; then
        log_info "✅ Node.js v$NEW_NODE_VERSION installé avec succès"
        # Nettoyer complètement npm et réinstaller les dépendances
        log_info "🧹 Nettoyage complet npm après mise à jour Node.js..."
        npm cache clean --force
        rm -rf node_modules package-lock.json ~/.npm
        log_info "📦 Réinstallation des dépendances avec la nouvelle version Node.js..."
        npm install --production
    else
        log_error "❌ Échec de la mise à jour Node.js"
        log_error "Version actuelle: v$NEW_NODE_VERSION, requis: v18+"
        exit 1
    fi
fi

# Vérifier que nous sommes dans le bon répertoire
if [[ ! -f "package.json" ]]; then
    log_error "Le fichier package.json n'existe pas!"
    log_error "Vérifiez que vous êtes dans le répertoire racine du projet."
    exit 1
fi

# Arrêter l'application si elle tourne déjà
log_info "🛑 Arrêt de l'application existante..."
pm2 delete multiversx-timestamp 2>/dev/null || true

# Démarrer l'application
log_info "▶️  Démarrage de l'application..."
pm2 start ecosystem.config.js --env $ENV

# Sauvegarder la configuration PM2
log_info "💾 Sauvegarde de la configuration PM2..."
pm2 save

# Configuration du monitoring PM2 (optionnel)
log_info "📊 Configuration du monitoring PM2..."
echo
log_info "Pour activer le monitoring PM2 Plus, vous avez besoin d'un lien de connexion."
log_info "<secret_key> <public_key>"
echo
read -p "Avez-vous un lien PM2 monitoring à configurer? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo
    log_info "Collez votre commande PM2 link complète (ex: pm2 link secret_key public_key):"
    read -p "PM2 Link: " PM2_LINK_PARAMS
    
    if [[ -n "$PM2_LINK_PARAMS" ]]; then
        log_info "🔗 Configuration du lien PM2 monitoring..."
        pm2 link $PM2_LINK_PARAMS
        
        if [ $? -eq 0 ]; then
            log_success "✅ Monitoring PM2 configuré avec succès!"
            log_info "🌐 Accédez à votre dashboard: https://app.pm2.io"
        else
            log_error "❌ Erreur lors de la configuration du monitoring"
            log_info "💡 Vérifiez vos clés et réessayez manuellement: pm2 link $PM2_LINK_PARAMS"
        fi
    else
        log_warning "Aucun paramètre fourni, monitoring non configuré"
    fi
else
    log_info "Monitoring PM2 non configuré (vous pouvez le faire plus tard avec: pm2 link <secret> <public>)"
fi

# Configurer le démarrage automatique
log_info "🔄 Configuration du démarrage automatique..."
pm2 startup

# Afficher le statut
log_info "📊 Statut de l'application:"
pm2 status

# Afficher les logs en temps réel (optionnel)
log_success "✅ Déploiement terminé!"
log_info "📝 Commandes utiles:"
echo "  - Voir les logs: pm2 logs multiversx-timestamp"
echo "  - Redémarrer: pm2 restart multiversx-timestamp"
echo "  - Arrêter: pm2 stop multiversx-timestamp"
echo "  - Monitoring local: pm2 monit"
echo "  - Status: pm2 status"
echo "  - Dashboard web: https://app.pm2.io (si monitoring configuré)"
echo "  - Configurer monitoring: pm2 link <secret_key> <public_key>"
echo "  - Déconnecter monitoring: pm2 unlink"

read -p "Voulez-vous voir les logs en temps réel? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    pm2 logs multiversx-timestamp
fi