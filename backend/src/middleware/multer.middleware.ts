import multer from "multer";
import { USER_FILE_QUOTA_MAX_BYTES_PER_FILE } from "../constants/user-file-limits.js";
import { UPLOAD_ALLOWED_MIME_TYPES } from "../constants/upload-file-types.js";
import { HttpError } from "../utils/http-error.js";

const MAX_BYTES = USER_FILE_QUOTA_MAX_BYTES_PER_FILE;
// max files per multipart request (same cap as per-user file count)
export const UPLOAD_MAX_FILES_PER_REQUEST = 10;

function extAllowed(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".pdf") || lower.endsWith(".docx");
}

export const uploadFileMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: UPLOAD_MAX_FILES_PER_REQUEST },
  fileFilter(_req, file, cb) {
    if (
      UPLOAD_ALLOWED_MIME_TYPES.has(file.mimetype) ||
      extAllowed(file.originalname)
    ) {
      cb(null, true);
      return;
    }
    cb(new HttpError(400, "Only PDF and DOCX files are allowed"));
  },
}).array("file", UPLOAD_MAX_FILES_PER_REQUEST);
