import { PDFParse } from "pdf-parse";

export type PdfExtractResult = {
  text: string;
  pageCount: number;
};

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return {
      text: result.text ?? "",
      pageCount: result.total ?? 0,
    };
  } finally {
    await parser.destroy();
  }
}
