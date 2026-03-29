const multer = require('multer');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_MB = 5;
const TEMP_DIR = path.join(__dirname, '../../uploads/temp');

// Crear directorio temporal si no existe
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TEMP_DIR),
  filename: (req, file, cb) => {
    // Nombre aleatorio para evitar path traversal
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `upload-${unique}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    logger.warn(`Tipo de archivo rechazado: ${file.mimetype} desde IP: ${req.ip}`);
    return cb(new Error('Solo se permiten imágenes JPG, PNG o WebP'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_SIZE_MB * 1024 * 1024,
    files: 10, // máximo 10 archivos por petición
  },
});

// Limpia archivos temporales después de procesarlos
const cleanupTemp = (filePath) => {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    logger.error('Error limpiando archivo temporal:', err);
  }
};

module.exports = { upload, cleanupTemp };
