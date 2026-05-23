/**
 * Route Detector — Brand Onboarding Agent
 *
 * Determines which extraction path to follow based on uploaded files:
 * - brand_book: at least 1 PDF with > 3 pages (size > 500KB as proxy)
 * - materials: only images or small PDFs
 *
 * Pure function — no side effects, no DB calls.
 */

import type { UploadedFile, OnboardingRoute } from "./brand-onboarding-types.ts";

/** Size threshold in bytes — PDFs above this are likely multi-page (> 3 pages) */
const LARGE_PDF_THRESHOLD_BYTES = 500 * 1024; // 500 KB

/**
 * Checks if a file is a PDF based on its mime_type.
 */
function isPdf(file: UploadedFile): boolean {
  return file.mime_type === "application/pdf";
}

/**
 * Checks if a PDF is considered "large" (likely > 3 pages).
 * Uses file size > 500KB as a proxy for page count.
 */
function isLargePdf(file: UploadedFile): boolean {
  return isPdf(file) && file.size_bytes > LARGE_PDF_THRESHOLD_BYTES;
}

/**
 * Detects the onboarding route based on uploaded files.
 *
 * Logic:
 * - If there's at least 1 PDF with size > 500KB → brand_book route
 *   - The largest PDF is used as the primary source
 *   - All other files become supplementary
 * - Otherwise → materials route (images, small PDFs)
 *
 * @param files - Array of uploaded files with metadata
 * @returns The detected onboarding route
 */
export function detectRoute(files: UploadedFile[]): OnboardingRoute {
  // Find all large PDFs (likely brand books with > 3 pages)
  const largePdfs = files.filter(isLargePdf);

  if (largePdfs.length > 0) {
    // Pick the largest PDF as the primary brand book
    const primaryPdf = largePdfs.reduce((largest, current) =>
      current.size_bytes > largest.size_bytes ? current : largest
    );

    // Everything else is supplementary
    const supplementary = files.filter((f) => f !== primaryPdf);

    return {
      type: "brand_book",
      pdf_url: primaryPdf.url,
      supplementary,
    };
  }

  // No large PDFs found — treat all files as materials
  return {
    type: "materials",
    files,
  };
}
