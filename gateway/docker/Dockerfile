# ================================================================
# ECOM-WATCH — API Gateway Dockerfile
# Nginx alpine + gettext pour envsubst (substitution variables)
# ================================================================

FROM nginx:1.25-alpine

# gettext fournit envsubst pour la substitution des variables d'env
RUN apk add --no-cache gettext

# Supprime la config Nginx par défaut
RUN rm /etc/nginx/conf.d/default.conf

# Copie nos configs
COPY nginx/nginx.conf       /etc/nginx/nginx.conf
COPY nginx/conf.d/          /etc/nginx/conf.d/

# Copie et rend exécutable le script de démarrage
COPY docker/entrypoint.sh   /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Nginx écoute sur PORT (Render l'injecte dynamiquement)
# EXPOSE symbolique — Render utilise la variable PORT
EXPOSE 10000

# Logs vers stdout/stderr (best practice containers)
RUN ln -sf /dev/stdout /var/log/nginx/access.log \
 && ln -sf /dev/stderr /var/log/nginx/error.log

# Tourne en non-root pour la sécurité
RUN chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx/conf.d \
 && chown nginx:nginx /entrypoint.sh
USER nginx

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost:${PORT:-10000}/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]