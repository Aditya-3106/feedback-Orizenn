import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildDashboard } from "@/lib/analytics/engine";
import { buildWorkbook, exportFileName, type ExportData, type ExportRow } from "@/lib/exports/excel";
import type { AnswerValue, ResponseMode } from "@/lib/forms/definitions";
import { presentRespondent, type RespondentLike } from "@/lib/submissions/privacy";
import type { ExportType } from "@/lib/validation/export";
import { makeAnalyticsInput, makeOptions, makeQuestion, ratingAnswers } from "../fixtures";

const qRating = makeQuestion({ id: "qr", key: "q_rating", type: "RATING", text: "How useful was Orizenn?", position: 0 });
const qMulti = makeQuestion({ id: "qm", key: "q_multi", type: "MULTIPLE_CHOICE", text: "What did you change?", position: 1, options: makeOptions(["Label A", "Label B", "Label C"]) });
const qText = makeQuestion({ id: "qt", key: "q_text", type: "LONG_TEXT", text: "What was confusing?", position: 2, required: false });
const questions = [qRating, qMulti, qText];

const students: RespondentLike[] = [
  { id: "resp_0001", name: "Asha Rao", email: "asha@example.com", college: "IIT Bombay", branch: "CSE", year: "3", projectType: "Web app" },
  { id: "resp_0002", name: "Ben Dsouza", email: "ben@example.com", college: "NIT Trichy", branch: "ECE", year: "2", projectType: null },
  { id: "resp_0003", name: null, email: "c@example.com", college: null, branch: null, year: null, projectType: null },
];

function makeRows(mode: ResponseMode): ExportRow[] {
  const answers: Array<Record<string, AnswerValue | null>> = [
    { qr: { kind: "number", value: 5 }, qm: { kind: "json", value: ["label_a", "label_b"] }, qt: { kind: "text", value: "Nothing really" } },
    { qr: { kind: "number", value: 3 }, qm: { kind: "json", value: ["label_c"] }, qt: null },
    { qr: null, qm: null, qt: { kind: "text", value: "The terminology" } },
  ];
  return students.map((s, i) => ({
    submissionId: `sub_${i + 1}`,
    submittedAt: new Date(Date.UTC(2026, 8, 20 + i, 10, 30)),
    status: "COMPLETED",
    usageStatus: i === 0 ? "VERIFIED" : "UNKNOWN",
    durationSeconds: 60 + i,
    consentToQuote: i === 0 ? true : i === 1 ? false : null,
    respondent: presentRespondent(mode, s, i),
    answers: { ...answers[i] },
  }));
}

function makeData(type: ExportType, mode: ResponseMode = "IDENTIFIED"): ExportData {
  const dashboard = buildDashboard(makeAnalyticsInput(questions, { qr: ratingAnswers(qRating) }, { responses: 10 }));
  return {
    type,
    campaign: { id: "c1", name: "September Feedback", goal: "Learn what students think.", responseMode: mode, status: "ACTIVE", createdAt: new Date("2026-08-01T00:00:00Z") },
    version: { versionNumber: 1, publishedAt: new Date("2026-09-01T00:00:00Z"), createdAt: new Date("2026-08-15T00:00:00Z") },
    questions,
    rows: makeRows(mode),
    dashboard,
    filtersDescription: "",
    generatedAt: new Date("2026-09-29T12:00:00Z"),
  };
}

