const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const app = express();

// Dev: allow any origin
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// Routes
const authRoutes = require('./routes/authRoutes');
const courseRoutes = require('./routes/courseRoutes');
const enrollmentRoutes = require('./routes/enrollmentRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const teacherApplicationRoutes = require('./routes/teacherApplicationRoutes');
const userRoutes = require('./routes/userRoutes');
const labRoutes = require('./routes/labRoutes');
const labSubscriptionRoutes = require('./routes/labSubscriptionRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/teacher-applications', teacherApplicationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/labs', labRoutes);
app.use('/api/lab-subscriptions', labSubscriptionRoutes);

app.get("/", (req, res) => {
  res.json({ message: "ScholarX Backend API Running" });
});

module.exports = app;
