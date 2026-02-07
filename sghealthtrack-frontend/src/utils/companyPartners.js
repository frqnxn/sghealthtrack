export const PARTNER_COMPANIES = [
  "Ibiden",
  "Nexem",
  "Fast logistics",
  "Sambel Corp",
  "3MD logistics",
  "Nidec",
  "NYK-TDG",
  "Xissco",
  "Minebea",
  "May export",
  "Genosi",
  "J&T",
  "Kinetics",
  "Primepack",
  "Natures spring",
  "Toyota san pablo",
  "Jamserve",
  "PL tech",
  "SLA",
];

export const NON_PARTNER_NAME = "Non-partner";

export function slugify(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeCompanyName(input) {
  const raw = String(input || "").trim();
  const lower = raw.toLowerCase();
  if (!lower) return NON_PARTNER_NAME;
  const match = PARTNER_COMPANIES.find((c) => c.toLowerCase() === lower);
  return match || NON_PARTNER_NAME;
}
