import { describe, it, expect } from 'vitest';
import {
  validateReferenceFile,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
} from '../fileValidator';

describe('validateReferenceFile', () => {
  it('accepts a valid PNG file under 10MB', () => {
    const result = validateReferenceFile({ type: 'image/png', size: 1024 });
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts a valid JPEG file', () => {
    const result = validateReferenceFile({ type: 'image/jpeg', size: 5 * 1024 * 1024 });
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts a valid WEBP file', () => {
    const result = validateReferenceFile({ type: 'image/webp', size: 100 });
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts a valid PDF file', () => {
    const result = validateReferenceFile({ type: 'application/pdf', size: 9 * 1024 * 1024 });
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts a file exactly at 10MB', () => {
    const result = validateReferenceFile({ type: 'image/png', size: MAX_FILE_SIZE_BYTES });
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects an unsupported format', () => {
    const result = validateReferenceFile({ type: 'image/gif', size: 1024 });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Formato no soportado. Usa PNG, JPG, WEBP o PDF');
  });

  it('rejects a file exceeding 10MB', () => {
    const result = validateReferenceFile({ type: 'image/png', size: MAX_FILE_SIZE_BYTES + 1 });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('El archivo excede el límite de 10MB');
  });

  it('returns both errors when format is invalid and size exceeds limit', () => {
    const result = validateReferenceFile({ type: 'video/mp4', size: 20 * 1024 * 1024 });
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors).toContain('Formato no soportado. Usa PNG, JPG, WEBP o PDF');
    expect(result.errors).toContain('El archivo excede el límite de 10MB');
  });

  it('rejects empty MIME type', () => {
    const result = validateReferenceFile({ type: '', size: 1024 });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Formato no soportado. Usa PNG, JPG, WEBP o PDF');
  });

  it('rejects a zero-size file with invalid format', () => {
    const result = validateReferenceFile({ type: 'text/plain', size: 0 });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Formato no soportado. Usa PNG, JPG, WEBP o PDF');
  });
});
