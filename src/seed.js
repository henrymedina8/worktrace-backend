require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const { Restaurant, Shift } = require('./models/Restaurant');

const seed = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Conectado a MongoDB. Limpiando datos...');

  await Promise.all([
    User.deleteMany({}),
    Restaurant.deleteMany({}),
    Shift.deleteMany({}),
  ]);

  // ─── USUARIOS DE PRUEBA ─────────────────────────────────────────────────────
  const [superuser, supervisor, employee1, employee2] = await User.create([
    {
      name: 'Admin WorkTrace',
      email: 'super@worktrace.com',
      password: '123456',
      phone: '3001234567',
      role: 'superuser',
      isFirstLogin: false,
    },
    {
      name: 'Carlos Supervisor',
      email: 'supervisor@worktrace.com',
      password: '123456',
      phone: '3007654321',
      role: 'supervisor',
      isFirstLogin: false,
    },
    {
      name: 'Ana García',
      email: 'empleado@worktrace.com',
      password: '123456',
      phone: '3009876543',
      role: 'employee',
      isFirstLogin: false,
    },
    {
      name: 'Luis Pérez',
      email: 'empleado2@worktrace.com',
      password: '123456',
      phone: '3005551234',
      role: 'employee',
      isFirstLogin: false,
    },
  ]);

  // ─── RESTAURANTES DE PRUEBA ─────────────────────────────────────────────────
  const [rest1, rest2] = await Restaurant.create([
    {
      name: 'McDonald\'s El Poblado',
      address: 'Calle 10 # 43D-28, El Poblado, Medellín',
      location: { type: 'Point', coordinates: [-75.5701, 6.2088] }, // [lng, lat]
      radius: 150,
      allowedHours: { start: '06:00', end: '22:00' },
      cleaningAreas: [
        { name: 'Cocina', photosRequired: true, order: 1 },
        { name: 'Comedor', photosRequired: true, order: 2 },
        { name: 'Baños', photosRequired: true, order: 3 },
        { name: 'Zona de basuras', photosRequired: false, order: 4 },
      ],
      contactPerson: { name: 'Marta López', phone: '3041234567', email: 'marta@mcd.com' },
    },
    {
      name: 'Burger King Centro',
      address: 'Carrera 49 # 52-73, Centro, Medellín',
      location: { type: 'Point', coordinates: [-75.5681, 6.2520] },
      radius: 100,
      allowedHours: { start: '07:00', end: '23:00' },
      cleaningAreas: [
        { name: 'Cocina', photosRequired: true, order: 1 },
        { name: 'Salón', photosRequired: true, order: 2 },
        { name: 'Baños', photosRequired: true, order: 3 },
      ],
    },
  ]);

  // ─── TURNOS DE PRUEBA ───────────────────────────────────────────────────────
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  await Shift.create([
    {
      employee: employee1._id,
      restaurant: rest1._id,
      scheduledDate: today,
      scheduledStartTime: '08:00',
      scheduledEndTime: '16:00',
      assignedHours: 8,
      status: 'scheduled',
    },
    {
      employee: employee2._id,
      restaurant: rest2._id,
      scheduledDate: today,
      scheduledStartTime: '10:00',
      scheduledEndTime: '18:00',
      assignedHours: 8,
      status: 'scheduled',
    },
    {
      employee: employee1._id,
      restaurant: rest1._id,
      scheduledDate: yesterday,
      scheduledStartTime: '08:00',
      scheduledEndTime: '16:00',
      assignedHours: 8,
      status: 'completed',
      actualStartTime: new Date(yesterday.setHours(8, 5)),
      actualEndTime: new Date(yesterday.setHours(16, 10)),
      healthCertified: true,
      rating: 4,
    },
    {
      employee: employee1._id,
      restaurant: rest2._id,
      scheduledDate: tomorrow,
      scheduledStartTime: '09:00',
      scheduledEndTime: '17:00',
      assignedHours: 8,
      status: 'scheduled',
    },
  ]);

  console.log('\n✅ Seed completado exitosamente!\n');
  console.log('─── Usuarios de prueba ───────────────────────────');
  console.log(`Superuser:  super@worktrace.com     / 123456`);
  console.log(`Supervisor: supervisor@worktrace.com / 123456`);
  console.log(`Empleado 1: empleado@worktrace.com  / 123456`);
  console.log(`Empleado 2: empleado2@worktrace.com / 123456`);
  console.log('──────────────────────────────────────────────────\n');

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
