import { readFile } from "node:fs/promises";
import PDFDocument from "pdfkit";
import {
  questionnaireStepSummary,
  type CaribbeanQuestionnaireAnswers,
  type QuestionnaireStep,
} from "../shared/caribbeanQuestionnaire";

const BRAND_NAVY = "#1A3A5C";
const BRAND_TEAL = "#5BA3B8";
const LIGHT_TEAL = "#EAF4F7";
const LIGHT_GREY = "#F5F7F8";
const MID_GREY = "#64748B";
const DARK_TEXT = "#172033";
const BORDER = "#D8E1E6";
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 46;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BODY_TOP = 104;
const BODY_BOTTOM = 790;

export interface QuestionnairePdfInput {
  client: {
    name: string;
    code: string;
    programLabel: string;
  };
  questionnaire: {
    publicId: string | null;
    version: string;
    status: "not_started" | "draft" | "submitted";
    answers: CaribbeanQuestionnaireAnswers;
    startedAt: Date | string | null;
    lastSavedAt: Date | string | null;
    submittedAt: Date | string | null;
    steps: QuestionnaireStep[];
  };
  generatedAt?: Date;
  generatedBy: string;
}

export interface QuestionnairePdfResult {
  buffer: Buffer;
  fileName: string;
  questionCount: number;
  answeredCount: number;
}

function safeDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Cairo",
    timeZoneName: "short",
  }).format(date);
}

function safeFilePart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "questionnaire";
}

function scalarValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not answered";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function hasStoredValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasStoredValue);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).some(hasStoredValue);
  return true;
}

function isAnswered(step: QuestionnaireStep, answers: CaribbeanQuestionnaireAnswers) {
  return questionnaireStepSummary(step, answers[step.key], answers) !== "Not answered";
}

function humanizeKey(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, character => character.toUpperCase());
}

async function loadFonts() {
  const [regular, bold] = await Promise.all([
    readFile(new URL("./questionnaire-font-regular.ttf", import.meta.url)),
    readFile(new URL("./questionnaire-font-bold.ttf", import.meta.url)),
  ]);
  return { regular, bold };
}

