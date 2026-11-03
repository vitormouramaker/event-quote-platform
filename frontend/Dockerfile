FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# O Vite injeta estas variáveis no bundle em tempo de BUILD, por isso elas vêm
# como build args.
ARG VITE_API_URL=http://localhost:4444
ARG VITE_WHATSAPP_NUMBER=5511900000000
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WHATSAPP_NUMBER=$VITE_WHATSAPP_NUMBER

RUN npm run build

FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
