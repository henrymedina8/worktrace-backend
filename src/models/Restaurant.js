const mongoose = require('mongoose');

// ─── RESTAURANT ───────────────────────────────────────────────────────────────
const restaurantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
        validate: {
          validator: ([lng, lat]) => lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90,
          message: 'Coordenadas inválidas',
        },
      },
    },
    radius: { type: Number, default: 100, min: 10, max: 500 }, // metros
    allowedHours: {
      start: { type: String, default: '06:00' },
      end: { type: String, default: '22:00' },
    },
    cleaningAreas: [
      {
        name: { type: String, required: true },
        description: String,
        photosRequired: { type: Boolean, default: true },
        order: { type: Number, default: 0 },
      },
    ],
    isActive: { type: Boolean, default: true },
    contactPerson: {
      name: String,
      phone: String,
      email: String,
    },
  },
  { timestamps: true }
);

restaurantSchema.index({ location: '2dsphere' });

// ─── SHIFT ────────────────────────────────────────────────────────────────────
const shiftSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    scheduledDate: { type: Date, required: true },
    scheduledStartTime: { type: String, required: true },
    scheduledEndTime: { type: String, required: true },
    assignedHours: { type: Number, required: true },
    status: {
      type: String,
      enum: ['scheduled', 'in_progress', 'completed', 'cancelled', 'no_show'],
      default: 'scheduled',
    },
    actualStartTime: Date,
    actualEndTime: Date,
    startLocation: {
      type: { type: String, enum: ['Point'] },
      coordinates: [Number],
    },
    endLocation: {
      type: { type: String, enum: ['Point'] },
      coordinates: [Number],
    },
    startPhotos: [
      {
        area: String,
        photoUrl: String,
        takenAt: { type: Date, default: Date.now },
      },
    ],
    endPhotos: [
      {
        area: String,
        photoUrl: String,
        takenAt: { type: Date, default: Date.now },
      },
    ],
    healthCertified: { type: Boolean, default: false },
    specialTasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SpecialTask' }],
    notes: String,
    rating: { type: Number, min: 1, max: 5 },
    supervisorNotes: String,
  },
  { timestamps: true }
);

shiftSchema.index({ employee: 1, scheduledDate: -1 });
shiftSchema.index({ restaurant: 1, scheduledDate: -1 });
shiftSchema.index({ status: 1 });

const Restaurant = mongoose.model('Restaurant', restaurantSchema);
const Shift = mongoose.model('Shift', shiftSchema);

module.exports = { Restaurant, Shift };
