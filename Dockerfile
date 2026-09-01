FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY public ./public
COPY lib ./lib
COPY prompts ./prompts
COPY templates ./templates

RUN mkdir -p /app/uploads && chown -R node:node /app
ENV PORT=3000
EXPOSE 3000

# Run as the non-root "node" user (built into the node:alpine base image)
# instead of root — uploads/ is chowned above so the app can still write
# its own data/markups/contracts/traces subdirectories under it at runtime.
USER node

CMD ["node", "server.js"]
