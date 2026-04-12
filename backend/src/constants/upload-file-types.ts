export const FILE_SHORT_TYPE_TO_MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

export type FileShortType = keyof typeof FILE_SHORT_TYPE_TO_MIME;

export const PDF_MIME = FILE_SHORT_TYPE_TO_MIME.pdf;
export const DOCX_MIME = FILE_SHORT_TYPE_TO_MIME.docx;

export const HTML_MIME = "text/html";
export const PLAIN_MIME = "text/plain";

export const UPLOAD_ALLOWED_MIME_TYPES = new Set<string>(
  Object.values(FILE_SHORT_TYPE_TO_MIME)
);

// MIME types accepted when ingesting from a URL (binary docs + HTML + plain text).
export const URL_INGEST_ALLOWED_MIME_TYPES = new Set<string>([
  ...UPLOAD_ALLOWED_MIME_TYPES,
  HTML_MIME,
  PLAIN_MIME,
]);

export function isFileShortType(value: string): value is FileShortType {
  return Object.hasOwn(FILE_SHORT_TYPE_TO_MIME, value);
}
