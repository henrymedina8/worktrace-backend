const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true }, // e.g. 'LOGIN', 'SHIFT_START', 'PHOTO_UPLOAD'
    resource: String,   // e.g. 'Shift', 'User'
    resourceId: String,
    ip: String,
    userAgent: String,
    details: mongoose.Schema.Types.Mixed,
    success: { type: Boolean, default: true },
  },
  { timestamps: true }
);

auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
