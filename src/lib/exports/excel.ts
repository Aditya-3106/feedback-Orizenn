import ExcelJS from "exceljs";
import type { AnalyticsDashboard, QuestionBlock } from "@/lib/analytics/types";
import { describeAnswer, type AnswerValue, type QuestionDefinition } from "@/lib/forms/definitions";
import type { PresentedRespondent } from "@/lib/submissions/privacy";
import type { ExportType } from "@/lib/validation/export";

/** Everything the workbook needs, fully resolved and privacy-filtered upstream. */
export interface ExportData {
  type: ExportType;
  campaign: {
    id: string;
    name: string;
    goal: string;
    responseMode: string;
    status: string;
    createdAt: Date;
  };
  version: { versionNumber: number; publishedAt: Date | null; createdAt: Date };
  questions: QuestionDefinition[];
  rows: ExportRow[];
  dashboard: AnalyticsDashboard | null;
  filtersDescription: string;
  generatedAt: Date;
}

export interface ExportRow {
  submissionId: string;
  submittedAt: Date | null;
  status: string;
  usageStatus: string;
  durationSeconds: number | null;
  consentToQuote: boolean | null;
  respondent: PresentedRespondent;
  answers: Record<string, AnswerValue | null>;
}

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4E9EE" } };

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FF0A1B2A" } };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle" };
}

function autoWidth(ws: ExcelJS.Worksheet, min = 10, max = 60) {
  ws.columns.forEach((col) => {
    let width = min;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len + 2 > width) width = Math.min(max, len + 2);
    });
    col.width = width;
  });
}

function usageLabel(status: string): string {
  switch (status) {
    case "VERIFIED":
      return "Verified";
    case "NOT_VERIFIED":
      return "Not verified";
    default:
      return "Unknown";
  }
}

/** Sheet 1 — Responses (PRD §51). */
function addResponsesSheet(wb: ExcelJS.Workbook, data: ExportData) {
  const ws = wb.addWorksheet("Responses", { views: [{ state: "frozen", ySplit: 1 }] });
  const headers = [
    "Response ID",
    "Student",
    ...(data.campaign.responseMode === "IDENTIFIED" ? ["Email"] : []),
    "College",
    "Branch",
    "Year",
    "Project Type",
    "Usage Status",
    "Submitted At",
    "Duration (s)",
    "Quote Consent",
    ...data.questions.map((q, i) => `Q${i + 1}. ${q.text}`),
  ];
  ws.addRow(headers);
  styleHeader(ws.getRow(1));

  for (const r of data.rows) {
    ws.addRow([
      r.submissionId,
      r.respondent.label,
      ...(data.campaign.responseMode === "IDENTIFIED" ? [r.respondent.email ?? ""] : []),
      r.respondent.college ?? "",
      r.respondent.branch ?? "",
      r.respondent.year ?? "",
      r.respondent.projectType ?? "",
      usageLabel(r.usageStatus),
      r.submittedAt ?? "",
      r.durationSeconds ?? "",
      r.consentToQuote == null ? "" : r.consentToQuote ? "Yes" : "No",
      ...data.questions.map((q) => {
        const a = r.answers[q.id] ?? null;
        if (!a) return "";
        if (a.kind === "number") return a.value;
        if (a.kind === "boolean") return a.value ? "Yes" : "No";
        return describeAnswer(q, a);
      }),
    ]);
  }
  autoWidth(ws);
  const submittedCol = headers.indexOf("Submitted At") + 1;
  ws.getColumn(submittedCol).numFmt = "dd mmm yyyy hh:mm";
  return ws;
}

