FROM node:22-slim

WORKDIR /app

# Dependencies in their own layer, so a rebuild only reinstalls when package*.json changes
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "index.js"]
