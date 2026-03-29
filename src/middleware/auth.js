const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// ─── Verifica access token ─────────────────────────────────────────────────────
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token de acceso requerido' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expirado', code: 'TOKEN_EXPIRED' });
    }
    logger.warn(`Token inválido desde IP: ${req.ip}`);
    return res.status(401).json({ message: 'Token inválido' });
  }
};

// ─── RBAC: verifica roles ──────────────────────────────────────────────────────
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'No autenticado' });
    }
    if (!roles.includes(req.user.role)) {
      logger.warn(`Acceso denegado: usuario ${req.user.id} (${req.user.role}) intentó acceder a ruta restringida para [${roles.join(', ')}]`);
      return res.status(403).json({ message: 'No autorizado para esta acción' });
    }
    next();
  };
};

// ─── Genera tokens ─────────────────────────────────────────────────────────────
const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d' }
  );
};

// ─── Cookie segura para refresh token ─────────────────────────────────────────
const setRefreshCookie = (res, token) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,         // No accesible desde JS
    secure: process.env.NODE_ENV === 'production', // Solo HTTPS en prod
    sameSite: 'strict',    // Protección CSRF
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
    path: '/api/auth',     // Solo disponible en rutas de auth
  });
};

const clearRefreshCookie = (res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
  });
};

module.exports = {
  authenticate,
  authorize,
  generateAccessToken,
  generateRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
};
