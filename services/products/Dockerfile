FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install --omit=dev --legacy-peer-deps

COPY . .

EXPOSE 3003

CMD ["node", "src/server.js"]