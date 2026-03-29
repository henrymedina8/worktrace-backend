const express = require('express');
const { body, validationResult } = require('express-validator');
const { Shift } = require('../models/Restaurant');
const { Restaurant } = require('../models/Restaurant');
const Notification = require('../models/Notification');
const { authenticate, authorize } = require('../middleware/auth');
const { audit } = require('../middleware/audit');
const logger = require('../utils/logger');

const router = express.Router();

const calcDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

// GET /api/shifts
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { myShifts, status, date, restaurantId, employeeId, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (req.user.role === 'employee' || myShifts === 'true') filter.employee = req.user.id;
    if (status) filter.status = status;
    if (restaurantId) filter.restaurant = restaurantId;
    if (employeeId && req.user.role !== 'employee') filter.employee = employeeId;
    if (date) {
      const d = new Date(date);
      filter.scheduledDate = {
        $gte: new Date(new Date(d).setHours(0, 0, 0, 0)),
        $lte: new Date(new Date(d).setHours(23, 59, 59, 999)),
      };
    }
    const [shifts, total] = await Promise.all([
      Shift.find(filter)
        .populate('restaurant', 'name address location cleaningAreas radius allowedHours')
        .populate('employee', 'name email phone')
        .populate('specialTasks')
        .sort({ scheduledDate: -1 })
        .skip((+page - 1) * +limit)
        .limit(+limit),
      Shift.countDocuments(filter),
    ]);
    res.json({ shifts, total, page: +page, pages: Math.ceil(total / +limit) });
  } catch (err) { next(err); }
});

// GET /api/shifts/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const shift = await Shift.findById(req.params.id)
      .populate('restaurant')
      .populate('employee', 'name email phone avatar')
      .populate({ path: 'specialTasks', populate: { path: 'observations.createdBy', select: 'name' } });
    if (!shift) return res.status(404).json({ message: 'Turno no encontrado' });
    if (req.user.role === 'employee' && shift.employee._id.toString() !== req.user.id)
      return res.status(403).json({ message: 'No autorizado' });
    res.json(shift);
  } catch (err) { next(err); }
});

// POST /api/shifts — crear
router.post('/', authenticate, authorize('supervisor', 'superuser'),
  [
    body('employee').notEmpty(),
    body('restaurant').notEmpty(),
    body('scheduledDate').isISO8601(),
    body('scheduledStartTime').matches(/^\d{2}:\d{2}$/),
    body('scheduledEndTime').matches(/^\d{2}:\d{2}$/),
    body('assignedHours').isFloat({ min: 0.5, max: 24 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const shift = await Shift.create(req.body);
      await shift.populate(['restaurant', 'employee']);
      const io = req.app.get('io');
      await Notification.send(io, shift.employee._id, {
        type: 'SHIFT_ASSIGNED', title: 'Turno asignado',
        message: `Tienes un turno el ${new Date(shift.scheduledDate).toLocaleDateString('es')} en ${shift.restaurant.name}`,
        data: { shiftId: shift._id },
      });
      res.status(201).json(shift);
    } catch (err) { next(err); }
  }
);

// PUT /api/shifts/:id
router.put('/:id', authenticate, authorize('supervisor', 'superuser'), async (req, res, next) => {
  try {
    const shift = await Shift.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate(['restaurant', 'employee']);
    if (!shift) return res.status(404).json({ message: 'Turno no encontrado' });
    res.json(shift);
  } catch (err) { next(err); }
});

// PATCH /api/shifts/:id/cancel
router.patch('/:id/cancel', authenticate, authorize('supervisor', 'superuser'), async (req, res, next) => {
  try {
    const shift = await Shift.findById(req.params.id).populate('employee restaurant');
    if (!shift) return res.status(404).json({ message: 'Turno no encontrado' });
    if (['completed', 'cancelled'].includes(shift.status))
      return res.status(400).json({ message: 'No se puede cancelar este turno' });
    shift.status = 'cancelled';
    await shift.save();
    const io = req.app.get('io');
    await Notification.send(io, shift.employee._id, {
      type: 'SHIFT_CANCELLED', title: 'Turno cancelado',
      message: `Tu turno del ${new Date(shift.scheduledDate).toLocaleDateString('es')} fue cancelado`,
      data: { shiftId: shift._id },
    });
    res.json(shift);
  } catch (err) { next(err); }
});

// PATCH /api/shifts/:id/rate
router.patch('/:id/rate', authenticate, authorize('supervisor', 'superuser'),
  [body('rating').isInt({ min: 1, max: 5 })],
  async (req, res, next) => {
    try {
      const { rating, supervisorNotes } = req.body;
      const shift = await Shift.findByIdAndUpdate(req.params.id, { rating, supervisorNotes }, { new: true })
        .populate('employee', 'name');
      if (!shift) return res.status(404).json({ message: 'Turno no encontrado' });
      const io = req.app.get('io');
      await Notification.send(io, shift.employee._id, {
        type: 'SHIFT_RATED', title: 'Turno calificado',
        message: `Tu turno recibió una calificación de ${rating}/5`,
        data: { shiftId: shift._id, rating },
      });
      res.json(shift);
    } catch (err) { next(err); }
  }
);

// POST /api/shifts/:id/start
router.post('/:id/start', authenticate, authorize('employee'), audit('SHIFT_START', 'Shift'),
  [body('latitude').isFloat({ min: -90, max: 90 }), body('longitude').isFloat({ min: -180, max: 180 }), body('healthCertified').isBoolean()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { latitude, longitude, healthCertified } = req.body;
      const shift = await Shift.findById(req.params.id).populate('restaurant');
      if (!shift) return res.status(404).json({ message: 'Turno no encontrado' });
      if (shift.employee.toString() !== req.user.id) return res.status(403).json({ message: 'No autorizado' });
      if (shift.status !== 'scheduled') return res.status(400).json({ message: `El turno ya está ${shift.status}` });
      if (!healthCertified) return res.status(400).json({ message: 'Debe certificar su estado de salud' });
      const [resLng, resLat] = shift.restaurant.location.coordinates;
      const distance = calcDistance(latitude, longitude, resLat, resLng);
      if (distance > shift.restaurant.radius)
        return res.status(400).json({ message: `Está a ${distance}m. Debe estar dentro de ${shift.restaurant.radius}m.`, distance });
      shift.status = 'in_progress';
      shift.actualStartTime = new Date();
      shift.healthCertified = true;
      shift.startLocation = { type: 'Point', coordinates: [longitude, latitude] };
      await shift.save();
      logger.info(`Turno iniciado: ${shift._id}`);
      res.json(shift);
    } catch (err) { next(err); }
  }
);

