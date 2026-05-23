/**
 * File validator for Design Studio reference image uploads.
 * Validates file format and size constraints.
 *
 * Supported formats: PNG, JPG, WEBP, PDF
 * Max size: 10MB
 */

const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
] as const;

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface ValidatableFile {
  type: string;
  size: number;
}

/**
 * Validates a file for reference image upload in the Design Studio.
 * Checks that the MIME type is supported and the file size is within limits.
 */
export function validateReferenceFile(file: ValidatableFile): FileValidationResult {
  const errors: string[] = [];

  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    errors.push('Formato no soportado. Usa PNG, JPG, WEBP o PDF');
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    errors.push('El archivo excede el límite de 10MB');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES };
