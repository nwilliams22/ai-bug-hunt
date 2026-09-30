FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node package*.json ./
# Install production dependencies as the node user.
RUN npm ci --omit=dev
COPY --chown=node:node server.js ./
USER node
EXPOSE 3000
CMD ["node", "server.js"]