export async function generateQuestionnairePdf(input: QuestionnairePdfInput): Promise<QuestionnairePdfResult> {
  const { regular, bold } = await loadFonts();
  const generatedAt = input.generatedAt ?? new Date();
  const answers = input.questionnaire.answers ?? {};
  const steps = Array.isArray(input.questionnaire.steps) ? input.questionnaire.steps : [];
  const answeredCount = steps.filter(step => isAnswered(step, answers)).length;

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true, info: {
      Title: `ELEVAY ${input.client.programLabel} Client Questionnaire`,
      Author: "ELEVAY",
      Subject: `Client Documentation questionnaire ${input.questionnaire.version}`,
      Keywords: "ELEVAY, questionnaire, client documentation",
      CreationDate: generatedAt,
    } });
    const chunks: Buffer[] = [];
    let y = BODY_TOP;
    let questionNumber = 0;

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont("Questionnaire-Regular", regular);
    doc.registerFont("Questionnaire-Bold", bold);

    const drawHeader = () => {
      doc.rect(0, 0, PAGE_WIDTH, 74).fill(BRAND_NAVY);
      doc.font("Questionnaire-Bold").fontSize(24).fillColor("#FFFFFF")
        .text("ELEVAY", MARGIN, 18, { lineBreak: false });
      doc.font("Questionnaire-Regular").fontSize(8.5).fillColor("#D7EAF0")
        .text("EXPANDING YOUR FREEDOM", MARGIN, 47, { lineBreak: false });
      doc.font("Questionnaire-Bold").fontSize(12).fillColor("#FFFFFF")
        .text("CLIENT QUESTIONNAIRE", PAGE_WIDTH - 245, 24, { width: 199, align: "right", lineBreak: false });
      doc.rect(MARGIN, 83, 58, 4).fill(BRAND_TEAL);
    };

    const newPage = () => {
      doc.addPage({ size: "A4", margin: 0 });
      drawHeader();
      y = BODY_TOP;
    };

    const ensureSpace = (height: number) => {
      if (y + height > BODY_BOTTOM) newPage();
    };

    const textHeight = (text: string, width: number, fontSize = 9.5, font = "Questionnaire-Regular") => {
      doc.font(font).fontSize(fontSize);
      return doc.heightOfString(text || " ", { width, lineGap: 1.5 });
    };

    const drawLabelValue = (label: string, value: string, x: number, width: number) => {
      const labelWidth = Math.min(135, width * 0.36);
      const valueWidth = width - labelWidth - 8;
      const valueHeight = Math.max(15, textHeight(value, valueWidth, 9.5));
      ensureSpace(valueHeight + 7);
      doc.font("Questionnaire-Bold").fontSize(8.5).fillColor(MID_GREY)
        .text(label, x, y, { width: labelWidth });
      doc.font("Questionnaire-Regular").fontSize(9.5).fillColor(DARK_TEXT)
        .text(value, x + labelWidth + 8, y, { width: valueWidth, lineGap: 1.5 });
      y += valueHeight + 7;
    };

    const drawQuestion = (step: QuestionnaireStep) => {
      questionNumber += 1;
      const prompt = step.prompt || humanizeKey(step.key);
      const promptAr = step.promptAr || "";
      const promptHeight = textHeight(prompt, CONTENT_WIDTH - 50, 10.5, "Questionnaire-Bold");
      const arabicHeight = promptAr ? textHeight(promptAr, CONTENT_WIDTH - 50, 9.5) : 0;
      ensureSpace(58 + promptHeight + arabicHeight);

      doc.roundedRect(MARGIN, y, 30, 22, 4).fill(BRAND_TEAL);
      doc.font("Questionnaire-Bold").fontSize(9).fillColor("#FFFFFF")
        .text(String(questionNumber), MARGIN, y + 6, { width: 30, align: "center", lineBreak: false });
      const optionalLabel = step.optional ? "OPTIONAL" : "REQUIRED";
      doc.font("Questionnaire-Bold").fontSize(7.5).fillColor(step.optional ? MID_GREY : BRAND_TEAL)
        .text(optionalLabel, MARGIN + 40, y + 2, { lineBreak: false });
      doc.font("Questionnaire-Bold").fontSize(10.5).fillColor(BRAND_NAVY)
        .text(prompt, MARGIN + 40, y + 14, { width: CONTENT_WIDTH - 40, lineGap: 1.5 });
      y += Math.max(36, 17 + promptHeight);
      if (promptAr) {
        doc.font("Questionnaire-Regular").fontSize(9.5).fillColor(MID_GREY)
          .text(promptAr, MARGIN + 40, y, { width: CONTENT_WIDTH - 40, align: "right", lineGap: 1.5 });
        y += arabicHeight + 7;
      }

      const answer = answers[step.key];
      if (step.type === "repeatable" && Array.isArray(answer) && answer.length > 0) {
        answer.forEach((row, index) => {
          const record = row && typeof row === "object" && !Array.isArray(row) ? row as Record<string, unknown> : {};
          ensureSpace(38);
          doc.roundedRect(MARGIN + 18, y, CONTENT_WIDTH - 18, 20, 3).fill(LIGHT_TEAL);
          doc.font("Questionnaire-Bold").fontSize(8.5).fillColor(BRAND_NAVY)
            .text(`Row ${index + 1}`, MARGIN + 28, y + 6, { lineBreak: false });
          y += 28;
          for (const field of step.fields ?? []) {
            drawLabelValue(field.label || humanizeKey(field.key), scalarValue(record[field.key]), MARGIN + 28, CONTENT_WIDTH - 38);
          }
          y += 3;
        });
      } else {
        const summary = questionnaireStepSummary(step, answer, answers);
        const answerHeight = Math.max(28, textHeight(summary, CONTENT_WIDTH - 38, 10) + 16);
        ensureSpace(answerHeight + 10);
        doc.roundedRect(MARGIN + 18, y, CONTENT_WIDTH - 18, answerHeight, 4)
          .fillAndStroke(LIGHT_GREY, BORDER);
        doc.font("Questionnaire-Bold").fontSize(8).fillColor(MID_GREY)
          .text("ANSWER", MARGIN + 28, y + 8, { lineBreak: false });
        doc.font("Questionnaire-Regular").fontSize(10).fillColor(DARK_TEXT)
          .text(summary, MARGIN + 28, y + 20, { width: CONTENT_WIDTH - 38, lineGap: 1.5 });
        y += answerHeight + 10;
      }
      doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).lineWidth(0.5).strokeColor(BORDER).stroke();
      y += 12;
    };

    drawHeader();

    doc.font("Questionnaire-Bold").fontSize(20).fillColor(BRAND_NAVY)
      .text(`${input.client.programLabel} Citizenship Questionnaire`, MARGIN, y, { width: CONTENT_WIDTH });
    y += 34;

    const statusLabel = input.questionnaire.status === "submitted" ? "SUBMITTED" : input.questionnaire.status === "draft" ? "DRAFT — IN PROGRESS" : "NOT STARTED";
    const statusColor = input.questionnaire.status === "submitted" ? "#168A54" : input.questionnaire.status === "draft" ? "#C27C0E" : MID_GREY;
    doc.roundedRect(MARGIN, y, 145, 24, 4).fill(statusColor);
    doc.font("Questionnaire-Bold").fontSize(8.5).fillColor("#FFFFFF")
      .text(statusLabel, MARGIN, y + 7, { width: 145, align: "center", lineBreak: false });
    doc.font("Questionnaire-Regular").fontSize(8.5).fillColor(MID_GREY)
      .text(`${answeredCount} of ${steps.length} questions answered`, PAGE_WIDTH - MARGIN - 190, y + 7, { width: 190, align: "right", lineBreak: false });
    y += 40;

    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 116, 6).fillAndStroke("#FFFFFF", BORDER);
    let infoY = y + 14;
    const infoRows: Array<[string, string, string, string]> = [
      ["Client", input.client.name, "Client Code", input.client.code],
      ["Program", input.client.programLabel, "Questionnaire Version", input.questionnaire.version],
      ["Started", safeDate(input.questionnaire.startedAt), "Last Saved", safeDate(input.questionnaire.lastSavedAt)],
      ["Submitted", safeDate(input.questionnaire.submittedAt), "Generated", safeDate(generatedAt)],
    ];
    for (const [leftLabel, leftValue, rightLabel, rightValue] of infoRows) {
      doc.font("Questionnaire-Bold").fontSize(8).fillColor(MID_GREY).text(leftLabel, MARGIN + 14, infoY, { width: 74, lineBreak: false });
      doc.font("Questionnaire-Regular").fontSize(8.5).fillColor(DARK_TEXT).text(leftValue, MARGIN + 90, infoY, { width: 150, lineBreak: false, ellipsis: true });
      doc.font("Questionnaire-Bold").fontSize(8).fillColor(MID_GREY).text(rightLabel, MARGIN + 258, infoY, { width: 105, lineBreak: false });
      doc.font("Questionnaire-Regular").fontSize(8.5).fillColor(DARK_TEXT).text(rightValue, MARGIN + 365, infoY, { width: 124, lineBreak: false, ellipsis: true });
      infoY += 23;
    }
    y += 134;

    let activeSection = "";
    for (const step of steps) {
      if (step.section !== activeSection) {
        activeSection = step.section;
        ensureSpace(42);
        doc.rect(MARGIN, y, CONTENT_WIDTH, 28).fill(BRAND_NAVY);
        doc.font("Questionnaire-Bold").fontSize(10).fillColor("#FFFFFF")
          .text(activeSection, MARGIN + 12, y + 9, { width: CONTENT_WIDTH - 24, lineBreak: false, ellipsis: true });
        y += 40;
      }
      drawQuestion(step);
    }

    const definitionKeys = new Set(steps.map(step => step.key));
    const additionalAnswers = Object.entries(answers).filter(([key, value]) => !definitionKeys.has(key) && hasStoredValue(value));
    if (additionalAnswers.length > 0) {
      ensureSpace(46);
      doc.rect(MARGIN, y, CONTENT_WIDTH, 28).fill(BRAND_NAVY);
      doc.font("Questionnaire-Bold").fontSize(10).fillColor("#FFFFFF")
        .text("Additional Stored Answers", MARGIN + 12, y + 9, { lineBreak: false });
      y += 40;
      for (const [key, value] of additionalAnswers) {
        drawLabelValue(humanizeKey(key), scalarValue(value), MARGIN, CONTENT_WIDTH);
      }
    }

    ensureSpace(56);
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 44, 4).fill(LIGHT_TEAL);
    doc.font("Questionnaire-Regular").fontSize(8.5).fillColor(BRAND_NAVY)
      .text(`Exported by ${input.generatedBy}. This PDF is generated from the authoritative questionnaire record stored in ELEVAY CRM.`, MARGIN + 12, y + 12, { width: CONTENT_WIDTH - 24, align: "center" });

    const pageRange = doc.bufferedPageRange();
    for (let pageIndex = pageRange.start; pageIndex < pageRange.start + pageRange.count; pageIndex += 1) {
      doc.switchToPage(pageIndex);
      doc.moveTo(MARGIN, PAGE_HEIGHT - 35).lineTo(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 35).lineWidth(0.5).strokeColor(BORDER).stroke();
      doc.font("Questionnaire-Regular").fontSize(7.5).fillColor(MID_GREY)
        .text(`ELEVAY • ${input.client.code} • ${input.questionnaire.version}`, MARGIN, PAGE_HEIGHT - 26, { width: CONTENT_WIDTH - 70, lineBreak: false });
      doc.text(`Page ${pageIndex - pageRange.start + 1} of ${pageRange.count}`, PAGE_WIDTH - MARGIN - 70, PAGE_HEIGHT - 26, { width: 70, align: "right", lineBreak: false });
    }

    doc.end();
  });

  const fileName = [
    "ELEVAY_Questionnaire",
    safeFilePart(input.client.code),
    safeFilePart(input.client.programLabel),
    safeFilePart(input.questionnaire.version),
  ].join("_") + ".pdf";

  return { buffer, fileName, questionCount: steps.length, answeredCount };
}
