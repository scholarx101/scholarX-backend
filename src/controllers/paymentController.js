const SSLCommerzPayment = require("sslcommerz-lts");
const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const Enrollment = require("../models/Enrollment");
const LabSubscription = require("../models/LabSubscription");
const Course = require("../models/Course");
const Lab = require("../models/Lab");
const User = require("../models/User");

const STORE_ID = process.env.SSLCZ_STORE_ID;
const STORE_PASSWD = process.env.SSLCZ_STORE_PASSWD;
const IS_LIVE = process.env.SSLCZ_IS_SANDBOX === "false"; // true only when explicitly set to "false"
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Generate a short unique transaction ID
const makeTranId = (prefix) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Calculate how much to charge for a course payment.
 * Returns { amount, includesAdmissionFee }
 */
const calcCourseAmount = (course, enrollment, paymentPlan, unitsCount = 1) => {
  const pricing = course.pricing || {};
  const admissionFee = Number(pricing.admissionFee) || 0;
  const admissionAlreadyPaid = enrollment ? enrollment.admissionFeePaid : false;

  let planAmount = 0;
  let includesAdmissionFee = false;

  if (paymentPlan === "combo") {
    planAmount = Number(pricing.comboFee) || 0;
  } else if (paymentPlan === "monthly") {
    planAmount = (Number(pricing.monthlyFee) || 0) * unitsCount;
  } else if (paymentPlan === "semester") {
    planAmount = (Number(pricing.semesterFee) || 0) * unitsCount;
  }

  if (!admissionAlreadyPaid && admissionFee > 0) {
    planAmount += admissionFee;
    includesAdmissionFee = true;
  }

  return { amount: planAmount, includesAdmissionFee };
};

