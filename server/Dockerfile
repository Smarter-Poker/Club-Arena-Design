FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --production=false

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npx tsc

# Remove dev dependencies
RUN npm prune --production

# Run
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/index.js"]
