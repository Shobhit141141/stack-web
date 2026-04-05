import multer from "multer";
import { HttpError } from "../utils/http-error.js";

const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function extAllowed(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".pdf") || lower.endsWith(".docx");
}

export const uploadFileMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIMES.has(file.mimetype) || extAllowed(file.originalname)) {
      cb(null, true);
      return;
    }
    cb(new HttpError(400, "Only PDF and DOCX files are allowed"));
  },
}).single("file");
