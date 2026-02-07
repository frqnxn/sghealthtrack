import jsPDF from "jspdf";

function safe(v) {
  return v === null || v === undefined ? "" : String(v);
}

function formatDate(value) {
  if (!value) return "";
  const dt = new Date(value);
  if (!Number.isNaN(dt.getTime())) return dt.toLocaleDateString();
  return String(value);
}

function formatDateTime(value) {
  if (!value) return "";
  const dt = new Date(value);
  if (!Number.isNaN(dt.getTime())) return dt.toLocaleString();
  return String(value);
}

function drawHeader(doc, { patient, appointment, sectionTitle }) {
  const M = 36;
  let y = 40;
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("SMARTGUYS COMMUNITY HEALTHCARE, INC.", pageW / 2, y, { align: "center" });
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "F.P Perez Building, Brgy. Parian Manila S. Rd. Calamba City, Laguna",
    pageW / 2,
    y,
    { align: "center" }
  );
  y += 12;
  doc.text("Tel. Nos. (049)523-71-49 / (049)530-37-66", pageW / 2, y, { align: "center" });
  y += 16;

  const name = patient?.full_name || patient?.name || "";
  const company = patient?.company || "";
  const age = patient?.age || "";
  const sex = patient?.sex || patient?.gender || "";
  const apptDate = appointment?.preferred_date || appointment?.scheduled_at || "";
  const dateText = formatDate(apptDate);

  doc.setFont("helvetica", "bold");
  doc.text("NAME:", M, y);
  doc.setFont("helvetica", "normal");
  doc.text(name, M + 60, y);
  doc.line(M + 60, y + 2, M + 270, y + 2);

  doc.setFont("helvetica", "bold");
  doc.text("DATE:", pageW - 200, y);
  doc.setFont("helvetica", "normal");
  doc.text(dateText, pageW - 140, y);
  doc.line(pageW - 140, y + 2, pageW - 40, y + 2);
  y += 16;

  doc.setFont("helvetica", "bold");
  doc.text("COMPANY:", M, y);
  doc.setFont("helvetica", "normal");
  doc.text(company, M + 70, y);
  doc.line(M + 70, y + 2, M + 270, y + 2);

  doc.setFont("helvetica", "bold");
  doc.text("AGE/SEX:", pageW - 200, y);
  doc.setFont("helvetica", "normal");
  doc.text(`${age}${age && sex ? " / " : ""}${sex}`, pageW - 130, y);
  doc.line(pageW - 130, y + 2, pageW - 40, y + 2);

  y += 18;

  doc.setLineWidth(0.6);
  doc.line(M, y, pageW - M, y);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("LABORATORY REPORT", pageW / 2, y, { align: "center" });
  y += 14;
  doc.text(sectionTitle, pageW / 2, y, { align: "center" });
  y += 10;
  doc.line(M, y, pageW - M, y);

  return y + 18;
}

