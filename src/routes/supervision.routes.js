const express = require('express');
const { body, validationResult } = require('express-validator');
const Supervision = require('../models/Supervision');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/supervisions
router.get('/', authenticate, authorize('supervisor', 'superuser'), async (req, res, next) => {
  try {
    const { restaurantId, supervisorId, verified, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (req.user.role === 'supervisor') filter.supervisor = req.user.id;
    if (supervisorId && req.user.role === 'superuser') filter.supervisor = supervisorId;
    if (restaurantId) filter.restaurant = restaurantId;
    if (verified !== undefined) filter.verifiedBySuperuser = verified === 'true';

    const [supervisions, total] = await Promise.all([
      Supervision.find(filter)
        .populate('supervisor', 'name email')
        .populate('restaurant', 'name address')
        .populate('verifiedBy', 'name')
        .sort({ date: -1 })
        .skip((+page - 1) * +limit)
        .limit(+limit),
      Supervision.countDocuments(filter),
    ]);
    res.json({ supervisions, total, page: +page, pages: Math.ceil(total / +limit) });
  } catch (err) { next(err); }
});

// GET /api/supervisions/:id
router.get('/:id', authenticate, authorize('supervisor', 'superuser'), async (req, res, next) => {
  try {
    const supervision = await Supervision.findById(req.params.id)
      .populate('supervisor', 'name email')
      .populate('restaurant')
      .populate('verifiedBy', 'name');
    if (!supervision) return res.status(404).json({ message: 'Supervisión no encontrada' });
    res.json(supervision);
  } catch (err) { next(err); }
});

// POST /api/supervisions
router.post('/', authenticate, authorize('supervisor', 'superuser'),
  [
    body('restaurant').notEmpty().withMessage('Restaurante requerido'),
    body('location.coordinates').isArray({ min: 2, max: 2 }).withMessage('Coordenadas requeridas'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const supervision = await Supervision.create({ ...req.body, supervisor: req.user.id });
      await supervision.populate(['restaurant', 'supervisor']);
      res.status(201).json(supervision);
    } catch (err) { next(err); }
  }
);

// PUT /api/supervisions/:id
router.put('/:id', authenticate, authorize('supervisor', 'superuser'), async (req, res, next) => {
  try {
    const supervision = await Supervision.findById(req.params.id);
    if (!supervision) return res.status(404).json({ message: 'Supervisión no encontrada' });
    if (req.user.role === 'supervisor' && supervision.supervisor.toString() !== req.user.id)
      return res.status(403).json({ message: 'No autorizado' });
    const updated = await Supervision.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate(['restaurant', 'supervisor']);
    res.json(updated);
  } catch (err) { next(err); }
});

// PATCH /api/supervisions/:id/verify — verificar (superuser)
router.patch('/:id/verify', authenticate, authorize('superuser'), async (req, res, next) => {
  try {
    const supervision = await Supervision.findByIdAndUpdate(
      req.params.id,
      { verifiedBySuperuser: true, verifiedAt: new Date(), verifiedBy: req.user.id },
      { new: true }
    );
    if (!supervision) return res.status(404).json({ message: 'Supervisión no encontrada' });
    res.json(supervision);
  } catch (err) { next(err); }
});

module.exports = router;
