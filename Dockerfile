FROM nginx:alpine

COPY app /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
