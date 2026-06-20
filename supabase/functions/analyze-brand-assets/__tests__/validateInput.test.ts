/**
 * Unit tests for validateAnalyzeRequest.
 *
 * Tests input validation for the analyze-brand-assets Edge Function.
 * Ensures proper validation of business_id (tenant isolation) and asset structure.
 *
 * **Validates: Requirements 1.1 (Tenant isolation), Property 7 (Brand isolation)**
 */
import { describe, it, expect } from "vitest";
import { validateAnalyzeRequest } from "../lib/validateInput";

describe("validateAnalyzeRequest", () => {
  const validRequest = {
    business_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    assets: [
      { type: "image", base64: "iVBORw0KGgoAAAANS...", filename: "logo.png" },
    ],
  };

  it("returns null for a valid request with one image asset", () => {
    const result = validateAnalyzeRequest(validRequest);
    expect(result).toBeNull();
  });

  it("returns null for a valid request with multiple assets", () => {
    const result = validateAnalyzeRequest({
      business_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      assets: [
        { type: "image", base64: "base64data1", filename: "logo.png" },
        { type: "screenshot", base64: "base64data2", filename: "screen.jpg" },
        { type: "pdf", base64: "base64data3", filename: "manual.pdf" },
      ],
    });
    expect(result).toBeNull();
  });

  it("returns null for assets without filename (optional)", () => {
    const result = validateAnalyzeRequest({
      business_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      assets: [{ type: "image", base64: "base64data" }],
    });
    expect(result).toBeNull();
  });

  // --- business_id validation ---

  it("rejects missing business_id", () => {
    const result = validateAnalyzeRequest({
      assets: [{ type: "image", base64: "data" }],
    });
    expect(result).toEqual({
      error: "validation_error",
      message: "Missing or invalid business_id",
    });
  });

  it("rejects empty business_id", () => {
    const result = validateAnalyzeRequest({
      business_id: "",
      assets: [{ type: "image", base64: "data" }],
    });
    expect(result).toEqual({
      error: "validation_error",
      message: "Missing or invalid business_id",
    });
  });

  it("rejects non-UUID business_id", () => {
    const result = validateAnalyzeRequest({
      business_id: "not-a-uuid",
      assets: [{ type: "image", base64: "data" }],
    });
    expect(result).toEqual({
      error: "validation_error",
      message: "business_id must be a valid UUID",
    });
  });

  // --- assets validation ---

  it("rejects missing assets", () => {
    const result = validateAnalyzeRequest({
      business_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    });
    expect(result).toEqual({
      error: "validation_error",
      message: "Missing or invalid assets array",
    });
  });

  it("rejects non-array assets", () => {
    const result = validateAnalyzeRequest({
      business_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      assets: "not an array",
    });
    expect(result).toEqual({
      error: "validation_error",
      message: "Missing or invalid assets array",
    });
  });

  it("rejects empty assets array", () => {
    const result = validateAnalyzeRequest({
      business_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      assets: [],
    });
    expect(result).toEqual({
      error: "validation_error",
      message: "At least one asset is required",
    });
  });

  it("rejects more than 10 assets", () => {
    const assets = Array.from({ length: 11 }, (_, i) => ({
      type: "image",
      base64: `data${i}`,
    }));
    const result = validateAnalyzeRequest({
      business_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      assets,
    });
    expect(result).toEqual({
      error: "validation_error",
      message: "Maximum 10 assets allowed per request",
    });
  });

  // --- individual asset validation ---

  it("rejects asset with invalid type", () => {
    const result = validateAnalyzeRequest({
      business_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      assets: [{ type: "video", base64: "data" }],
    });
    expect(result).toEqual({
      error: "validation_error",
      message: "Asset at index 0 has invalid type. Must be one of: image, pdf, screenshot",
    });
  });

  it("rejects asset with missing base64", () => {
    const result = validateAnalyzeRequest({
      business_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      assets: [{ type: "image" }],
    });
    expect(result).toEqual({
      error: "validation_error",
      message: "Asset at index 0 is missing base64 data",
    });
  });

  it("rejects asset with non-string filename", () => {
    const result = validateAnalyzeRequest({
      business_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      assets: [{ type: "image", base64: "data", filename: 123 }],
    });
    expect(result).toEqual({
      error: "validation_error",
      message: "Asset at index 0 has invalid filename",
    });
  });

  it("rejects null body", () => {
    const result = validateAnalyzeRequest(null);
    expect(result).toEqual({
      error: "parse_error",
      message: "Invalid request body",
    });
  });

  it("rejects non-object body", () => {
    const result = validateAnalyzeRequest("string body");
    expect(result).toEqual({
      error: "parse_error",
      message: "Invalid request body",
    });
  });
});
