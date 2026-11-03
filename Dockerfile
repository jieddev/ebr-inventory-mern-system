# One container for the whole app: Express serves the API (/api) and the built React app.

# 1. Build the frontend (needs devDependencies such as vite).
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. Run the backend, which serves ../frontend/dist (see backend/src/app.js).
FROM node:22-alpine
ENV NODE_ENV=production PORT=5000
WORKDIR /app
COPY backend/package*.json backend/
RUN cd backend && npm ci --omit=dev
COPY backend/ backend/
COPY --from=frontend /app/frontend/dist frontend/dist
USER node
EXPOSE 5000
CMD ["node", "backend/server.js"]
