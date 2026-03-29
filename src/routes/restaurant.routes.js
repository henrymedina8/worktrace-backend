const express = require('express');
const { body, validationResult } = require('express-validator');
const { Restaurant } = require('../models/Restaurant');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

const restaurantValidation = [
  body('name').trim().isLength({ min: 2 }).withMessage('Nombre requerido'),
  body('address').trim().notEmpty().withMessage('Dirección requerida'),
  body('location.coordinates')
    .isArray({ min: 2, max: 2 })
    .withMessage('Coordenadas [longitud, latitud] requeridas'),
];

// ─── GET /api/restaurants ──────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, active } = req.query;
    const filter = {};
    if (active !== undefined) filter.isActive = active === 'true';
    if (search) filter.name = { $regex: search, $options: 'i' };

    const restaurants = await Restaurant.find(filter).sort({ name: 1 });
    res.json({ restaurants });
  } catch (error) {
    next(error);
  }
});

// ─── GET /api/restaurants/:id ──────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) return res.status(404).json({ message: 'Restaurante no encontrado' });
    res.json(restaurant);
  } catch (error) {
    next(error);
  }
});

// ─── POST /api/restaurants ─────────────────────────────────────────────────────
router.post(
  '/',
  authenticate,
  authorize('supervisor', 'superuser'),
  restaurantValidation,
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const restaurant = await Restaurant.create(req.body);
      logger.info(`Restaurante creado: ${restaurant.name} por ${req.user.id}`);
      res.status(201).json(restaurant);
    } catch (error) {
      next(error);
    }
  }
);

// ─── PUT /api/restaurants/:id ──────────────────────────────────────────────────
router.put(
  '/:id',
  authenticate,
  authorize('supervisor', 'superuser'),
  async (req, res, next) => {
    try {
      const restaurant = await Restaurant.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
      });
      if (!restaurant) return res.status(404).json({ message: 'Restaurante no encontrado' });
      res.json(restaurant);
    } catch (error) {
      next(error);
    }
  }
);

// ─── PATCH /api/restaurants/:id/toggle ────────────────────────────────────────
router.patch(
  '/:id/toggle',
  authenticate,
  authorize('supervisor', 'superuser'),
  async (req, res, next) => {
    try {
      const restaurant = await Restaurant.findById(req.params.id);
      if (!restaurant) return res.status(404).json({ message: 'Restaurante no encontrado' });
      restaurant.isActive = !restaurant.isActive;
      await restaurant.save();
      res.json(restaurant);
    } catch (error) {
      next(error);
    }
  }
);

// ─── POST /api/restaurants/verify-location ────────────────────────────────────
router.post('/verify-location', authenticate, async (req, res, next) => {
  try {
    const { restaurantId, latitude, longitude } = req.body;
    if (!restaurantId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: 'restaurantId, latitude y longitude son requeridos' });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) return res.status(404).json({ message: 'Restaurante no encontrado' });

    const [resLng, resLat] = restaurant.location.coordinates;
    const R = 6371000;
    const dLat = ((resLat - latitude) * Math.PI) / 180;
    const dLng = ((resLng - longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((latitude * Math.PI) / 180) *
        Math.cos((resLat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const distance = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));

    res.json({
      isWithinRange: distance <= restaurant.radius,
      distance,
      radius: restaurant.radius,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
