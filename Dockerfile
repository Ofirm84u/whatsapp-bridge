FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc

# Copy static assets (admin page)
RUN cp src/admin.html dist/admin.html

# Auth state is mounted as a volume
RUN mkdir -p /app/auth_state

EXPOSE 3020

CMD ["node", "dist/index.js"]
