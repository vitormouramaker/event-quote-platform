FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
# A API roda sem root. A pasta de anexos locais fica gravável para o usuário node.
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node
EXPOSE 4444
CMD ["node", "src/app.js"]
