const mongoose = require('mongoose');

const specialTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    shift: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed'],
      default: 'pending',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    estimatedDuration: { type: Number, default: 60 }, // minutos
    completedAt: Date,
    observations: [
      {
        text: { type: String, required: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

specialTaskSchema.index({ assignedTo: 1, status: 1 });
specialTaskSchema.index({ restaurant: 1 });
specialTaskSchema.index({ shift: 1 });

module.exports = mongoose.model('SpecialTask', specialTaskSchema);
