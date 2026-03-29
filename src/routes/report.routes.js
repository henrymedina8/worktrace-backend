const express = require('express');
const { Shift } = require('../models/Restaurant');
const Supervision = require('../models/Supervision');
const User = require('../models/User');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/reports/dashboard — métricas generales (supervisor/superuser)
router.get('/dashboard', authenticate, authorize('supervisor', 'superuser'), async (req, res, next) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());

    const [
      totalShiftsMonth,
      completedShiftsMonth,
      noShowShifts,
      activeEmployees,
      totalSupervisions,
      avgRating,
      shiftsByStatus,
      shiftsThisWeek,
    ] = await Promise.all([
      Shift.countDocuments({ scheduledDate: { $gte: startOfMonth } }),
      Shift.countDocuments({ status: 'completed', scheduledDate: { $gte: startOfMonth } }),
      Shift.countDocuments({ status: 'no_show', scheduledDate: { $gte: startOfMonth } }),
      User.countDocuments({ role: 'employee', isActive: true }),
      Supervision.countDocuments({ date: { $gte: startOfMonth } }),
      Shift.aggregate([
        { $match: { status: 'completed', rating: { $exists: true }, scheduledDate: { $gte: startOfMonth } } },
        { $group: { _id: null, avg: { $avg: '$rating' } } },
      ]),
      Shift.aggregate([
        { $match: { scheduledDate: { $gte: startOfMonth } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Shift.countDocuments({ scheduledDate: { $gte: startOfWeek } }),
    ]);

    res.json({
      month: {
        total: totalShiftsMonth,
        completed: completedShiftsMonth,
        noShow: noShowShifts,
        completionRate: totalShiftsMonth > 0
          ? Math.round((completedShiftsMonth / totalShiftsMonth) * 100)
          : 0,
      },
      week: { total: shiftsThisWeek },
      employees: { active: activeEmployees },
      supervisions: { total: totalSupervisions },
      avgRating: avgRating[0]?.avg ? Math.round(avgRating[0].avg * 10) / 10 : null,
      shiftsByStatus: shiftsByStatus.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
    });
  } catch (err) { next(err); }
});

// GET /api/reports/shifts — reporte detallado de turnos
router.get('/shifts', authenticate, authorize('supervisor', 'superuser'), async (req, res, next) => {
  try {
    const { from, to, restaurantId, employeeId } = req.query;
    const match = {};
    if (from || to) {
      match.scheduledDate = {};
      if (from) match.scheduledDate.$gte = new Date(from);
      if (to) match.scheduledDate.$lte = new Date(to);
    }
    if (restaurantId) match.restaurant = require('mongoose').Types.ObjectId.createFromHexString(restaurantId);
    if (employeeId) match.employee = require('mongoose').Types.ObjectId.createFromHexString(employeeId);

    const report = await Shift.aggregate([
      { $match: match },
      {
        $group: {
          _id: { status: '$status', restaurant: '$restaurant' },
          count: { $sum: 1 },
          totalHours: { $sum: '$assignedHours' },
          avgRating: { $avg: '$rating' },
        },
      },
      { $sort: { '_id.status': 1 } },
    ]);

    const shifts = await Shift.find(match)
      .populate('employee', 'name')
      .populate('restaurant', 'name')
      .sort({ scheduledDate: -1 })
      .limit(100);

    res.json({ summary: report, shifts });
  } catch (err) { next(err); }
});

// GET /api/reports/employees — reporte por empleado
router.get('/employees', authenticate, authorize('supervisor', 'superuser'), async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const match = { status: 'completed' };
    if (from || to) {
      match.scheduledDate = {};
      if (from) match.scheduledDate.$gte = new Date(from);
      if (to) match.scheduledDate.$lte = new Date(to);
    }

    const stats = await Shift.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$employee',
          completedShifts: { $sum: 1 },
          totalHours: { $sum: '$assignedHours' },
          avgRating: { $avg: '$rating' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'employee',
        },
      },
      { $unwind: '$employee' },
      {
        $project: {
          name: '$employee.name',
          email: '$employee.email',
          completedShifts: 1,
          totalHours: 1,
          avgRating: { $round: ['$avgRating', 1] },
        },
      },
      { $sort: { completedShifts: -1 } },
    ]);

    res.json({ stats });
  } catch (err) { next(err); }
});

module.exports = router;
