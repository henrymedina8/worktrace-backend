const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Error interno del servidor';

  // Errores de Mongoose
  if (err.name === 'ValidationError') {
    status = 400;
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(status).json({ message: 'Error de validación', errors });
  }

  if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `Ya existe un registro con ese ${field}`;
    return res.status(status).json({ message });
  }

  if (err.name === 'CastError') {
    status = 400;
    message = 'ID inválido';
    return res.status(status).json({ message });
  }

  // Errores de Multer
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'Archivo demasiado grande. Máximo 5MB.' });
  }

  // No exponer detalles internos en producción
  if (process.env.NODE_ENV === 'production' && status === 500) {
    logger.error('Error interno:', err);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }

  logger.error(`${status} - ${message} - ${req.method} ${req.path} - IP: ${req.ip}`);
  res.status(status).json({ message, ...(process.env.NODE_ENV === 'development' && { stack: err.stack }) });
};

const notFound = (req, res) => {
  res.status(404).json({ message: `Ruta no encontrada: ${req.method} ${req.path}` });
};

module.exports = { errorHandler, notFound };