/** Sheet 2 — Question Summary. */
function addQuestionSummarySheet(wb: ExcelJS.Workbook, data: ExportData) {
  const ws = wb.addWorksheet("Question Summary", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow(["#", "Question", "Type", "Category", "Analytics", "Responses", "Answer Rate %", "Average", "Median", "Top Answer", "Top Answer %"]);
  styleHeader(ws.getRow(1));
  const blocks = new Map<string, QuestionBlock>((data.dashboard?.blocks ?? []).map((b) => [b.questionId, b]));

  data.questions.forEach((q, i) => {
    const b = blocks.get(q.id);
    let average: number | string = "";
    let median: number | string = "";
    let top = "";
    let topPct: number | string = "";
    if (b) {
      if (b.kind === "RATING_DISTRIBUTION" || b.kind === "SCALE_DISTRIBUTION" || b.kind === "NUMBER_SUMMARY") {
        average = b.average ?? "";
        median = b.median ?? "";
      }
      if ((b.kind === "OPTION_DISTRIBUTION" || b.kind === "SEGMENT_DISTRIBUTION") && b.top) {
        top = b.top.label;
        topPct = b.top.percent;
      }
      if (b.kind === "MULTI_SELECT_FREQUENCY" && b.items[0]) {
        top = b.items[0].label;
        topPct = b.items[0].percent;
      }
      if (b.kind === "YES_NO_DISTRIBUTION") {
        top = b.yes >= b.no ? "Yes" : "No";
        topPct = b.yesPercent == null ? "" : b.yes >= b.no ? b.yesPercent : 100 - b.yesPercent;
      }
      if (b.kind === "THEME_CLUSTER" && b.themes[0]) {
        top = b.themes[0].name;
        topPct = b.themes[0].percent;
      }
    }
    ws.addRow([i + 1, q.text, q.type, q.category ?? "", q.analyticsType, b?.answerCount ?? 0, b?.answerRate ?? 0, average, median, top, topPct]);
  });

  // Distributions below the summary table.
  ws.addRow([]);
  ws.addRow(["Distributions"]).font = { bold: true };
  for (const q of data.questions) {
    const b = blocks.get(q.id);
    if (!b) continue;
    const dist =
      b.kind === "RATING_DISTRIBUTION" || b.kind === "SCALE_DISTRIBUTION"
        ? b.distribution
        : b.kind === "OPTION_DISTRIBUTION" || b.kind === "SEGMENT_DISTRIBUTION"
          ? b.distribution
          : b.kind === "MULTI_SELECT_FREQUENCY"
            ? b.items
            : b.kind === "NUMBER_SUMMARY"
              ? b.buckets
              : b.kind === "YES_NO_DISTRIBUTION"
                ? [
                    { label: "Yes", count: b.yes, percent: b.yesPercent ?? 0 },
                    { label: "No", count: b.no, percent: b.yesPercent == null ? 0 : 100 - b.yesPercent },
                  ]
                : null;
    if (!dist) continue;
    ws.addRow([]);
    ws.addRow([q.text]).font = { bold: true };
    const h = ws.addRow(["", "Option", "Count", "Percent"]);
    styleHeader(h);
    for (const d of dist) ws.addRow(["", d.label, d.count, d.percent]);
  }
  autoWidth(ws);
}

/** Sheet 3 — Student Data. */
function addStudentSheet(wb: ExcelJS.Workbook, data: ExportData) {
  const ws = wb.addWorksheet("Student Data", { views: [{ state: "frozen", ySplit: 1 }] });
  const identified = data.campaign.responseMode === "IDENTIFIED";
  ws.addRow(["Student", ...(identified ? ["Email"] : []), "College", "Branch", "Year", "Project Type", "Usage Status", "Submitted At"]);
  styleHeader(ws.getRow(1));
  for (const r of data.rows) {
    ws.addRow([
      r.respondent.label,
      ...(identified ? [r.respondent.email ?? ""] : []),
      r.respondent.college ?? "",
      r.respondent.branch ?? "",
      r.respondent.year ?? "",
      r.respondent.projectType ?? "",
      usageLabel(r.usageStatus),
      r.submittedAt ?? "",
    ]);
  }
  ws.getColumn(identified ? 8 : 7).numFmt = "dd mmm yyyy hh:mm";
  autoWidth(ws);
}

/** Sheet 4 — Themes. */
function addThemesSheet(wb: ExcelJS.Workbook, data: ExportData) {
  const ws = wb.addWorksheet("Themes", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow(["Question", "Theme", "Keywords", "Mentions", "Percentage", "Source"]);
  styleHeader(ws.getRow(1));
  for (const block of data.dashboard?.themes ?? []) {
    for (const t of block.themes) {
      ws.addRow([block.title, t.name, t.keywords.join(", "), t.count, t.percent, block.source]);
    }
  }
  autoWidth(ws);
}

/** Sheet 5 — Campaign Metadata. */
function addMetadataSheet(wb: ExcelJS.Workbook, data: ExportData) {
  const ws = wb.addWorksheet("Campaign Metadata");
  const rows: Array<[string, string | number | Date]> = [
    ["Campaign", data.campaign.name],
    ["Campaign ID", data.campaign.id],
    ["Goal", data.campaign.goal],
    ["Status", data.campaign.status],
    ["Response mode", data.campaign.responseMode],
    ["Version", `v${data.version.versionNumber}`],
    ["Created", data.campaign.createdAt],
    ["Published", data.version.publishedAt ?? "Not published"],
    ["Response count (this export)", data.rows.length],
    ["Filters", data.filtersDescription || "None"],
    ["Export type", data.type],
    ["Generated at", data.generatedAt],
  ];
  for (const r of rows) ws.addRow(r);
  ws.getColumn(1).font = { bold: true };
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 60;
  ws.eachRow((row) => {
    if (row.getCell(2).value instanceof Date) row.getCell(2).numFmt = "dd mmm yyyy hh:mm";
  });
}

/** Build the .xlsx workbook in memory (PRD §50–§51). */
export async function buildWorkbook(data: ExportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Orizenn Feedback";
  wb.created = data.generatedAt;

  switch (data.type) {
    case "RAW_RESPONSES":
      addResponsesSheet(wb, data);
      addMetadataSheet(wb, data);
      break;
    case "STUDENT_DATASET":
      addStudentSheet(wb, data);
      addMetadataSheet(wb, data);
      break;
    case "ANALYTICS_SUMMARY":
      addQuestionSummarySheet(wb, data);
      addThemesSheet(wb, data);
      addMetadataSheet(wb, data);
      break;
    case "FULL_WORKBOOK":
      addResponsesSheet(wb, data);
      addQuestionSummarySheet(wb, data);
      addStudentSheet(wb, data);
      addThemesSheet(wb, data);
      addMetadataSheet(wb, data);
      break;
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

export function exportFileName(campaignName: string, type: ExportType, when = new Date()): string {
  const safe = campaignName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "campaign";
  const stamp = when.toISOString().slice(0, 10);
  return `${safe}-${type.toLowerCase().replace(/_/g, "-")}-${stamp}.xlsx`;
}
