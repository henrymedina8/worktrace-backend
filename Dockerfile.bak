FROM node:20-alpine

# Usuario no-root por seguridad
RUN addgroup -g 1001 -S nodejs && adduser -S worktrace -u 1001

WORKDIR /app

# Copiar dependencias primero (cache de Docker)
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copiar código fuente
COPY --chown=worktrace:nodejs . .

# Crear directorio de logs y uploads con permisos correctos
RUN mkdir -p logs uploads/temp && chown -R worktrace:nodejs logs uploads

USER worktrace

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["node", "src/server.js"]
