# Stage 1: Build Frontend
FROM node:18-alpine as frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: Build Backend
FROM node:18-alpine as backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ .
RUN npm run build

# Stage 3: Runner
FROM node:18-alpine
WORKDIR /app

# Setup Backend
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/package*.json ./backend/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

WORKDIR /app/backend
RUN npm install --production

# Create data directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Environment variables
ENV PORT=3000
ENV DATA_DIR=/app/data

# Volume for data
VOLUME /app/data

# Start
CMD ["node", "dist/index.js"]
