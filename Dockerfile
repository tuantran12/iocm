# Development Dockerfile for IOCM
FROM node:20-alpine

WORKDIR /app

# Install dependencies for native modules (bcrypt)
RUN apk add --no-cache python3 make g++

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source code
COPY . .

# Expose Next.js dev server port
EXPOSE 3000

# Run development server
CMD ["npm", "run", "dev"]