// ─── Initiate course enrollment payment ──────────────────────────────────────
// POST /api/payments/course/init
// Body: { courseId, paymentPlan, unitsCount?, batchId? }
exports.initCoursePayment = async (req, res) => {
  try {
    const { courseId, paymentPlan, unitsCount = 1, batchId } = req.body;
    const userId = req.user.id;

    if (!courseId || !paymentPlan) {
      return res.status(400).json({ message: "courseId and paymentPlan are required" });
    }
    if (!["combo", "monthly", "semester"].includes(paymentPlan)) {
      return res.status(400).json({ message: "paymentPlan must be combo, monthly, or semester" });
    }

    const [course, user] = await Promise.all([
      Course.findById(courseId),
      User.findById(userId),
    ]);

    if (!course) return res.status(404).json({ message: "Course not found" });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Find existing enrollment (student may be making a subsequent monthly payment)
    let enrollment = await Enrollment.findOne({ student: userId, course: courseId });

    if (enrollment && enrollment.status === "active" && paymentPlan === "combo" && enrollment.isFullyPaid) {
      return res.status(409).json({ message: "You are already fully enrolled in this course" });
    }

    const { amount, includesAdmissionFee } = calcCourseAmount(
      course,
      enrollment,
      paymentPlan,
      Number(unitsCount)
    );

    if (amount <= 0) {
      return res.status(400).json({ message: "Calculated payment amount is zero. Check course pricing." });
    }

    const currency = course.pricing?.currency || "BDT";
    const tranId = makeTranId("SXC");

    // Create or update enrollment to pending if not already active
    if (!enrollment) {
      enrollment = await Enrollment.create({
        student: userId,
        course: courseId,
        batchId: batchId || undefined,
        status: "pending",
        paymentPlan,
        admissionFeePaid: false,
        monthsPaid: 0,
        semestersPaid: 0,
        isFullyPaid: false,
        paymentProvider: "sslcommerz",
      });
    }

    // Create payment record
    const payment = await Payment.create({
      type: "course",
      user: userId,
      course: courseId,
      enrollment: enrollment._id,
      tranId,
      amount,
      currency,
      paymentPlan,
      unitsCount: Number(unitsCount),
      includesAdmissionFee,
      status: "pending",
    });

    // Build SSLCommerz payload
    const sslData = {
      total_amount: amount,
      currency,
      tran_id: tranId,
      success_url: `${BACKEND_URL}/api/payments/success`,
      fail_url: `${BACKEND_URL}/api/payments/fail`,
      cancel_url: `${BACKEND_URL}/api/payments/cancel`,
      ipn_url: `${BACKEND_URL}/api/payments/ipn`,
      product_name: course.title,
      product_category: "education",
      product_profile: "general",
      cus_name: user.name || "Student",
      cus_email: user.email,
      cus_phone: user.phone || "N/A",
      cus_add1: user.addressLine1 || "N/A",
      cus_city: user.city || "Dhaka",
      cus_country: user.country || "Bangladesh",
      shipping_method: "NO",
      ship_name: user.name || "Student",
      ship_add1: "N/A",
      ship_city: "N/A",
      ship_country: "Bangladesh",
    };

    const sslcz = new SSLCommerzPayment(STORE_ID, STORE_PASSWD, IS_LIVE);
    const apiResponse = await sslcz.init(sslData);

    if (!apiResponse?.GatewayPageURL) {
      // Mark payment as failed if SSLCommerz returns no URL
      await Payment.findByIdAndUpdate(payment._id, { status: "failed", failedAt: new Date() });
      return res.status(502).json({
        message: "Could not initiate payment gateway",
        sslResponse: apiResponse,
      });
    }

    return res.json({
      gatewayUrl: apiResponse.GatewayPageURL,
      tranId,
      amount,
      currency,
      enrollmentId: enrollment._id,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Initiate lab subscription payment ───────────────────────────────────────
// POST /api/payments/lab/init
// Body: { labId }
exports.initLabPayment = async (req, res) => {
  try {
    const { labId } = req.body;
    const userId = req.user.id;

    if (!labId) {
      return res.status(400).json({ message: "labId is required" });
    }

    const [lab, user] = await Promise.all([
      Lab.findById(labId),
      User.findById(userId),
    ]);

    if (!lab || !lab.isActive) return res.status(404).json({ message: "Lab not found or inactive" });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!lab.monthlyFee || lab.monthlyFee <= 0) {
      return res.status(400).json({ message: "This lab has no monthly fee configured" });
    }

    // Find existing subscription
    let labSub = await LabSubscription.findOne({ student: userId, lab: labId });

    if (labSub && labSub.status === "active") {
      // Student is paying for another month
    } else if (labSub && labSub.status === "pending") {
      return res.status(409).json({ message: "A payment for this lab is already pending" });
    } else if (!labSub) {
      // Check max capacity before allowing new subscription
      if (lab.maxMembers) {
        const activeCount = await LabSubscription.countDocuments({ lab: labId, status: "active" });
        if (activeCount >= lab.maxMembers) {
          return res.status(409).json({ message: "This lab has reached its maximum member capacity" });
        }
      }
      labSub = await LabSubscription.create({
        student: userId,
        lab: labId,
        status: "pending",
        monthsPaid: 0,
        currency: lab.currency || "BDT",
      });
    } else if (labSub && labSub.status === "cancelled") {
      // Allow re-subscription
      labSub.status = "pending";
      labSub.cancelledAt = undefined;
      labSub.subscribedAt = new Date();
      await labSub.save();
    }

    const amount = lab.monthlyFee;
    const currency = lab.currency || "BDT";
    const tranId = makeTranId("SXL");

    const payment = await Payment.create({
      type: "lab",
      user: userId,
      lab: labId,
      labSubscription: labSub._id,
      tranId,
      amount,
      currency,
      paymentPlan: "monthly",
      unitsCount: 1,
      status: "pending",
    });

    const sslData = {
      total_amount: amount,
      currency,
      tran_id: tranId,
      success_url: `${BACKEND_URL}/api/payments/success`,
      fail_url: `${BACKEND_URL}/api/payments/fail`,
      cancel_url: `${BACKEND_URL}/api/payments/cancel`,
      ipn_url: `${BACKEND_URL}/api/payments/ipn`,
      product_name: `${lab.name} – Monthly Subscription`,
      product_category: "education",
      product_profile: "general",
      cus_name: user.name || "Student",
      cus_email: user.email,
      cus_phone: user.phone || "N/A",
      cus_add1: user.addressLine1 || "N/A",
      cus_city: user.city || "Dhaka",
      cus_country: user.country || "Bangladesh",
      shipping_method: "NO",
      ship_name: user.name || "Student",
      ship_add1: "N/A",
      ship_city: "N/A",
      ship_country: "Bangladesh",
    };

    const sslcz = new SSLCommerzPayment(STORE_ID, STORE_PASSWD, IS_LIVE);
    const apiResponse = await sslcz.init(sslData);

    if (!apiResponse?.GatewayPageURL) {
      await Payment.findByIdAndUpdate(payment._id, { status: "failed", failedAt: new Date() });
      return res.status(502).json({
        message: "Could not initiate payment gateway",
        sslResponse: apiResponse,
      });
    }

    return res.json({
      gatewayUrl: apiResponse.GatewayPageURL,
      tranId,
      amount,
      currency,
      labSubscriptionId: labSub._id,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Internal: process a successful validated payment ─────────────────────────
const processSuccessfulPayment = async (payment, sslResponse) => {
  // Mark payment completed
  payment.status = "completed";
  payment.valId = sslResponse.val_id || null;
  payment.sslResponse = sslResponse;
  payment.paidAt = new Date();
  await payment.save();

  if (payment.type === "course" && payment.enrollment) {
    const enrollment = await Enrollment.findById(payment.enrollment);
    if (enrollment) {
      enrollment.status = "active";
      enrollment.paymentProvider = "sslcommerz";
      enrollment.transactionId = payment.tranId;
      enrollment.invoiceId = sslResponse.bank_tran_id || null;
      enrollment.amountPaid = String(payment.amount);
      enrollment.currency = payment.currency;

      if (payment.includesAdmissionFee) enrollment.admissionFeePaid = true;

      if (payment.paymentPlan === "combo") {
        enrollment.isFullyPaid = true;
        // credit all months from durationMonths
        const course = await Course.findById(payment.course).select("pricing");
        enrollment.monthsPaid = course?.pricing?.durationMonths || 0;
      } else if (payment.paymentPlan === "monthly") {
        enrollment.monthsPaid = (enrollment.monthsPaid || 0) + (payment.unitsCount || 1);
      } else if (payment.paymentPlan === "semester") {
        enrollment.semestersPaid = (enrollment.semestersPaid || 0) + (payment.unitsCount || 1);
      }

      await enrollment.save();
    }
  }

  if (payment.type === "lab" && payment.labSubscription) {
    await LabSubscription.findByIdAndUpdate(payment.labSubscription, {
      status: "active",
      $inc: { monthsPaid: 1 },
      lastTransactionId: payment.tranId,
      amountPaid: payment.amount,
      currency: payment.currency,
    });
  }
};

// ─── SSLCommerz success callback ─────────────────────────────────────────────
// POST /api/payments/success
exports.handleSuccess = async (req, res) => {
  try {
    const { tran_id, val_id, status } = req.body;

    if (!tran_id || !val_id || status !== "VALID") {
      return res.redirect(`${FRONTEND_URL}/payment/fail?reason=invalid_response`);
    }

    const payment = await Payment.findOne({ tranId: tran_id });
    if (!payment || payment.status === "completed") {
      return res.redirect(`${FRONTEND_URL}/payment/success?tranId=${tran_id}`);
    }

    // Validate with SSLCommerz
    const sslcz = new SSLCommerzPayment(STORE_ID, STORE_PASSWD, IS_LIVE);
    const validation = await sslcz.validate({ val_id });

    if (
      validation?.status !== "VALID" ||
      parseFloat(validation.amount) < parseFloat(payment.amount) - 1 // allow 1 unit tolerance
    ) {
      payment.status = "failed";
      payment.sslResponse = validation;
      payment.failedAt = new Date();
      await payment.save();
      return res.redirect(`${FRONTEND_URL}/payment/fail?tranId=${tran_id}&reason=validation_failed`);
    }

    await processSuccessfulPayment(payment, validation);

    const successPath =
      payment.type === "course"
        ? `${FRONTEND_URL}/payment/success?tranId=${tran_id}&enrollmentId=${payment.enrollment}`
        : `${FRONTEND_URL}/payment/success?tranId=${tran_id}&labSubscriptionId=${payment.labSubscription}`;

    return res.redirect(successPath);
  } catch (error) {
    return res.redirect(`${FRONTEND_URL}/payment/fail?reason=server_error`);
  }
};

// ─── SSLCommerz fail callback ─────────────────────────────────────────────────
// POST /api/payments/fail
exports.handleFail = async (req, res) => {
  try {
    const { tran_id } = req.body;
    if (tran_id) {
      await Payment.findOneAndUpdate(
        { tranId: tran_id, status: "pending" },
        { status: "failed", sslResponse: req.body, failedAt: new Date() }
      );
    }
    return res.redirect(`${FRONTEND_URL}/payment/fail?tranId=${tran_id || ""}`);
  } catch (error) {
    return res.redirect(`${FRONTEND_URL}/payment/fail`);
  }
};

// ─── SSLCommerz cancel callback ───────────────────────────────────────────────
// POST /api/payments/cancel
exports.handleCancel = async (req, res) => {
  try {
    const { tran_id } = req.body;
    if (tran_id) {
      await Payment.findOneAndUpdate(
        { tranId: tran_id, status: "pending" },
        { status: "cancelled", sslResponse: req.body }
      );
    }
    return res.redirect(`${FRONTEND_URL}/payment/cancel?tranId=${tran_id || ""}`);
  } catch (error) {
    return res.redirect(`${FRONTEND_URL}/payment/cancel`);
  }
};

// ─── SSLCommerz IPN (server-to-server) callback ───────────────────────────────
// POST /api/payments/ipn
exports.handleIPN = async (req, res) => {
  try {
    const { tran_id, val_id, status } = req.body;

    if (!tran_id || !val_id || status !== "VALID") {
      return res.status(200).json({ received: true }); // always 200 for IPN
    }

    const payment = await Payment.findOne({ tranId: tran_id });
    if (!payment || payment.status === "completed") {
      return res.status(200).json({ received: true });
    }

    const sslcz = new SSLCommerzPayment(STORE_ID, STORE_PASSWD, IS_LIVE);
    const validation = await sslcz.validate({ val_id });

    if (
      validation?.status === "VALID" &&
      parseFloat(validation.amount) >= parseFloat(payment.amount) - 1
    ) {
      await processSuccessfulPayment(payment, validation);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    return res.status(200).json({ received: true });
  }
};

// ─── Admin: get all payments ──────────────────────────────────────────────────
// GET /api/payments?type=course|lab&status=pending|completed|failed|cancelled
exports.getAllPayments = async (req, res) => {
  try {
    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.status) filter.status = req.query.status;

    const payments = await Payment.find(filter)
      .populate("user", "name email")
      .populate("course", "title")
      .populate("lab", "name")
      .sort({ createdAt: -1 });

    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Student: get my payment history ─────────────────────────────────────────
// GET /api/payments/me
exports.getMyPayments = async (req, res) => {
  try {
    const payments = await Payment.find({ user: req.user.id })
      .populate("course", "title thumbnailUrl")
      .populate("lab", "name thumbnailUrl")
      .sort({ createdAt: -1 });

    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Get payment by tranId (student or admin) ─────────────────────────────────
// GET /api/payments/transaction/:tranId
exports.getPaymentByTranId = async (req, res) => {
  try {
    const payment = await Payment.findOne({ tranId: req.params.tranId })
      .populate("user", "name email")
      .populate("course", "title")
      .populate("lab", "name");

    if (!payment) return res.status(404).json({ message: "Payment not found" });

    const isOwner = payment.user._id.toString() === req.user.id;
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) return res.status(403).json({ message: "Forbidden" });

    res.json(payment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
