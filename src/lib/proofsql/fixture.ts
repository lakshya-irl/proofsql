// Reproducible synthetic fixture. Fixed seed; data-quality issues are injected on purpose.
import { FIXTURE_SEED } from "./schema";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FIXTURE_MANIFEST = [
  "Mixed academic-year formats: '2023/24', 'AY2023', '2024-25' (plus a few unresolvable values like '2024' and empty string).",
  "Duplicate student-school-year enrolment rows.",
  "Some schools have no records for one comparison year (2023-24 or 2024-25).",
  "Missing values (NULL) in student_id, school_id, enrolment_count and payment amount.",
  "Sentinel values 'N/A', 'unknown' and empty strings in status columns.",
  "Two schools with near-identical names but different IDs.",
  "Three Jaipur-like districts: 'JPR', 'Jaipur Urban', 'Jaipur District'.",
  "A genuine zero payment and a genuine zero enrolment_count, distinct from missing values.",
  "schools → enrolments and schools → payments are one-to-many: joining both raw tables fans out rows.",
];

const q = (v: string | number | null) =>
  v === null ? "NULL" : typeof v === "number" ? String(v) : `'${v.replace(/'/g, "''")}'`;

export function buildFixtureSql(seed = FIXTURE_SEED): string {
  const r = mulberry32(seed);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(r() * arr.length)] as T;
  const out: string[] = [
    "CREATE TABLE districts (district_code TEXT, district_name TEXT);",
    "CREATE TABLE schools (school_id INTEGER, school_name TEXT, district_code TEXT, school_status TEXT);",
    "CREATE TABLE enrolments (enrolment_id INTEGER, school_id INTEGER, student_id TEXT, academic_year TEXT, student_status TEXT, enrolment_count INTEGER);",
    "CREATE TABLE payments (payment_id INTEGER, school_id INTEGER, academic_year TEXT, amount REAL, payment_status TEXT);",
  ];
  const districts: [string, string][] = [
    ["JPR", "JPR"],
    ["JPU", "Jaipur Urban"],
    ["JPD", "Jaipur District"],
    ["UDR", "Udaipur"],
    ["KOT", "Kota"],
  ];
  for (const [c, n] of districts) out.push(`INSERT INTO districts VALUES (${q(c)}, ${q(n)});`);

  const schoolNames = [
    "Govt Senior Secondary School Bassi",
    "Govt Sr. Secondary School Bassi",
    "Adarsh Vidya Mandir",
    "Mahatma Gandhi Govt School Sanganer",
    "Kendriya Vidyalaya No. 2",
    "Lake City Public School",
    "Chambal Valley Academy",
    "Rawatbhata Govt Upper Primary",
    "Amer Fort Road School",
    "Jhalana Girls Secondary",
    "Fatehsagar Model School",
    "Bundi Road Primary",
  ];
  const statuses = ["active", "active", "active", "closed", "N/A", ""];
  schoolNames.forEach((name, i) => {
    const d = districts[i % districts.length]![0];
    out.push(`INSERT INTO schools VALUES (${101 + i}, ${q(name)}, ${q(d)}, ${q(statuses[i % statuses.length]!)});`);
  });

  const yearFormats: Record<string, string[]> = {
    "2022-23": ["2022/23", "AY2022", "2022-23"],
    "2023-24": ["2023/24", "AY2023", "2023-24"],
    "2024-25": ["2024-25", "2024/25", "AY2024"],
  };
  // Schools missing a comparison year (index → missing year)
  const missingYear: Record<number, string> = { 2: "2024-25", 5: "2023-24", 8: "2024-25", 10: "2023-24", 11: "2024-25" };

  let eid = 1;
  let pid = 1;
  schoolNames.forEach((_, i) => {
    const sid = 101 + i;
    const base = 18 + Math.floor(r() * 14);
    const trend = r() < 0.5 ? -1 : 1;
    Object.keys(yearFormats).forEach((year, yi) => {
      if (missingYear[i] === year) return;
      const n = Math.max(6, base + trend * yi * (2 + Math.floor(r() * 4)));
      for (let s = 0; s < n; s++) {
        const student = `S${sid}-${String(s + 1).padStart(3, "0")}`;
        const raw = pick(yearFormats[year]!);
        const roll = r();
        const status = roll < 0.82 ? "active" : roll < 0.9 ? "inactive" : roll < 0.95 ? "unknown" : "N/A";
        const count = r() < 0.03 ? null : r() < 0.02 ? 0 : 1;
        out.push(`INSERT INTO enrolments VALUES (${eid++}, ${sid}, ${q(student)}, ${q(raw)}, ${q(status)}, ${q(count)});`);
        if (r() < 0.07) {
          // duplicate record of the same student-school-year
          out.push(`INSERT INTO enrolments VALUES (${eid++}, ${sid}, ${q(student)}, ${q(pick(yearFormats[year]!))}, ${q(status)}, 1);`);
        }
      }
      const pays = 2 + Math.floor(r() * 4);
      for (let p = 0; p < pays; p++) {
        const roll = r();
        const st = roll < 0.7 ? "completed" : roll < 0.85 ? "pending" : roll < 0.95 ? "failed" : "unknown";
        const amt = r() < 0.08 ? null : Math.round(5000 + r() * 45000);
        out.push(`INSERT INTO payments VALUES (${pid++}, ${sid}, ${q(pick(yearFormats[year]!))}, ${q(amt)}, ${q(st)});`);
      }
    });
  });
  // Explicit edge cases
  out.push(`INSERT INTO enrolments VALUES (${eid++}, 103, NULL, '2023/24', 'active', 1);`);
  out.push(`INSERT INTO enrolments VALUES (${eid++}, NULL, 'S999-001', 'AY2023', 'active', 1);`);
  out.push(`INSERT INTO enrolments VALUES (${eid++}, 104, 'S104-900', '2024', 'active', 1);`);
  out.push(`INSERT INTO enrolments VALUES (${eid++}, 106, 'S106-900', '', 'active', 1);`);
  out.push(`INSERT INTO payments VALUES (${pid++}, 107, '2023-24', 0, 'completed');`);
  out.push(`INSERT INTO payments VALUES (${pid++}, 107, '2024-25', NULL, 'completed');`);
  out.push(`INSERT INTO payments VALUES (${pid++}, 109, 'N/A', 12000, 'completed');`);
  return out.join("\n");
}