function drawTwoColumnTable(doc, yStart, rows) {
  const M = 50;
  const pageW = doc.internal.pageSize.getWidth();
  let y = yStart;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("TEST", M, y);
  doc.text("RESULT", pageW - 170, y);
  y += 10;
  doc.setLineWidth(0.4);
  doc.line(M, y, pageW - M, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  rows.forEach((row) => {
    doc.text(row.label, M + 8, y);
    doc.text(safe(row.value), pageW - 170, y);
    y += 14;
  });

  return y;
}

function drawFooter(doc, yStart, remarks) {
  const M = 36;
  const pageW = doc.internal.pageSize.getWidth();
  let y = Math.max(yStart + 20, doc.internal.pageSize.getHeight() - 170);

  if (remarks) {
    doc.setFont("helvetica", "bold");
    doc.text("REMARKS:", M, y);
    doc.setFont("helvetica", "normal");
    doc.text(safe(remarks), M + 70, y);
    y += 16;
  }

  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.text("NOTE:", M + 190, y);
  doc.setFont("helvetica", "normal");
  doc.text(
    "The results are best interpreted by a healthcare professional and are not\nintended to be used as the sole means for diagnosis or management. Specimen rechecked,\nresult/s verified.",
    M + 220,
    y
  );

  y += 50;
  doc.setFont("helvetica", "bold");
  doc.text("TEST PERFORMED BY:", M, y);
  y += 36;
  doc.line(M + 20, y, M + 220, y);
  doc.line(pageW - 220, y, pageW - 20, y);
  y += 12;
  doc.setFontSize(8);
  doc.text("MEDICAL TECHNOLOGIST", M + 70, y);
  doc.text("PATHOLOGIST", pageW - 150, y);
}

function buildSections(lab) {
  const sections = [];
  const hasValue = (v) => v !== null && v !== undefined && String(v).trim() !== "";

  const hematologyRows = [];
  if (hasValue(lab?.cbc_hemoglobin)) hematologyRows.push({ label: "Hemoglobin", value: lab.cbc_hemoglobin });
  if (hasValue(lab?.cbc_hematocrit)) hematologyRows.push({ label: "Hematocrit", value: lab.cbc_hematocrit });
  if (hasValue(lab?.cbc_rbc_count)) hematologyRows.push({ label: "RBC Count", value: lab.cbc_rbc_count });
  if (hasValue(lab?.cbc_wbc_count)) hematologyRows.push({ label: "WBC Count", value: lab.cbc_wbc_count });
  if (hasValue(lab?.cbc_neutrophils)) hematologyRows.push({ label: "Neutrophils", value: lab.cbc_neutrophils });
  if (hasValue(lab?.cbc_lymphocytes)) hematologyRows.push({ label: "Lymphocytes", value: lab.cbc_lymphocytes });
  if (hasValue(lab?.cbc_eosinophils)) hematologyRows.push({ label: "Eosinophils", value: lab.cbc_eosinophils });
  if (hasValue(lab?.cbc_monocytes)) hematologyRows.push({ label: "Monocytes", value: lab.cbc_monocytes });
  if (hasValue(lab?.cbc_basophils)) hematologyRows.push({ label: "Basophils", value: lab.cbc_basophils });
  if (hasValue(lab?.cbc_platelet)) hematologyRows.push({ label: "Platelet", value: lab.cbc_platelet });
  if (hematologyRows.length) sections.push({ title: "HEMATOLOGY", rows: hematologyRows });

  const urinalysisRows = [];
  if (hasValue(lab?.ua_color)) urinalysisRows.push({ label: "Color", value: lab.ua_color });
  if (hasValue(lab?.ua_transparency)) urinalysisRows.push({ label: "Transparency", value: lab.ua_transparency });
  if (hasValue(lab?.ua_ph)) urinalysisRows.push({ label: "pH", value: lab.ua_ph });
  if (hasValue(lab?.ua_specific_gravity)) urinalysisRows.push({ label: "Specific Gravity", value: lab.ua_specific_gravity });
  if (hasValue(lab?.ua_sugar)) urinalysisRows.push({ label: "Sugar", value: lab.ua_sugar });
  if (hasValue(lab?.ua_albumin)) urinalysisRows.push({ label: "Albumin", value: lab.ua_albumin });
  if (hasValue(lab?.ua_bacteria)) urinalysisRows.push({ label: "Bacteria", value: lab.ua_bacteria });
  if (hasValue(lab?.ua_wbc_hpf)) urinalysisRows.push({ label: "WBC / hpf", value: lab.ua_wbc_hpf });
  if (hasValue(lab?.ua_rbc_hpf)) urinalysisRows.push({ label: "RBC / hpf", value: lab.ua_rbc_hpf });
  if (hasValue(lab?.ua_epithelial_cells)) urinalysisRows.push({ label: "Epithelial Cells", value: lab.ua_epithelial_cells });
  if (hasValue(lab?.ua_mucous_threads)) urinalysisRows.push({ label: "Mucous Threads", value: lab.ua_mucous_threads });
  if (hasValue(lab?.ua_amorphous_urates)) urinalysisRows.push({ label: "Amorphous Urates", value: lab.ua_amorphous_urates });
  if (hasValue(lab?.ua_casts)) urinalysisRows.push({ label: "Casts", value: lab.ua_casts });
  if (hasValue(lab?.ua_crystals)) urinalysisRows.push({ label: "Crystals", value: lab.ua_crystals });
  if (hasValue(lab?.pregnancy_test)) urinalysisRows.push({ label: "Pregnancy Test", value: lab.pregnancy_test });
  if (hasValue(lab?.urinalysis)) urinalysisRows.push({ label: "Urinalysis Notes", value: lab.urinalysis });
  if (urinalysisRows.length) {
    sections.push({
      title: "URINALYSIS",
      rows: urinalysisRows,
    });
  }

  const fecalysisRows = [];
  if (hasValue(lab?.fe_color)) fecalysisRows.push({ label: "Color", value: lab.fe_color });
  if (hasValue(lab?.fe_consistency)) fecalysisRows.push({ label: "Consistency", value: lab.fe_consistency });
  if (hasValue(lab?.fe_pus_cells_hpf)) fecalysisRows.push({ label: "Pus Cells / hpf", value: lab.fe_pus_cells_hpf });
  if (hasValue(lab?.fe_rbc_hpf)) fecalysisRows.push({ label: "RBC / hpf", value: lab.fe_rbc_hpf });
  if (hasValue(lab?.fe_ova_parasites)) fecalysisRows.push({ label: "Ova/Parasites", value: lab.fe_ova_parasites });
  if (hasValue(lab?.fecalysis)) fecalysisRows.push({ label: "Fecalysis Notes", value: lab.fecalysis });
  if (fecalysisRows.length) {
    sections.push({
      title: "FECALYSIS",
      rows: fecalysisRows,
    });
  }

  const serologyRows = [];
  if (hasValue(lab?.blood_typing)) serologyRows.push({ label: "Abo Typing", value: lab.blood_typing });
  if (hasValue(lab?.rh_factor)) serologyRows.push({ label: "RH", value: lab.rh_factor });
  if (hasValue(lab?.fbs)) serologyRows.push({ label: "FBS", value: lab.fbs });
  if (hasValue(lab?.rbs)) serologyRows.push({ label: "RBS", value: lab.rbs });
  if (hasValue(lab?.hepa_a_test)) serologyRows.push({ label: "Hepa A Test", value: lab.hepa_a_test });
  if (hasValue(lab?.hbsag)) serologyRows.push({ label: "Hepa B Test (HBsAg)", value: lab.hbsag });
  if (hasValue(lab?.drug_test)) serologyRows.push({ label: "Drugtest Screening", value: lab.drug_test });
  if (serologyRows.length) sections.push({ title: "SEROLOGY", rows: serologyRows });

  if (hasValue(lab?.others)) {
    sections.push({
      title: "OTHERS",
      rows: [{ label: "Others", value: lab.others }],
    });
  }

  return sections;
}

export async function generateLabSummaryPdf({ patient, appointment, lab } = {}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const sections = buildSections(lab || {});

  if (sections.length === 0) {
    const y = drawHeader(doc, { patient, appointment, sectionTitle: "LAB RESULTS" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("No lab results available.", 36, y + 10);
    return doc.output("arraybuffer");
  }

  sections.forEach((section, idx) => {
    if (idx > 0) doc.addPage();
    const yStart = drawHeader(doc, { patient, appointment, sectionTitle: section.title });
    const yEnd = drawTwoColumnTable(doc, yStart, section.rows);
    drawFooter(doc, yEnd, lab?.remarks);
  });

  return doc.output("arraybuffer");
}
