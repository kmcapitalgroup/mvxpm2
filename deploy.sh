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