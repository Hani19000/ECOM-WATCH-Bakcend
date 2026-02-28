#!/bin/sh
set -e

echo "ECOM-WATCH Gateway démarrage..."
echo "PORT     = ${PORT}"
echo "MONOLITH = ${MONOLITH_URL}"
echo "FRONTEND = ${FRONTEND_DOMAIN}"

mkdir -p /tmp/nginx/conf.d

envsubst '${PORT} ${MONOLITH_URL} ${FRONTEND_DOMAIN}' \
  < /etc/nginx/nginx.conf > /tmp/nginx/nginx.conf

envsubst '${PORT} ${MONOLITH_URL} ${FRONTEND_DOMAIN}' \
  < /etc/nginx/conf.d/default.conf > /tmp/nginx/conf.d/default.conf

cp /etc/nginx/conf.d/proxy_params.conf /tmp/nginx/conf.d/proxy_params.conf

echo "Validation config..."
nginx -t -c /tmp/nginx/nginx.conf

echo "Gateway prêt sur :${PORT}"
exec nginx -g "daemon off;" -c /tmp/nginx/nginx.conf