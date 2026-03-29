const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { Shift } = require('../models/Restaurant');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// ─── GET /api/users/employees ──────────────────────────────────────────────────
router.get(
  '/employees',
  authenticate,
  authorize('supervisor', 'superuser'),
  async (req, res, next) => {
    try {
      const { page = 1, limit = 20, search } = req.query;
      const filter = { role: 'employee' };
      if (search) filter.name = { $regex: search, $options: 'i' };

      const employees = await User.find(filter)
        .select('-password -refreshTokens')
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .sort({ name: 1 });

      const total = await User.countDocuments(filter);
      res.json({ employees, total, page: parseInt(page), pages: Math.ceil(total / limit) });
    } catch (error) {
      next(error);
    }
  }
);

// ─── POST /api/users/employees ─────────────────────────────────────────────────
router.post(
  '/employees',
  authenticate,
  authorize('supervisor', 'superuser'),
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Nombre requerido'),
    body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
    body('phone').optional().trim(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { name, email, phone } = req.body;

      // Contraseña temporal: primeros 6 dígitos del teléfono o 123456
      const tempPassword = (phone?.replace(/\D/g, '') || '').slice(0, 6).padEnd(6, '0') || '123456';

      const user = await User.create({ name, email, phone, password: tempPassword, role: 'employee' });

      res.status(201).json({ user, tempPassword });
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /api/users/employees/:id/profile ─────────────────────────────────────
router.get(
  '/employees/:id/profile',
  authenticate,
  async (req, res, next) => {
    try {
      // Empleados solo pueden ver su propio perfil
      if (req.user.role === 'employee' && req.params.id !== req.user.id) {
        return res.status(403).json({ message: 'No autorizado' });
      }

      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [shifts, upcomingShifts] = await Promise.all([
        Shift.find({ employee: req.params.id, status: 'completed', scheduledDate: { $gte: startOfMonth } }),
        Shift.find({ employee: req.params.id, status: 'scheduled', scheduledDate: { $gte: now } })
          .populate('restaurant', 'name address')
          .sort({ scheduledDate: 1 })
          .limit(5),
      ]);

      const monthHours = shifts.reduce((acc, s) => acc + (s.assignedHours || 0), 0);

      res.json({
        user,
        stats: {
          monthHours,
          completedShifts: shifts.length,
          upcomingShifts: upcomingShifts.length,
          pendingTasks: 0,
        },
        upcomingShifts,
        specialTasks: { pending: [], completed: [] },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ─── PATCH /api/users/employees/:id/toggle ────────────────────────────────────
router.patch(
  '/employees/:id/toggle',
  authenticate,
  authorize('supervisor', 'superuser'),
  async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

      user.isActive = !user.isActive;
      await user.save();
      res.json({ user, message: `Usuario ${user.isActive ? 'activado' : 'desactivado'}` });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
