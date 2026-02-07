import jsPDF from "jspdf";

function safe(v) {
  return v === null || v === undefined ? "" : String(v);
}

function toBool(v) {
  return !!v;
}

function calcAge(birth) {
  if (!birth) return "";
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 ? String(age) : "";
}

function line(doc, x1, y1, x2, y2) {
  doc.line(x1, y1, x2, y2);
}

function labelValue(doc, x, y, label, value, labelW = 40, valueW = 60) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(label, x, y);
  doc.setFont("helvetica", "bold");
  doc.text(safe(value).slice(0, 60), x + labelW, y);
  doc.setDrawColor(120);
  line(doc, x + labelW, y + 1, x + labelW + valueW, y + 1);
  doc.setDrawColor(0);
}

function ensureSpace(doc, y, needed, margin) {
  const H = doc.internal.pageSize.getHeight();
  if (y + needed > H - margin) {
    doc.addPage();
    return margin;
  }
  return y;
}

function writeWrapped(doc, text, x, y, maxWidth, lineHeight) {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function sectionBar(doc, x, y, w, h, title, color, textColor = [0, 0, 0]) {
  doc.setFillColor(...color);
  doc.rect(x, y, w, h, "F");
  doc.setTextColor(...textColor);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(title, x + 6, y + h - 4);
  doc.setTextColor(0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  return y + h + 8;
}

export async function generateMedicalReportPdf(pdfData) {
  const { patient, appointment, lab, xray, doctor, report } = pdfData || {};
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 36;

  const rpt = report || {};

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  const reportDate = safe(rpt.report_date || appointment?.preferred_date || new Date().toISOString().slice(0, 10));
  const company = safe(rpt.company || appointment?.company_name || appointment?.company || "");
  const fullName = safe(patient?.full_name || patient?.name || "");
  const saNo = safe(rpt.sa_no || appointment?.sa_no || "");
  const gender = safe(patient?.gender || "");
  const birth = safe(patient?.birth_date || patient?.birthdate || "");
  const status = safe(rpt.status || appointment?.status || "");
  const age = calcAge(birth);
  const address = safe(patient?.address || "");
  const contact = safe(patient?.contact_no || patient?.phone || "");
  const heightFt = safe(rpt.height_ft || patient?.height_ft || "");
  const heightIn = safe(rpt.height_in || patient?.height_in || "");
  const weight = safe(rpt.weight_lbs || patient?.weight_lbs || patient?.weight || "");

  const barColor = [178, 208, 230];
  const sectionColors = {
    medical: [184, 214, 236],
    physical: [180, 210, 232],
    lab: [176, 206, 228],
    classification: [172, 202, 224],
  };

  // Header (match clinic template styling, no image background)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.text("SMARTGUYS COMMUNITY HEALTHCARE, INC.", M, 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("F.P. Perez Building, Brgy. Parian Manila S. Rd. Calamba City, Laguna", M, 48);
  doc.text("Tel. Nos. (049)523-71-49 / (049)530-37-66", M, 60);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Physical/Medical", W - M - 110, 40);
  doc.text("Examination Report", W - M - 110, 52);

  // Title bar
  doc.setFillColor(...barColor);
  doc.rect(M, 72, W - M * 2, 16, "F");
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("PRE-EMPLOYMENT MEDICAL EXAM", W / 2, 83, { align: "center" });

  let y = 105;

  labelValue(doc, M, y, "Date:", reportDate, 35, 120);
  labelValue(doc, M + 240, y, "Company:", company, 55, 170);

  y += 16;
  labelValue(doc, M, y, "Patient's name:", fullName, 85, 180);
  labelValue(doc, M + 320, y, "SA No:", saNo, 40, 120);

  y += 16;
  labelValue(doc, M, y, "Gender:", gender, 45, 90);
  labelValue(doc, M + 170, y, "Birth Date:", birth, 60, 110);
  labelValue(doc, M + 340, y, "Status:", status, 45, 120);

  y += 16;
  labelValue(doc, M, y, "Age:", age, 30, 60);
  labelValue(doc, M + 120, y, "Height:", `${heightFt} ft ${heightIn} in`, 45, 140);
  labelValue(doc, M + 320, y, "Weight:", `${weight} lbs`, 45, 120);

  y += 16;
  labelValue(doc, M, y, "Address:", address, 50, 250);
  labelValue(doc, M + 340, y, "Contact No.:", contact, 70, 120);

  y = sectionBar(doc, M, y + 10, W - M * 2, 14, "I. MEDICAL HISTORY", sectionColors.medical);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Health history (Previous Ailment)", M, y);

  y += 10;
  const mhText = safe(rpt.health_history || "");
  if (mhText) {
    y = writeWrapped(doc, mhText, M, y, W - M * 2, 10);
  } else {
    line(doc, M, y + 2, W - M, y + 2);
    y += 10;
  }

  const mhItems = [
    ["mh_allergies", "Allergies"],
    ["mh_asthma", "Asthma"],
    ["mh_chickenpox", "Chickenpox"],
    ["mh_diabetes", "Diabetes"],
    ["mh_epilepsy", "Epilepsy"],
    ["mh_german_measles", "German Measles"],
    ["mh_measles", "Measles"],
    ["mh_cancer", "Cancer"],
    ["mh_hernia", "Hernia"],
    ["mh_kidney_problem", "Kidney Problem"],
    ["mh_thyroid_problem", "Thyroid"],
    ["mh_gastritis", "Gastritis"],
    ["mh_blood_problem", "Blood Problem"],
    ["mh_anemia_bleeding_clotting", "Anemia/Bleeding/Clotting"],
    ["mh_heart_disease", "Heart Disease"],
    ["mh_hepatitis", "Hepatitis"],
    ["mh_hypertension", "Hypertension"],
    ["mh_ulcers", "Ulcers"],
    ["mh_ptb", "PTB"],
    ["mh_vertigo", "Vertigo"],
    ["mh_psych_disorder", "Psychological Disorder"],
  ];

  y += 6;
  const mhLine = mhItems
    .map(([key, label]) => `${toBool(rpt[key]) ? "[x]" : "[ ]"} ${label}`)
    .join("  ");
  y = writeWrapped(doc, mhLine, M, y, W - M * 2, 10);

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("SOCIAL HISTORY", M, y);

  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const smoker = toBool(rpt.smoker) ? "Yes" : "No";
  const alcohol = toBool(rpt.alcohol_drinker) ? "Yes" : "No";
  doc.text(
    `Smoker: ${smoker}    No. of packs/day: ${safe(rpt.packs_per_day)}    Alcohol drinker: ${alcohol}    No. of years: ${safe(rpt.alcohol_years)}`,
    M,
    y
  );

  y += 14;
  doc.text("Present illness:", M, y);
  line(doc, M + 70, y + 2, W - M, y + 2);
  if (rpt.present_illness) {
    y += 10;
    y = writeWrapped(doc, safe(rpt.present_illness), M + 70, y, W - M - 70, 10);
  }

  y += 14;
  doc.text("Medication (previously and presently taking):", M, y);
  line(doc, M + 210, y + 2, W - M, y + 2);
  if (rpt.medications) {
    y += 10;
    y = writeWrapped(doc, safe(rpt.medications), M + 210, y, W - M - 210, 10);
  }

  y += 14;
  doc.text("Allergies (food, medicines, environmental, etc.):", M, y);
  line(doc, M + 225, y + 2, W - M, y + 2);
  if (rpt.allergies_notes) {
    y += 10;
    y = writeWrapped(doc, safe(rpt.allergies_notes), M + 225, y, W - M - 225, 10);
  }

  y += 14;
  doc.text("Operation / hospitalization:", M, y);
  line(doc, M + 130, y + 2, W - M, y + 2);
  if (rpt.operations) {
    y += 10;
    y = writeWrapped(doc, safe(rpt.operations), M + 130, y, W - M - 130, 10);
  }

  y = ensureSpace(doc, y + 14, 200, M);
  y = sectionBar(doc, M, y, W - M * 2, 14, "II. PHYSICAL EXAMINATION", sectionColors.physical);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  const leftCol = [
    ["Skin", "physical_skin"],
    ["Head", "physical_head"],
    ["Ears", "physical_ears"],
    ["Eyes", "physical_eyes"],
    ["Nose", "physical_nose"],
    ["Neck/throat", "physical_neck_throat"],
    ["Heart", "physical_heart"],
    ["Chest/lungs", "physical_chest_lungs"],
  ];
  const rightCol = [
    ["Breast", "physical_breast"],
    ["Abdomen", "physical_abdomen"],
    ["Anal/inguinal", "physical_anal_inguinal"],
    ["Back", "physical_back"],
    ["Extremities", "physical_extremities"],
    ["Others", "physical_others"],
  ];

  let yy = y + 12;
  leftCol.forEach(([label, key]) => {
    doc.text(`${label}:`, M, yy);
    const val = safe(rpt[key] || "");
    if (val) {
      doc.text(val.slice(0, 28), M + 70, yy);
    }
    line(doc, M + 70, yy + 2, M + 250, yy + 2);
    yy += 12;
  });

  yy = y + 12;
  rightCol.forEach(([label, key]) => {
    doc.text(`${label}:`, M + 290, yy);
    const val = safe(rpt[key] || "");
    if (val) {
      doc.text(val.slice(0, 28), M + 370, yy);
    }
    line(doc, M + 370, yy + 2, W - M, yy + 2);
    yy += 12;
  });

  y = Math.max(y + 12 + leftCol.length * 12, y + 12 + rightCol.length * 12) + 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("VITAL SIGNS", M, y);

  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(
    `BP: ${safe(rpt.bp_systolic)}/${safe(rpt.bp_diastolic)} mmHg    PR: ${safe(rpt.pr)} /bpm    RR: ${safe(rpt.rr)} /min    TEMP: ${safe(rpt.temp_c)} C`,
    M,
    y
  );

  y += 14;
  doc.setFont("helvetica", "bold");
  doc.text("VISUAL ACUITY", M, y);
  doc.setFont("helvetica", "normal");
  y += 12;
  doc.text(
    `OD ${safe(rpt.vision_wo_od)}   OS ${safe(rpt.vision_wo_os)}   OU ${safe(rpt.vision_wo_ou)}   (w/o glasses)     ` +
      `OD ${safe(rpt.vision_w_od)}   OS ${safe(rpt.vision_w_os)}   OU ${safe(rpt.vision_w_ou)}   (w/ glasses)     ` +
      `Near: OD ${safe(rpt.vision_near_od)} OS ${safe(rpt.vision_near_os)} OU ${safe(rpt.vision_near_ou)}`,
    M,
    y
  );

  y += 14;
  doc.setFont("helvetica", "bold");
  doc.text("ISHIHARA TEST", M, y);
  doc.setFont("helvetica", "normal");
  y += 12;
  doc.text(
    `Normal ${toBool(rpt.ishihara_normal) ? "[x]" : "[ ]"}   Defective ${toBool(rpt.ishihara_defective) ? "[x]" : "[ ]"}`,
    M,
    y
  );

  y += 14;
  doc.setFont("helvetica", "bold");
  doc.text("OB / Gyne", M, y);
  doc.setFont("helvetica", "normal");
  y += 12;
  doc.text(
    `LMP ${safe(rpt.ob_lmp)}   OB Score ${safe(rpt.ob_score)}   Interval ${safe(rpt.ob_interval)}   ` +
      `Duration ${safe(rpt.ob_duration)}   Dysmenorrhea ${safe(rpt.ob_dysmenorrhea)}`,
    M,
    y
  );

  y += 14;
  doc.setFont("helvetica", "bold");
  doc.text("DENTAL EXAMINATION", M, y);
  doc.setFont("helvetica", "normal");
  y += 12;
  doc.text(
    `Oral Prophylaxis ${safe(rpt.dental_oral_prophylaxis)}   Fillings ${safe(rpt.dental_fillings)}   ` +
      `Extraction ${safe(rpt.dental_extraction)}   Others ${safe(rpt.dental_others)}   Attending Dentist: ${safe(rpt.dental_attending)}`,
    M,
    y
  );

  y = ensureSpace(doc, y + 14, 220, M);
  y = sectionBar(doc, M, y, W - M * 2, 14, "III. LABORATORY AND DIAGNOSTIC EXAMINATION", sectionColors.lab);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  const rows = [
    ["Hematology (CBC)", safe(rpt.lab_hematology_result || lab?.cbc || ""), safe(rpt.lab_hematology_findings || "")],
    ["Urinalysis", safe(rpt.lab_urinalysis_result || lab?.urinalysis || ""), safe(rpt.lab_urinalysis_findings || "")],
    ["Fecalysis", safe(rpt.lab_fecalysis_result || lab?.fecalysis || ""), safe(rpt.lab_fecalysis_findings || "")],
    [
      "Chest X-Ray",
      safe(rpt.lab_chest_xray_result || lab?.chest_xray || ""),
      safe(rpt.lab_chest_xray_findings || xray?.findings || ""),
    ],
    ["ECG", safe(rpt.lab_ecg_result || lab?.ecg || ""), safe(rpt.lab_ecg_findings || "")],
    ["Psycho Test", safe(rpt.lab_psycho_test_result || lab?.psycho_test || ""), safe(rpt.lab_psycho_test_findings || "")],
    ["HBsAg", safe(rpt.lab_hbsag_result || lab?.hbsag || ""), safe(rpt.lab_hbsag_findings || "")],
    [
      "Pregnancy Test",
      safe(rpt.lab_pregnancy_test_result || lab?.pregnancy_test || ""),
      safe(rpt.lab_pregnancy_test_findings || ""),
    ],
    ["Blood Type", safe(rpt.lab_blood_type_result || lab?.blood_type || ""), safe(rpt.lab_blood_type_findings || "")],
    ["Drug Test", safe(rpt.lab_drug_test_result || lab?.drug_test || ""), safe(rpt.lab_drug_test_findings || "")],
  ];

  const tableTop = y + 10;
  const rowH = 12;

  doc.setFont("helvetica", "bold");
  doc.text("Test", M, tableTop);
  doc.text("Result", M + 170, tableTop);
  doc.text("Findings", M + 340, tableTop);
  doc.setFont("helvetica", "normal");

  rows.forEach((r, idx) => {
    const ry = tableTop + (idx + 1) * rowH;
    doc.text(r[0], M, ry);
    doc.text((r[1] || "__________").slice(0, 22), M + 170, ry);
    doc.text((r[2] || "__________").slice(0, 30), M + 340, ry);
  });

  y = tableTop + (rows.length + 1) * rowH + 10;

  y = ensureSpace(doc, y, 140, M);
  y = sectionBar(doc, M, y + 6, W - M * 2, 14, "IV. CLASSIFICATION AND RECOMMENDATIONS", sectionColors.classification);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Evaluations:", M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  y += 12;
  y = writeWrapped(doc, safe(rpt.evaluation || doctor?.evaluation || "__________"), M, y, W - M * 2, 10);

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Remarks:", M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  y += 12;
  y = writeWrapped(doc, safe(rpt.remarks || doctor?.remarks || "__________"), M, y, W - M * 2, 10);

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Recommendations:", M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  y += 12;
  y = writeWrapped(doc, safe(rpt.recommendations || doctor?.recommendation || "__________"), M, y, W - M * 2, 10);

  y = ensureSpace(doc, y + 18, 60, M);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.text(
    "Note: This certificate does not cover disease that would require special procedures and examinations. Valid only for three (3) months from date of examination.",
    M,
    y,
    { maxWidth: W - M * 2 }
  );

  y += 28;
  doc.setFontSize(8.5);
  doc.text("____________________________", W - M - 170, y);
  doc.text(safe(rpt.examining_physician || "Examining Physician"), W - M - 165, y + 12);

  const bytes = doc.output("arraybuffer");
  if (pdfData?.autoSave !== false) {
    doc.save(`Medical-Examination-Report-${safe(fullName).replace(/\s+/g, "_") || "patient"}.pdf`);
  }
  return bytes;
}
