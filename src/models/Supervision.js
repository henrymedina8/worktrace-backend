const mongoose = require('mongoose');

const supervisionSchema = new mongoose.Schema(
  {
    supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    date: { type: Date, default: Date.now },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: [Number],
    },
    photos: [
      {
        area: String,
        photoUrl: String,
        notes: String,
        takenAt: { type: Date, default: Date.now },
      },
    ],
    observations: String,
    findings: [
      {
        type: { type: String },
        description: String,
        severity: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
      },
    ],
    recommendations: String,
    rating: { type: Number, min: 1, max: 5 },
    verifiedBySuperuser: { type: Boolean, default: false },
    verifiedAt: Date,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

supervisionSchema.index({ supervisor: 1, date: -1 });
supervisionSchema.index({ restaurant: 1, date: -1 });
supervisionSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Supervision', supervisionSchema);