// POST /api/shifts/:id/complete
router.post('/:id/complete', authenticate, authorize('employee'), audit('SHIFT_COMPLETE', 'Shift'),
  async (req, res, next) => {
    try {
      const { latitude, longitude } = req.body;
      const shift = await Shift.findById(req.params.id).populate('restaurant');
      if (!shift) return res.status(404).json({ message: 'Turno no encontrado' });
      if (shift.employee.toString() !== req.user.id) return res.status(403).json({ message: 'No autorizado' });
      if (shift.status !== 'in_progress') return res.status(400).json({ message: 'El turno no está en progreso' });
      const areasRequired = shift.restaurant.cleaningAreas.filter((a) => a.photosRequired).map((a) => a.name);
      const uploaded = shift.endPhotos.map((p) => p.area);
      const missing = areasRequired.filter((a) => !uploaded.includes(a));
      if (missing.length) return res.status(400).json({ message: `Faltan fotos de: ${missing.join(', ')}` });
      shift.status = 'completed';
      shift.actualEndTime = new Date();
      if (latitude && longitude) shift.endLocation = { type: 'Point', coordinates: [longitude, latitude] };
      await shift.save();
      logger.info(`Turno completado: ${shift._id}`);
      res.json(shift);
    } catch (err) { next(err); }
  }
);

// POST /api/shifts/:id/start-photos
router.post('/:id/start-photos', authenticate, authorize('employee'), async (req, res, next) => {
  try {
    const { photos } = req.body;
    if (!Array.isArray(photos) || !photos.length) return res.status(400).json({ message: 'Fotos requeridas' });
    const shift = await Shift.findById(req.params.id);
    if (!shift || shift.employee.toString() !== req.user.id) return res.status(403).json({ message: 'No autorizado' });
    shift.startPhotos = photos.map(({ area, photoUrl }) => ({ area, photoUrl }));
    await shift.save();
    res.json({ message: 'Fotos de inicio guardadas' });
  } catch (err) { next(err); }
});

// POST /api/shifts/:id/end-photos
router.post('/:id/end-photos', authenticate, authorize('employee'), async (req, res, next) => {
  try {
    const { photos } = req.body;
    if (!Array.isArray(photos) || !photos.length) return res.status(400).json({ message: 'Fotos requeridas' });
    const shift = await Shift.findById(req.params.id);
    if (!shift || shift.employee.toString() !== req.user.id) return res.status(403).json({ message: 'No autorizado' });
    shift.endPhotos = photos.map(({ area, photoUrl }) => ({ area, photoUrl }));
    await shift.save();
    res.json({ message: 'Fotos de fin guardadas' });
  } catch (err) { next(err); }
});

module.exports = router;
