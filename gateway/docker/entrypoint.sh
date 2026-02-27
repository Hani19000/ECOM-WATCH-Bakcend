#!/bin/sh
# ================================================================
# entrypoint.sh
# Render injecte PORT dynamiquement → on substitue dans les configs
# Nginx ne peut pas lire les variables d'env directement dans les
# directives, on utilise envsubst pour les injecter au démarrage.
# ================================================================

set -e

echo "🚀 ECOM-WATCH Gateway démarrage..."
echo "   PORT        = ${PORT}"
echo "   MONOLITH    = ${MONOLITH_URL}"
echo "   FRONTEND    = ${FRONTEND_DOMAIN}"

# Substitue les variables d'env dans les configs Nginx
# On cible uniquement nos variables pour ne pas casser les variables
# Nginx natives ($host, $uri, etc.)
ENV_VARS='$PORT $MONOLITH_URL $FRONTEND_DOMAIN $cors_origin'

envsubst "$ENV_VARS" < /etc/nginx/nginx.conf     > /tmp/nginx.conf
envsubst "$ENV_VARS" < /etc/nginx/conf.d/default.conf > /tmp/default.conf

# Copie les fichiers substitués à leur place finale
cp /tmp/nginx.conf    /etc/nginx/nginx.conf
cp /tmp/default.conf  /etc/nginx/conf.d/default.conf

# Validation config avant de démarrer
echo "✅ Validation config Nginx..."
nginx -t -c /etc/nginx/nginx.conf

echo "✅ Gateway prêt — écoute sur :${PORT}"
exec nginx -g "daemon off;" -c /etc/nginx/nginx.conf