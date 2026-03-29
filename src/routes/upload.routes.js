const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { upload, cleanupTemp } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/security');
const { uploadToCloudinary } = require('../config/cloudinary');
const { Shift } = require('../models/Restaurant');
const logger = require('../utils/logger');

const router = express.Router();

// ─── POST /api/upload/photo (una foto) ────────────────────────────────────────
router.post(
  '/photo',
  authenticate,
  authorize('employee'),
  uploadLimiter,
  upload.single('photo'),
  async (req, res, next) => {
    const filePath = req.file?.path;
    try {
      if (!req.file) return res.status(400).json({ message: 'Archivo requerido' });

      const { shiftId, type, area } = req.body;
      if (!shiftId || !type || !area) {
        return res.status(400).json({ message: 'shiftId, type y area son requeridos' });
      }

      // Verificar que el turno pertenece al usuario
      const shift = await Shift.findById(shiftId);
      if (!shift || shift.employee.toString() !== req.user.id) {
        return res.status(403).json({ message: 'No autorizado' });
      }

      const folder = `worktrace/shifts/${shiftId}/${type}`;
      const photoUrl = await uploadToCloudinary(filePath, folder);

      logger.info(`Foto subida para turno ${shiftId}, área: ${area}`);
      res.json({ photoUrl });
    } catch (error) {
      next(error);
    } finally {
      if (filePath) cleanupTemp(filePath);
    }
  }
);

// ─── POST /api/upload/photos (múltiples fotos) ────────────────────────────────
router.post(
  '/photos',
  authenticate,
  authorize('employee'),
  uploadLimiter,
  upload.array('photos', 10),
  async (req, res, next) => {
    const files = req.files || [];
    try {
      if (!files.length) return res.status(400).json({ message: 'Archivos requeridos' });

      const { shiftId, type } = req.body;
      const areas = JSON.parse(req.body.areas || '[]');

      const shift = await Shift.findById(shiftId);
      if (!shift || shift.employee.toString() !== req.user.id) {
        return res.status(403).json({ message: 'No autorizado' });
      }

      const folder = `worktrace/shifts/${shiftId}/${type}`;
      const photos = await Promise.all(
        files.map(async (file, i) => {
          const photoUrl = await uploadToCloudinary(file.path, folder);
          return { area: areas[i] || `area-${i + 1}`, photoUrl };
        })
      );

      res.json({ photos });
    } catch (error) {
      next(error);
    } finally {
      files.forEach((f) => cleanupTemp(f.path));
    }
  }
);

module.exports = router;
