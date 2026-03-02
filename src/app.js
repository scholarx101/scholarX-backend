const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");

const app = express();

// Dev: allow any origin
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// serve uploaded files so frontend can fetch them by URL
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
const authRoutes = require('./routes/authRoutes');
const courseRoutes = require('./routes/courseRoutes');
const enrollmentRoutes = require('./routes/enrollmentRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const teacherApplicationRoutes = require('./routes/teacherApplicationRoutes');
const userRoutes = require('./routes/userRoutes');
const labRoutes = require('./routes/labRoutes');
const labSubscriptionRoutes = require('./routes/labSubscriptionRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/teacher-applications', teacherApplicationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/labs', labRoutes);
app.use('/api/lab-subscriptions', labSubscriptionRoutes);
app.use('/api/payments', paymentRoutes);

app.get("/", (req, res) => {
  res.json({ message: "ScholarX Backend API Running" });
});

module.exports = app;
