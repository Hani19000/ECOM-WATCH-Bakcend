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

# Prépare les dossiers dans /tmp (pas de problème de permissions)
mkdir -p /tmp/nginx/conf.d

# Substitue les variables d'env dans les configs Nginx
# On cible uniquement nos variables pour ne pas casser les variables
# Nginx natives ($host, $uri, $remote_addr, etc.)
ENV_VARS='$PORT $MONOLITH_URL $FRONTEND_DOMAIN'

envsubst "$ENV_VARS" < /etc/nginx/nginx.conf          > /tmp/nginx/nginx.conf
envsubst "$ENV_VARS" < /etc/nginx/conf.d/default.conf > /tmp/nginx/conf.d/default.conf

# proxy_params n'a pas de variables à substituer, on le copie tel quel
cp /etc/nginx/conf.d/proxy_params.conf /tmp/nginx/conf.d/proxy_params.conf

# Validation config avant de démarrer
echo "✅ Validation config Nginx..."
nginx -t -c /tmp/nginx/nginx.conf

echo "✅ Gateway prêt — écoute sur :${PORT}"
exec nginx -g "daemon off;" -c /tmp/nginx/nginx.conf