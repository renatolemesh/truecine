FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Caminho relativo por padrão: o navegador chama /api no mesmo host/porta
# que serviu a página, e o nginx faz proxy para o backend (ver nginx.conf).
# Só defina VITE_API_URL se quiser apontar para uma API em outro domínio.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5173
