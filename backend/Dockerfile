FROM node:22-slim

WORKDIR /app

# ffmpeg shrinks videos and audio before they're stored (utils/compress.js)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

# Dependencies in their own layer, so a rebuild only reinstalls when package*.json changes
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "index.js"]
