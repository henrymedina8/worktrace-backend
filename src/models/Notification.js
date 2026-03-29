const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed },
    read: { type: Boolean, default: false },
    readAt: Date,
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

// Helper estático para crear y emitir notificación vía socket
notificationSchema.statics.send = async function (io, userId, payload) {
  const notif = await this.create({ user: userId, ...payload });
  if (io) io.to(`user:${userId}`).emit('notification', notif);
  return notif;
};

module.exports = mongoose.model('Notification', notificationSchema);
