const express = require('express');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/audit
router.get('/', authenticate, authorize('superuser'), async (req, res, next) => {
  try {
    const { userId, action, from, to, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (userId) filter.user = userId;
    if (action) filter.action = action;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('user', 'name email role')
        .sort({ createdAt: -1 })
        .skip((+page - 1) * +limit)
        .limit(+limit),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ logs, total, page: +page, pages: Math.ceil(total / +limit) });
  } catch (err) { next(err); }
});

// GET /api/audit/supervisors — gestión de supervisores
router.get('/supervisors', authenticate, authorize('superuser'), async (req, res, next) => {
  try {
    const supervisors = await User.find({ role: 'supervisor' })
      .select('-password -refreshTokens')
      .sort({ name: 1 });
    res.json({ supervisors });
  } catch (err) { next(err); }
});

// POST /api/audit/supervisors — crear supervisor
router.post('/supervisors', authenticate, authorize('superuser'), async (req, res, next) => {
  try {
    const { name, email, phone } = req.body;
    if (!name || !email) return res.status(400).json({ message: 'Nombre y email requeridos' });
    const tempPassword = '123456';
    const supervisor = await User.create({ name, email, phone, password: tempPassword, role: 'supervisor' });
    res.status(201).json({ supervisor, tempPassword });
  } catch (err) { next(err); }
});

// PATCH /api/audit/supervisors/:id/toggle
router.patch('/supervisors/:id/toggle', authenticate, authorize('superuser'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'supervisor')
      return res.status(404).json({ message: 'Supervisor no encontrado' });
    user.isActive = !user.isActive;
    await user.save();
    res.json(user);
  } catch (err) { next(err); }
});

module.exports = router;
