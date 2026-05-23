/**
 * Unit tests for Route Detector.
 *
 * Tests classification logic for brand onboarding routes:
 * - Large PDF (> 500KB) → brand_book route
 * - Only images → materials route
 * - Small PDF + images → materials route
 * - Large PDF + images (mixed) → brand_book with supplementary files
 */
import { describe, it, expect } from "vitest";
import { detectRoute } from "../routeDetector";
import type { UploadedFile } from "../brand-onboarding-types";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createFile(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    url: "https://storage.example.com/file.pdf",
    filename: "file.pdf",
    mime_type: "application/pdf",
    size_bytes: 100_000,
    ...overrides,
  };
}

function createLargePdf(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return createFile({
    url: "https://storage.example.com/brand-book.pdf",
    filename: "brand-book.pdf",
    mime_type: "application/pdf",
    size_bytes: 2_000_000, // 2MB — well above 500KB threshold
    ...overrides,
  });
}

function createSmallPdf(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return createFile({
    url: "https://storage.example.com/flyer.pdf",
    filename: "flyer.pdf",
    mime_type: "application/pdf",
    size_bytes: 200_000, // 200KB — below 500KB threshold
    ...overrides,
  });
}

function createImage(
  filename = "logo.png",
  mime = "image/png"
): UploadedFile {
  return createFile({
    url: `https://storage.example.com/${filename}`,
    filename,
    mime_type: mime,
    size_bytes: 150_000,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detectRoute", () => {
  describe("brand_book route (large PDF detected)", () => {
    it("classifies a single large PDF as brand_book", () => {
      const files = [createLargePdf()];
      const route = detectRoute(files);

      expect(route.type).toBe("brand_book");
      if (route.type === "brand_book") {
        expect(route.pdf_url).toBe(
          "https://storage.example.com/brand-book.pdf"
        );
        expect(route.supplementary).toEqual([]);
      }
    });

    it("picks the largest PDF when multiple large PDFs exist", () => {
      const smallerLargePdf = createLargePdf({
        url: "https://storage.example.com/guidelines.pdf",
        filename: "guidelines.pdf",
        size_bytes: 600_000,
      });
      const biggestPdf = createLargePdf({
        url: "https://storage.example.com/full-brand-book.pdf",
        filename: "full-brand-book.pdf",
        size_bytes: 5_000_000,
      });

      const files = [smallerLargePdf, biggestPdf];
      const route = detectRoute(files);

      expect(route.type).toBe("brand_book");
      if (route.type === "brand_book") {
        expect(route.pdf_url).toBe(
          "https://storage.example.com/full-brand-book.pdf"
        );
        expect(route.supplementary).toContain(smallerLargePdf);
      }
    });

    it("PDF exactly at 500KB threshold is classified as materials", () => {
      const borderlinePdf = createFile({
        url: "https://storage.example.com/borderline.pdf",
        filename: "borderline.pdf",
        mime_type: "application/pdf",
        size_bytes: 500 * 1024, // exactly 500KB
      });

      const route = detectRoute([borderlinePdf]);

      expect(route.type).toBe("materials");
    });

    it("PDF just above 500KB threshold is classified as brand_book", () => {
      const justAbove = createFile({
        url: "https://storage.example.com/just-above.pdf",
        filename: "just-above.pdf",
        mime_type: "application/pdf",
        size_bytes: 500 * 1024 + 1, // 1 byte above threshold
      });

      const route = detectRoute([justAbove]);

      expect(route.type).toBe("brand_book");
      if (route.type === "brand_book") {
        expect(route.pdf_url).toBe(
          "https://storage.example.com/just-above.pdf"
        );
      }
    });
  });

  describe("materials route (only images)", () => {
    it("classifies only images as materials", () => {
      const files = [
        createImage("logo.png", "image/png"),
        createImage("card.jpg", "image/jpeg"),
        createImage("icon.svg", "image/svg+xml"),
      ];

      const route = detectRoute(files);

      expect(route.type).toBe("materials");
      if (route.type === "materials") {
        expect(route.files).toHaveLength(3);
        expect(route.files).toEqual(files);
      }
    });

    it("classifies a single image as materials", () => {
      const files = [createImage("logo.png")];
      const route = detectRoute(files);

      expect(route.type).toBe("materials");
      if (route.type === "materials") {
        expect(route.files).toHaveLength(1);
      }
    });
  });

  describe("materials route (small PDF + images)", () => {
    it("classifies small PDF with images as materials", () => {
      const files = [
        createSmallPdf(),
        createImage("logo.png"),
        createImage("screenshot.jpg", "image/jpeg"),
      ];

      const route = detectRoute(files);

      expect(route.type).toBe("materials");
      if (route.type === "materials") {
        expect(route.files).toHaveLength(3);
        expect(route.files).toEqual(files);
      }
    });

    it("classifies only small PDFs as materials", () => {
      const files = [
        createSmallPdf({ filename: "card-front.pdf", size_bytes: 100_000 }),
        createSmallPdf({ filename: "card-back.pdf", size_bytes: 80_000 }),
      ];

      const route = detectRoute(files);

      expect(route.type).toBe("materials");
      if (route.type === "materials") {
        expect(route.files).toHaveLength(2);
      }
    });
  });

  describe("mixed case (large PDF + images → brand_book with supplementary)", () => {
    it("classifies large PDF + images as brand_book with supplementary files", () => {
      const brandBook = createLargePdf();
      const logo = createImage("logo.png");
      const card = createImage("business-card.jpg", "image/jpeg");

      const files = [brandBook, logo, card];
      const route = detectRoute(files);

      expect(route.type).toBe("brand_book");
      if (route.type === "brand_book") {
        expect(route.pdf_url).toBe(brandBook.url);
        expect(route.supplementary).toHaveLength(2);
        expect(route.supplementary).toContain(logo);
        expect(route.supplementary).toContain(card);
      }
    });

    it("classifies large PDF + small PDF + images as brand_book with all others as supplementary", () => {
      const brandBook = createLargePdf({ size_bytes: 3_000_000 });
      const smallPdf = createSmallPdf();
      const logo = createImage("logo.svg", "image/svg+xml");

      const files = [smallPdf, brandBook, logo];
      const route = detectRoute(files);

      expect(route.type).toBe("brand_book");
      if (route.type === "brand_book") {
        expect(route.pdf_url).toBe(brandBook.url);
        expect(route.supplementary).toHaveLength(2);
        expect(route.supplementary).toContain(smallPdf);
        expect(route.supplementary).toContain(logo);
      }
    });
  });

  describe("edge cases", () => {
    it("handles empty file array as materials with no files", () => {
      const route = detectRoute([]);

      expect(route.type).toBe("materials");
      if (route.type === "materials") {
        expect(route.files).toEqual([]);
      }
    });

    it("does not treat large non-PDF files as brand_book", () => {
      const largeImage = createImage("huge-photo.png");
      largeImage.size_bytes = 10_000_000; // 10MB image

      const route = detectRoute([largeImage]);

      expect(route.type).toBe("materials");
    });
  });
});
