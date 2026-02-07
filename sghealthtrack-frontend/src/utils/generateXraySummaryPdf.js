import jsPDF from "jspdf";

function safe(v) {
  return v === null || v === undefined ? "" : String(v);
}

function labelValue(doc, x, y, label, value) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(label, x, y);
  doc.setFont("helvetica", "bold");
  doc.text(safe(value), x + 110, y);
  return y + 14;
}

export async function generateXraySummaryPdf({ patient, appointment, xray } = {}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const M = 36;
  let y = 36;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("X-ray Summary", M, y);
  y += 18;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  y = labelValue(doc, M, y, "Patient:", patient?.full_name || patient?.name || "");
  y = labelValue(doc, M, y, "Appointment:", appointment?.appointment_type || "");
  y = labelValue(doc, M, y, "Appointment Date:", appointment?.preferred_date || "");
  y = labelValue(doc, M, y, "Exam Date:", xray?.exam_date || "");

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Findings", M, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.text(safe(xray?.findings || "—"), M, y);
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.text("Impression", M, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.text(safe(xray?.impression || xray?.remarks || "—"), M, y);
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.text("Remarks", M, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.text(safe(xray?.remarks || "—"), M, y);

  return doc.output("arraybuffer");
}
