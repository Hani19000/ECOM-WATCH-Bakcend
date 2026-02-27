FROM nginx:1.25-alpine
RUN apk add --no-cache gettext
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/nginx.conf     /etc/nginx/nginx.conf
COPY nginx/conf.d/        /etc/nginx/conf.d/
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
RUN ln -sf /dev/stdout /var/log/nginx/access.log \
 && ln -sf /dev/stderr /var/log/nginx/error.log
EXPOSE 10000
ENTRYPOINT ["/entrypoint.sh"]