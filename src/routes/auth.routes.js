const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const {
  generateAccessToken,
  generateRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
} = require('../middleware/auth');
const { loginLimiter } = require('../middleware/security');
const logger = require('../utils/logger');

const router = express.Router();

// ─── Validaciones ──────────────────────────────────────────────────────────────
const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('Contraseña mínimo 6 caracteres'),
  body('consent').isBoolean().equals('true').withMessage('Debe aceptar el consentimiento'),
];

const passwordValidation = [
  body('newPassword')
    .isLength({ min: 6 })
    .matches(/^\d+$/)
    .withMessage('La contraseña debe ser numérica y tener mínimo 6 dígitos'),
];

// ─── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', loginLimiter, loginValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Datos inválidos', errors: errors.array() });
    }

    const { email, password, consent } = req.body;

    const user = await User.findOne({ email }).select('+password +loginAttempts +lockUntil +refreshTokens');

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // Cuenta bloqueada?
    if (user.isLocked()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ message: `Cuenta bloqueada. Intente en ${minutesLeft} minutos.` });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.incLoginAttempts();
      logger.warn(`Login fallido para: ${email} desde IP: ${req.ip}`);
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // Login exitoso: resetear intentos
    await user.updateOne({ $set: { loginAttempts: 0 }, $unset: { lockUntil: 1 } });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Guardar refresh token en whitelist (máximo 5 sesiones simultáneas)
    const tokens = (user.refreshTokens || []).slice(-4);
    tokens.push(refreshToken);
    await user.updateOne({ $set: { refreshTokens: tokens } });

    setRefreshCookie(res, refreshToken);

    logger.info(`Login exitoso: ${user.email} (${user.role}) desde IP: ${req.ip}`);

    res.json({
      accessToken,
      user: user.toJSON(),
      requiresPasswordChange: user.isFirstLogin,
    });
  } catch (error) {
    next(error);
  }
});

// ─── POST /api/auth/refresh-token ─────────────────────────────────────────────
router.post('/refresh-token', async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;
    if (!token) return res.status(401).json({ message: 'Refresh token requerido' });

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id).select('+refreshTokens');

    if (!user || !user.isActive || !user.refreshTokens?.includes(token)) {
      return res.status(401).json({ message: 'Token inválido o revocado' });
    }

    // Rotar refresh token (previene reutilización)
    const newRefreshToken = generateRefreshToken(user);
    const tokens = user.refreshTokens.filter((t) => t !== token);
    tokens.push(newRefreshToken);
    await user.updateOne({ $set: { refreshTokens: tokens } });

    setRefreshCookie(res, newRefreshToken);

    res.json({ token: generateAccessToken(user) });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Refresh token inválido' });
    }
    next(error);
  }
});

// ─── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;
    if (token) {
      // Revocar solo este refresh token
      await User.findByIdAndUpdate(req.user.id, {
        $pull: { refreshTokens: token },
      });
    }
    clearRefreshCookie(res);
    res.json({ message: 'Sesión cerrada correctamente' });
  } catch (error) {
    next(error);
  }
});

// ─── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

// ─── POST /api/auth/change-password ───────────────────────────────────────────
router.post('/change-password', authenticate, passwordValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Contraseña inválida', errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id).select('+password');

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(400).json({ message: 'Contraseña actual incorrecta' });

    if (currentPassword === newPassword) {
      return res.status(400).json({ message: 'La nueva contraseña debe ser diferente' });
    }

    user.password = newPassword;
    user.isFirstLogin = false;
    await user.save();

    // Revocar todos los refresh tokens al cambiar contraseña
    await User.findByIdAndUpdate(req.user.id, { $set: { refreshTokens: [] } });
    clearRefreshCookie(res);

    logger.info(`Contraseña cambiada para usuario: ${user.email}`);
    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    next(error);
  }
});

// ─── POST /api/auth/forgot-password ───────────────────────────────────────────
router.post('/forgot-password', loginLimiter, async (req, res, next) => {
  try {
    const { email } = req.body;
    // Siempre responder igual para no revelar si el email existe
    const message = 'Si el correo existe, recibirás un enlace de recuperación';

    const user = await User.findOne({ email });
    if (!user) return res.json({ message });

    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    await user.updateOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: Date.now() + 30 * 60 * 1000, // 30 min
    });

    logger.info(`Token de recuperación generado para: ${email}`);
    // TODO: enviar email con resetToken
    res.json({ message });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
