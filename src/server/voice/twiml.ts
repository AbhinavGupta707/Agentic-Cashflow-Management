export type CashflowTwiMLInput = {
  opening?: string | null;
  summary?: string | null;
  close?: string | null;
};

const DEFAULT_OPENING =
  "Hello, this is the H0 cashflow assistant calling on behalf of the finance team.";
const DEFAULT_SUMMARY =
  "We are following up on an approved cashflow action and would like to align on the next payment step.";
const DEFAULT_CLOSE =
  "Please reply through your usual finance contact if now is not a good time. Thank you.";

export function buildCashflowVoiceTwiML(input: CashflowTwiMLInput = {}): string {
  const lines = [input.opening ?? DEFAULT_OPENING, input.summary ?? DEFAULT_SUMMARY, input.close ?? DEFAULT_CLOSE]
    .map(normalizeLine)
    .filter((line) => line.length > 0);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    ...lines.flatMap((line, index) => [
      `  <Say>${escapeXmlText(line)}</Say>`,
      ...(index < lines.length - 1 ? ['  <Pause length="1"/>'] : []),
    ]),
    "</Response>",
  ].join("\n");
}

export function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeLine(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 480);
}
