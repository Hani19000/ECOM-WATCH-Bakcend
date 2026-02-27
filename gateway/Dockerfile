# ================================================================
# ECOM-WATCH — API Gateway Dockerfile
# Nginx alpine + gettext pour envsubst (substitution variables)
# ================================================================

FROM nginx:1.25-alpine

# gettext fournit envsubst pour la substitution des variables d'env
RUN apk add --no-cache gettext

# Supprime la config Nginx par défaut
RUN rm /etc/nginx/conf.d/default.conf

# Copie nos configs (chemins relatifs depuis gateway/)
COPY nginx/nginx.conf       /etc/nginx/nginx.conf
COPY nginx/conf.d/          /etc/nginx/conf.d/

# Copie et rend exécutable le script de démarrage
COPY docker/entrypoint.sh   /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Logs vers stdout/stderr
RUN ln -sf /dev/stdout /var/log/nginx/access.log \
 && ln -sf /dev/stderr /var/log/nginx/error.log

# Tourne en non-root
RUN chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx/conf.d \
 && chown nginx:nginx /entrypoint.sh
USER nginx

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost:${PORT:-10000}/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]