async function load(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  // exceljs declares its own `Buffer extends ArrayBuffer`; Node buffers are accepted at runtime.
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

function rowValues(ws: ExcelJS.Worksheet, rowNumber: number): ExcelJS.CellValue[] {
  return (ws.getRow(rowNumber).values as ExcelJS.CellValue[]).slice(1);
}

const BASE_HEADERS = ["Response ID", "Student", "College", "Branch", "Year", "Project Type", "Usage Status", "Submitted At", "Duration (s)", "Quote Consent"];
const QUESTION_HEADERS = ["Q1. How useful was Orizenn?", "Q2. What did you change?", "Q3. What was confusing?"];

describe("buildWorkbook FULL_WORKBOOK (PRD §50–§51, §115)", () => {
  it("has exactly the five named sheets", async () => {
    const wb = await load(await buildWorkbook(makeData("FULL_WORKBOOK")));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Responses", "Question Summary", "Student Data", "Themes", "Campaign Metadata"]);
  });

  it("IDENTIFIED: Responses header includes Email and one column per question", async () => {
    const wb = await load(await buildWorkbook(makeData("FULL_WORKBOOK", "IDENTIFIED")));
    const ws = wb.getWorksheet("Responses");
    expect(ws).toBeDefined();
    if (!ws) return;
    expect(rowValues(ws, 1)).toEqual([
      "Response ID",
      "Student",
      "Email",
      ...BASE_HEADERS.slice(2),
      ...QUESTION_HEADERS,
    ]);
  });

  it("row count = rows + 1 and cells hold typed values", async () => {
    const wb = await load(await buildWorkbook(makeData("FULL_WORKBOOK", "IDENTIFIED")));
    const ws = wb.getWorksheet("Responses");
    if (!ws) throw new Error("missing sheet");
    expect(ws.rowCount).toBe(4);

    const headers = rowValues(ws, 1) as string[];
    const col = (name: string) => headers.indexOf(name) + 1;

    const first = ws.getRow(2);
    expect(first.getCell(col("Response ID")).value).toBe("sub_1");
    expect(first.getCell(col("Student")).value).toBe("Asha Rao");
    expect(first.getCell(col("Email")).value).toBe("asha@example.com");
    expect(first.getCell(col("College")).value).toBe("IIT Bombay");
    expect(first.getCell(col("Usage Status")).value).toBe("Verified");
    expect(first.getCell(col("Submitted At")).value).toBeInstanceOf(Date);
    expect(first.getCell(col("Duration (s)")).value).toBe(60);
    expect(first.getCell(col("Quote Consent")).value).toBe("Yes");
    // RATING cell is a number, MULTIPLE_CHOICE is a label list, text is verbatim.
    expect(first.getCell(col(QUESTION_HEADERS[0])).value).toBe(5);
    expect(first.getCell(col(QUESTION_HEADERS[1])).value).toBe("Label A, Label B");
    expect(first.getCell(col(QUESTION_HEADERS[2])).value).toBe("Nothing really");

    const second = ws.getRow(3);
    expect(second.getCell(col("Quote Consent")).value).toBe("No");
    expect(second.getCell(col(QUESTION_HEADERS[1])).value).toBe("Label C");
    expect(second.getCell(col(QUESTION_HEADERS[2])).value).toBe("");

    const third = ws.getRow(4);
    expect(third.getCell(col("Student")).value).toBe("c@example.com");
    expect(third.getCell(col("Usage Status")).value).toBe("Unknown");
    expect(third.getCell(col("Quote Consent")).value).toBe("");
    expect(third.getCell(col(QUESTION_HEADERS[0])).value).toBe("");
    expect(third.getCell(col("College")).value).toBe("");
  });

  it("PSEUDONYMOUS: no Email column and 'Student 01'-style labels; no PII anywhere", async () => {
    const wb = await load(await buildWorkbook(makeData("FULL_WORKBOOK", "PSEUDONYMOUS")));
    const ws = wb.getWorksheet("Responses");
    if (!ws) throw new Error("missing sheet");
    expect(rowValues(ws, 1)).toEqual([...BASE_HEADERS, ...QUESTION_HEADERS]);
    expect(ws.getRow(2).getCell(2).value).toBe("Student 01");
    expect(ws.getRow(3).getCell(2).value).toBe("Student 02");
    expect(ws.getRow(4).getCell(2).value).toBe("Student 03");
    expect(ws.getRow(2).getCell(3).value).toBe("IIT Bombay");

    const students = wb.getWorksheet("Student Data");
    if (!students) throw new Error("missing sheet");
    expect(rowValues(students, 1)).toEqual(["Student", "College", "Branch", "Year", "Project Type", "Usage Status", "Submitted At"]);
    expect(students.rowCount).toBe(4);

    let dump = "";
    wb.eachSheet((sheet) => sheet.eachRow((row) => (dump += JSON.stringify(row.values))));
    expect(dump).not.toMatch(/Asha|Dsouza|@example\.com/);
  });

  it("ANONYMOUS: generic labels", async () => {
    const wb = await load(await buildWorkbook(makeData("FULL_WORKBOOK", "ANONYMOUS")));
    const ws = wb.getWorksheet("Responses");
    if (!ws) throw new Error("missing sheet");
    expect(rowValues(ws, 1)).toEqual([...BASE_HEADERS, ...QUESTION_HEADERS]);
    expect(ws.getRow(2).getCell(2).value).toBe("Respondent 01");
  });

  it("Student Data for IDENTIFIED includes Email", async () => {
    const wb = await load(await buildWorkbook(makeData("FULL_WORKBOOK", "IDENTIFIED")));
    const ws = wb.getWorksheet("Student Data");
    if (!ws) throw new Error("missing sheet");
    expect(rowValues(ws, 1)).toEqual(["Student", "Email", "College", "Branch", "Year", "Project Type", "Usage Status", "Submitted At"]);
    expect(ws.getRow(2).getCell(2).value).toBe("asha@example.com");
  });

  it("Question Summary carries deterministic metrics from the dashboard", async () => {
    const wb = await load(await buildWorkbook(makeData("FULL_WORKBOOK")));
    const ws = wb.getWorksheet("Question Summary");
    if (!ws) throw new Error("missing sheet");
    expect(rowValues(ws, 1)).toEqual(["#", "Question", "Type", "Category", "Analytics", "Responses", "Answer Rate %", "Average", "Median", "Top Answer", "Top Answer %"]);
    const rating = rowValues(ws, 2);
    expect(rating.slice(0, 9)).toEqual([1, "How useful was Orizenn?", "RATING", "", "RATING_DISTRIBUTION", 10, 100, 4, 4]);
    // Distribution table below the summary lists the PRD §109 buckets.
    let found = false;
    ws.eachRow((row) => {
      const v = row.values as ExcelJS.CellValue[];
      if (v[2] === "5" && v[3] === 4 && v[4] === 40) found = true;
    });
    expect(found).toBe(true);
  });

  it("Campaign Metadata lists campaign facts and the export row count", async () => {
    const wb = await load(await buildWorkbook(makeData("FULL_WORKBOOK")));
    const ws = wb.getWorksheet("Campaign Metadata");
    if (!ws) throw new Error("missing sheet");
    const entries = new Map<string, ExcelJS.CellValue>();
    ws.eachRow((row) => {
      const v = row.values as ExcelJS.CellValue[];
      entries.set(String(v[1]), v[2]);
    });
    expect(entries.get("Campaign")).toBe("September Feedback");
    expect(entries.get("Response mode")).toBe("IDENTIFIED");
    expect(entries.get("Version")).toBe("v1");
    expect(entries.get("Response count (this export)")).toBe(3);
    expect(entries.get("Filters")).toBe("None");
    expect(entries.get("Export type")).toBe("FULL_WORKBOOK");
  });
});

describe("other export types", () => {
  it("RAW_RESPONSES has 2 sheets", async () => {
    const wb = await load(await buildWorkbook(makeData("RAW_RESPONSES")));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Responses", "Campaign Metadata"]);
  });

  it("STUDENT_DATASET has 2 sheets", async () => {
    const wb = await load(await buildWorkbook(makeData("STUDENT_DATASET")));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Student Data", "Campaign Metadata"]);
  });

  it("ANALYTICS_SUMMARY has 3 sheets and works without a dashboard", async () => {
    const data = { ...makeData("ANALYTICS_SUMMARY"), dashboard: null };
    const wb = await load(await buildWorkbook(data));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Question Summary", "Themes", "Campaign Metadata"]);
    const summary = wb.getWorksheet("Question Summary");
    expect(summary?.rowCount).toBeGreaterThanOrEqual(4);
  });

  it("an export with zero rows still produces a valid workbook", async () => {
    const data = { ...makeData("FULL_WORKBOOK"), rows: [] };
    const wb = await load(await buildWorkbook(data));
    expect(wb.getWorksheet("Responses")?.rowCount).toBe(1);
  });
});

describe("exportFileName", () => {
  it("is kebab-case with the export type and date", () => {
    expect(exportFileName("September Feedback!", "FULL_WORKBOOK", new Date("2026-09-29T10:00:00Z"))).toBe("september-feedback-full-workbook-2026-09-29.xlsx");
    expect(exportFileName("  Q&A: Batch #3 ", "RAW_RESPONSES", new Date("2026-01-05T00:00:00Z"))).toBe("q-a-batch-3-raw-responses-2026-01-05.xlsx");
  });

  it("falls back to 'campaign' for an empty name", () => {
    expect(exportFileName("!!!", "STUDENT_DATASET", new Date("2026-09-29T10:00:00Z"))).toBe("campaign-student-dataset-2026-09-29.xlsx");
  });
});
