const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const morgan = require('morgan');
const logger = require('../utils/logger');

// ─── HELMET: headers HTTP seguros ─────────────────────────────────────────────
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // necesario para socket.io
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// ─── CORS: solo orígenes permitidos ───────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

const corsConfig = cors({
  origin: (origin, callback) => {
    // Permitir peticiones sin origin (mobile apps, Postman en dev)
    if (!origin && process.env.NODE_ENV === 'development') return callback(null, true);
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS bloqueado para origen: ${origin}`));
  },
  credentials: true, // necesario para cookies HttpOnly
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Content-Type-Options'],
  maxAge: 86400, // preflight cache 24h
});

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
// Login: máximo 5 intentos por 15 minutos por IP
const loginLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 5,
  message: { message: 'Demasiados intentos de login. Intente en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn(`Rate limit alcanzado para IP: ${req.ip} en ${req.path}`);
    res.status(429).json(options.message);
  },
});

// API general: 100 peticiones por 15 minutos
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'Demasiadas peticiones. Intente más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Upload: 20 fotos por 5 minutos
const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  message: { message: 'Demasiadas subidas. Espere 5 minutos.' },
});

// ─── MONGO SANITIZE: previene NoSQL injection ──────────────────────────────────
const mongoSanitizeConfig = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    logger.warn(`Intento de NoSQL injection bloqueado. IP: ${req.ip}, campo: ${key}`);
  },
});

// ─── MORGAN: logs de peticiones HTTP ──────────────────────────────────────────
const morganConfig = morgan('combined', {
  stream: { write: (message) => logger.http(message.trim()) },
  skip: (req) => req.path === '/health', // no loguear health checks
});

module.exports = {
  helmetConfig,
  corsConfig,
  loginLimiter,
  apiLimiter,
  uploadLimiter,
  mongoSanitizeConfig,
  morganConfig,
};
