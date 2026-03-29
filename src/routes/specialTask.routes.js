const express = require('express');
const { body, validationResult } = require('express-validator');
const SpecialTask = require('../models/SpecialTask');
const Notification = require('../models/Notification');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/special-tasks
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, restaurantId } = req.query;
    const filter = {};
    if (req.user.role === 'employee') filter.assignedTo = req.user.id;
    if (status) filter.status = status;
    if (restaurantId) filter.restaurant = restaurantId;

    const tasks = await SpecialTask.find(filter)
      .populate('restaurant', 'name')
      .populate('assignedTo', 'name')
      .populate('observations.createdBy', 'name')
      .sort({ createdAt: -1 });
    res.json({ tasks });
  } catch (err) { next(err); }
});

// GET /api/special-tasks/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const task = await SpecialTask.findById(req.params.id)
      .populate('restaurant')
      .populate('assignedTo', 'name email')
      .populate('observations.createdBy', 'name');
    if (!task) return res.status(404).json({ message: 'Tarea no encontrada' });
    res.json(task);
  } catch (err) { next(err); }
});

// POST /api/special-tasks
router.post('/', authenticate, authorize('supervisor', 'superuser'),
  [
    body('title').trim().notEmpty().withMessage('Título requerido'),
    body('description').trim().notEmpty().withMessage('Descripción requerida'),
    body('restaurant').notEmpty(),
    body('assignedTo').notEmpty(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const task = await SpecialTask.create(req.body);
      await task.populate(['restaurant', 'assignedTo']);
      const io = req.app.get('io');
      await Notification.send(io, task.assignedTo._id, {
        type: 'TASK_ASSIGNED', title: 'Nueva tarea especial',
        message: `Se te asignó: "${task.title}" en ${task.restaurant.name}`,
        data: { taskId: task._id },
      });
      res.status(201).json(task);
    } catch (err) { next(err); }
  }
);

// POST /api/special-tasks/:id/observations — agregar observación
router.post('/:id/observations', authenticate,
  [body('text').trim().notEmpty().withMessage('Observación requerida')],
  async (req, res, next) => {
    try {
      const task = await SpecialTask.findById(req.params.id);
      if (!task) return res.status(404).json({ message: 'Tarea no encontrada' });
      task.observations.push({ text: req.body.text, createdBy: req.user.id });
      if (task.status === 'pending') task.status = 'in_progress';
      await task.save();
      await task.populate('observations.createdBy', 'name');
      res.json(task);
    } catch (err) { next(err); }
  }
);

// PATCH /api/special-tasks/:id/complete
router.patch('/:id/complete', authenticate, authorize('employee'), async (req, res, next) => {
  try {
    const task = await SpecialTask.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Tarea no encontrada' });
    if (task.assignedTo.toString() !== req.user.id) return res.status(403).json({ message: 'No autorizado' });
    task.status = 'completed';
    task.completedAt = new Date();
    await task.save();
    res.json(task);
  } catch (err) { next(err); }
});

module.exports = router;
