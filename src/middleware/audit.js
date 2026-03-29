const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

const audit = (action, resource) => async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    AuditLog.create({
      user: req.user?.id,
      action,
      resource,
      resourceId: req.params?.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      details: { method: req.method, path: req.path },
      success: res.statusCode < 400,
    }).catch((err) => logger.error('Error guardando audit log:', err));
    return originalJson(body);
  };
  next();
};

module.exports = { audit };
