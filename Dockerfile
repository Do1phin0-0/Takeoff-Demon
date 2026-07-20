FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY public ./public
COPY lib ./lib
COPY prompts ./prompts
COPY templates ./templates

RUN mkdir -p /app/uploads
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
