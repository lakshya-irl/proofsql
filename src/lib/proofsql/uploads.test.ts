import { test, expect } from "vitest";
import initSqlJs from "sql.js";
import { csvToDb, kindOf, parseCsv, profileDb } from "./uploads";

test("csv parser handles quotes and CRLF", () => {
  expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"']]);
});

test("empty CSV cells become NULL, never zero, and duplicates are counted", async () => {
  const SQL = await initSqlJs();
  const db = csvToDb(SQL, "school,enrolment\nA,10\nB,\nA,10\n", "t");
  const p = profileDb(db)[0]!;
  expect(p.rows).toBe(3);
  expect(p.duplicateRows).toBe(1);
  expect(p.columns.find((c) => c.name === "enrolment")!.nulls).toBe(1);
  expect(db.exec("SELECT COUNT(*) FROM t WHERE enrolment = '0'")[0]?.values[0]?.[0]).toBe(0);
});

test("file types", () => {
  expect(kindOf("udise.CSV")).toBe("csv");
  expect(kindOf("x.db")).toBe("sqlite");
  expect(kindOf("x.pdf")).toBeNull();
});
