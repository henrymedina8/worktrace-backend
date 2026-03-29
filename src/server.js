require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');

const connectDB = require('./config/database');
const logger = require('./utils/logger');
const {
  helmetConfig, corsConfig, apiLimiter, mongoSanitizeConfig, morganConfig,
} = require('./middleware/security');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);

// ─── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(s => s.trim()),
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

io.on('connection', (socket) => {
  socket.on('join', (userId) => {
    socket.join(`user:${userId}`);
    logger.debug(`Socket conectado: usuario ${userId}`);
  });
  socket.on('disconnect', () => logger.debug(`Socket desconectado: ${socket.id}`));
});
app.set('io', io);

// ─── Middlewares globales ──────────────────────────────────────────────────────
app.use(helmetConfig);
app.use(corsConfig);
app.use('/api/', apiLimiter);
app.use(morganConfig);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());
app.use(mongoSanitizeConfig);

// ─── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  status: 'ok', env: process.env.NODE_ENV,
  timestamp: new Date().toISOString(), uptime: Math.floor(process.uptime()),
}));

// ─── Rutas API ─────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth.routes'));
app.use('/api/shifts',        require('./routes/shift.routes'));
app.use('/api/upload',        require('./routes/upload.routes'));
app.use('/api/users',         require('./routes/user.routes'));
app.use('/api/restaurants',   require('./routes/restaurant.routes'));
app.use('/api/supervisions',  require('./routes/supervision.routes'));
app.use('/api/special-tasks', require('./routes/specialTask.routes'));
app.use('/api/reports',       require('./routes/report.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));
app.use('/api/audit',         require('./routes/audit.routes'));

app.use(notFound);
app.use(errorHandler);

// ─── Arranque ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  server.listen(PORT, () => {
    logger.info(`WorkTrace API en puerto ${PORT} [${process.env.NODE_ENV}]`);
    logger.info(`Health: http://localhost:${PORT}/health`);
  });
};

process.on('unhandledRejection', (err) => { logger.error('Unhandled Rejection:', err); server.close(() => process.exit(1)); });
process.on('uncaughtException',  (err) => { logger.error('Uncaught Exception:', err);  process.exit(1); });

start();
