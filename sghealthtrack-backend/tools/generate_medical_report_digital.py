import json
import sys
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.lib.units import mm

PAGE_W, PAGE_H = A4
INK = HexColor("#111827")
LIGHT = HexColor("#6B7280")
LINE = HexColor("#111827")
THIN = 0.7
THICK = 1.2
FONT = "Helvetica"
FONT_B = "Helvetica-Bold"

MARGIN_X = 12 * mm
MARGIN_Y = 12 * mm
FORM_X0 = MARGIN_X
FORM_Y0 = MARGIN_Y
FORM_W = PAGE_W - 2 * MARGIN_X
FORM_H = PAGE_H - 2 * MARGIN_Y

def nx(xn): return FORM_X0 + xn * FORM_W
def ny(yn): return FORM_Y0 + yn * FORM_H

def draw_line(c, x1, y1, x2, y2, w=THIN):
    c.setStrokeColor(LINE); c.setLineWidth(w); c.line(x1, y1, x2, y2)

def draw_box(c, x, y, w, h, lw=THIN):
    c.setStrokeColor(LINE); c.setLineWidth(lw); c.rect(x, y, w, h, stroke=1, fill=0)

def draw_label(c, x, y, text, size=9):
    c.setFillColor(LIGHT); c.setFont(FONT, size); c.drawString(x, y, text)

def draw_text(c, x, y, text, size=10, bold=False):
    c.setFillColor(INK); c.setFont(FONT_B if bold else FONT, size); c.drawString(x, y, str(text or ""))

def draw_check(c, x, y, checked=False):
    box = 3.5 * mm
    draw_box(c, x, y, box, box, lw=THIN)
    if checked:
        c.setStrokeColor(INK); c.setLineWidth(1.2)
        c.line(x + 0.8*mm, y + 1.8*mm, x + 1.6*mm, y + 0.9*mm)
        c.line(x + 1.6*mm, y + 0.9*mm, x + 3.0*mm, y + 3.0*mm)

def draw_write_line(c, x, y, w, lw=THIN):
    draw_line(c, x, y, x + w, y, w=lw)

VALUE_MAP = {
  "date": (0.86, 0.942, 10),
  "sa_no": (0.83, 0.914, 10),
  "company": (0.20, 0.895, 10),
  "patient": (0.22, 0.857, 10),
  "gender": (0.17, 0.819, 10),
  "birth_date": (0.33, 0.819, 10),
  "status": (0.57, 0.819, 10),
  "age": (0.69, 0.819, 10),
  "height": (0.85, 0.819, 10),
  "address": (0.18, 0.760, 10),
  "weight": (0.79, 0.760, 10),
  "contact": (0.20, 0.722, 10),

  "bp": (0.60, 0.565, 10),
  "pr": (0.60, 0.542, 10),
  "rr": (0.60, 0.519, 10),
  "temp": (0.60, 0.496, 10),

  "lab_hematology": (0.22, 0.310, 10),
  "lab_urinalysis": (0.22, 0.285, 10),
  "lab_fecalysis": (0.22, 0.260, 10),
  "lab_chest_xray": (0.22, 0.235, 10),
  "lab_ecg": (0.22, 0.210, 10),
  "lab_psycho": (0.22, 0.185, 10),

  "lab_hbsag": (0.62, 0.310, 10),
  "lab_pregnancy": (0.62, 0.285, 10),
  "lab_blood_type": (0.62, 0.260, 10),
  "lab_drug_test": (0.62, 0.235, 10),

  "evaluation": (0.16, 0.145, 10),
  "remarks": (0.16, 0.118, 10),
  "recommend": (0.16, 0.092, 10),
  "examining_physician": (0.78, 0.045, 10),
}

def draw_template(c):
    draw_text(c, nx(0.20), ny(0.975), "SMARTGUYS COMMUNITY HEALTHCARE, INC.", 13, bold=True)
    draw_text(c, nx(0.20), ny(0.958), "F.P Perez Building, Brgy. Parian Manila S. Rd. Calamba City, Laguna", 9)
    draw_text(c, nx(0.20), ny(0.944), "Tel. Nos. (049) 523-7149 / 0917-501-8050", 9)
    draw_text(c, nx(0.35), ny(0.915), "Physical/Medical Examination Report", 12, bold=True)

    draw_check(c, nx(0.80), ny(0.938), True)
    draw_label(c, nx(0.82), ny(0.940), "Date:", 9)
    draw_write_line(c, nx(0.87), ny(0.940), nx(0.98) - nx(0.87))

    draw_check(c, nx(0.80), ny(0.910), True)
    draw_label(c, nx(0.82), ny(0.912), "SA No.:", 9)
    draw_write_line(c, nx(0.87), ny(0.912), nx(0.98) - nx(0.87))

    y = 0.892
    for label in ["Company", "Patient's Name", "Gender", "Address", "Contact No."]:
        draw_check(c, nx(0.03), ny(y-0.007), True)
        draw_label(c, nx(0.06), ny(y), label, 9)
        draw_write_line(c, nx(0.16), ny(y), nx(0.78) - nx(0.16))
        y -= 0.038

    draw_line(c, nx(0.03), ny(0.688), nx(0.98), ny(0.688), w=THICK)

    draw_text(c, nx(0.03), ny(0.668), "MEDICAL HISTORY", 10, bold=True)
    draw_label(c, nx(0.03), ny(0.650), "Health History (Previous Ailment)", 9)
    draw_box(c, nx(0.03), ny(0.515), nx(0.55)-nx(0.03), ny(0.645)-ny(0.515))

    draw_text(c, nx(0.03), ny(0.160), "Laboratory and Diagnostic Examination", 10, bold=True)

    draw_text(c, nx(0.03), ny(0.070), "Recommendations", 10, bold=True)
    draw_box(c, nx(0.03), ny(0.020), nx(0.98)-nx(0.03), ny(0.068)-ny(0.020))

    draw_write_line(c, nx(0.70), ny(0.008), nx(0.98)-nx(0.70))
    draw_label(c, nx(0.78), ny(0.000), "Examining Physician", 8)

def overlay_values(c, data):
    for key, (xn, yn, fs) in VALUE_MAP.items():
        draw_text(c, nx(xn), ny(yn), data.get(key, ""), size=fs, bold=False)

def generate(output_pdf, data):
    c = canvas.Canvas(output_pdf, pagesize=A4)
    draw_template(c)
    overlay_values(c, data)
    c.showPage()
    c.save()

if __name__ == "__main__":
    # usage: python script.py '{"output":"file.pdf","data":{...}}'
    payload = json.loads(sys.argv[1])
    generate(payload["output"], payload["data"])
