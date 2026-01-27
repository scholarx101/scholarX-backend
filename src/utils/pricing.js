const parseOptionalNumber = require("./dates").parseOptionalNumber;

const normalizePricingPayload = (body) => {
  const p = body?.pricing && typeof body.pricing === "object" ? body.pricing : {};

  const admissionFee = parseOptionalNumber(body?.admissionFee ?? p.admissionFee);
  const monthlyFee = parseOptionalNumber(body?.monthlyFee ?? p.monthlyFee);
  const semesterFee = parseOptionalNumber(body?.semesterFee ?? p.semesterFee);
  const semesterDurationMonths = parseOptionalNumber(body?.semesterDurationMonths ?? p.semesterDurationMonths);
  const comboFee = parseOptionalNumber(body?.comboFee ?? p.comboFee);
  const durationMonths = parseOptionalNumber(body?.durationMonths ?? p.durationMonths);
  const currencyRaw = body?.currency ?? p.currency;

  const result = {
    admissionFee,
    monthlyFee,
    semesterFee,
    semesterDurationMonths: semesterDurationMonths !== undefined ? Math.trunc(semesterDurationMonths) : undefined,
    comboFee,
    durationMonths: durationMonths !== undefined ? Math.trunc(durationMonths) : undefined,
    currency: currencyRaw !== undefined && currencyRaw !== null && currencyRaw !== "" ? String(currencyRaw).trim() : undefined,
  };

  Object.keys(result).forEach((k) => result[k] === undefined && delete result[k]);
  return Object.keys(result).length ? result : undefined;
};

const attachEffectivePrice = (courseObj) => {
  if (!courseObj) return courseObj;

  const pricing = courseObj.pricing || {};
  const supportsMonthly = !!(pricing.monthlyFee !== undefined && pricing.admissionFee !== undefined);
  const supportsSemester = !!(pricing.semesterFee !== undefined && pricing.semesterDurationMonths !== undefined);

  let plan = "combo";
  let amount;

  if (supportsMonthly) {
    plan = "monthly";
    amount = pricing.monthlyFee;
  } else if (supportsSemester) {
    plan = "semester";
    amount = pricing.semesterFee;
  } else if (pricing.comboFee !== undefined && pricing.comboFee !== null) {
    plan = "combo";
    amount = pricing.comboFee;
  }

  const effective = {
    plan,
    amount: amount !== undefined ? Number(amount) : undefined,
    currency: pricing.currency || undefined,
  };

  if (pricing.admissionFee !== undefined && pricing.admissionFee !== null) {
    effective.admissionFee = Number(pricing.admissionFee);
  }

  effective.breakdown = {};
  if (effective.admissionFee !== undefined) effective.breakdown.admission = effective.admissionFee;
  if (plan === "monthly" && pricing.monthlyFee !== undefined) effective.breakdown.recurring = Number(pricing.monthlyFee);
  if (plan === "semester" && pricing.semesterFee !== undefined) effective.breakdown.recurring = Number(pricing.semesterFee);
  if (plan === "combo" && pricing.comboFee !== undefined) effective.breakdown.total = Number(pricing.comboFee);

  courseObj.effectivePrice = effective;
  return courseObj;
};

module.exports = {
  normalizePricingPayload,
  attachEffectivePrice,
};
