import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

import { cleanExtractedText } from "../extraction/text-clean.util.js";

type LinkedomDocument = ReturnType<typeof parseHTML>["document"];

function stripNoiseFromDocument(doc: LinkedomDocument): void {
  const selectors = [
    "script",
    "noscript",
    "style",
    "template",
    "iframe",
    "nav",
    "header",
    "footer",
    "aside",
    '[role="navigation"]',
    '[role="banner"]',
    '[role="complementary"]',
    ".ad",
    ".ads",
    ".advertisement",
    "[class*='ad-']",
    "[id*='google_ads']",
  ];
  for (const sel of selectors) {
    doc.querySelectorAll(sel).forEach((el: { remove(): void }) => el.remove());
  }
}
// purpose: extract readable text from html
// ex input: html string (example: <html><body><h1>Hello, world!</h1><p>This is a test.</p></body></html>)
// ex output: string (example: "Hello, world! This is a test.")
export function extractReadableTextFromHtml(html: string): string {
  const { document } = parseHTML(html);
  stripNoiseFromDocument(document);
  const reader = new Readability(document);
  const article = reader.parse();
  const raw =
    article?.textContent?.trim() ||
    document.body?.innerText?.trim() ||
    "";
  return cleanExtractedText(raw);
}
