FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY index.html /usr/share/nginx/html/index.html
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY assets/ /usr/share/nginx/html/assets/
COPY psquote/ /usr/share/nginx/html/psquote/
COPY auth/htpasswd /etc/nginx/auth/htpasswd

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://127.0.0.1/ || exit 1
