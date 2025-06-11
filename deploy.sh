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

# Installer les dépendances
log_info "📦 Installation des dépendances..."
npm install --production

# Vérifier le fichier .env
if [[ ! -f ".env" ]]; then
    log_warning "Fichier .env manquant. Copie depuis .env.example..."
    cp .env.example .env
    log_warning "⚠️  IMPORTANT: Configurez le fichier .env avant de continuer!"
    read -p "Appuyez sur Entrée après avoir configuré .env..."
fi

# Vérifier que le script principal existe
if [[ ! -f "src/app.js" ]]; then
    log_error "Le fichier src/app.js n'existe pas!"
    log_error "Vérifiez que vous êtes dans le bon répertoire du projet."
    exit 1
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
echo "  - Monitoring: pm2 monit"
echo "  - Status: pm2 status"

read -p "Voulez-vous voir les logs en temps réel? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    pm2 logs multiversx-timestamp
fi