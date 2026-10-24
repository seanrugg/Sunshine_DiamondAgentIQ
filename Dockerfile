FROM node:22-alpine
WORKDIR /srv
COPY package.json ./
COPY app ./app
COPY server ./server
COPY scripts ./scripts
COPY data ./data
RUN node scripts/build-data.mjs
ENV PORT=8787 HOST=0.0.0.0
EXPOSE 8787
USER node
CMD ["node", "server/server.mjs"]
