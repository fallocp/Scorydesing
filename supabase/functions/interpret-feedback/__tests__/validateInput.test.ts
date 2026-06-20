/**
 * Unit tests for validateFeedbackInput.
 *
 * Tests input validation for the interpret-feedback Edge Function.
 * Ensures tenant isolation by validating required fields.
 *
 * **Validates: Requirements 1.1 (Tenant isolation)**
 */
import { describe, it, expect } from "vitest";
import { validateFeedbackInput, isPatternData } from "../lib/validateInput";

describe("validateFeedbackInput", () => {
  it("returns null for valid explicit feedback", () => {
    const result = validateFeedbackInput({
      business_id: "uuid-123",
      feedback_type: "explicit",
      content: "Me gustan los fondos claros",
    });
    expect(result).toBeNull();
  });

  it("returns null for valid pattern feedback", () => {
    const result = validateFeedbackInput({
      business_id: "uuid-123",
      feedback_type: "pattern",
      content: { approved_ids: ["a", "b"], rejected_ids: ["c"] },
    });
    expect(result).toBeNull();
  });

  it("rejects missing business_id", () => {
    const result = validateFeedbackInput({
      feedback_type: "explicit",
      content: "some feedback",
    });
    expect(result).toEqual({ error: "business_id is required" });
  });

  it("rejects empty business_id", () => {
    const result = validateFeedbackInput({
      business_id: "",
      feedback_type: "explicit",
      content: "some feedback",
    });
    expect(result).toEqual({ error: "business_id is required" });
  });

  it("rejects invalid feedback_type", () => {
    const result = validateFeedbackInput({
      business_id: "uuid-123",
      feedback_type: "invalid",
      content: "some feedback",
    });
    expect(result).toEqual({ error: "feedback_type must be 'explicit' or 'pattern'" });
  });

  it("rejects missing feedback_type", () => {
    const result = validateFeedbackInput({
      business_id: "uuid-123",
      content: "some feedback",
    });
    expect(result).toEqual({ error: "feedback_type must be 'explicit' or 'pattern'" });
  });

  it("rejects missing content", () => {
    const result = validateFeedbackInput({
      business_id: "uuid-123",
      feedback_type: "explicit",
    });
    expect(result).toEqual({ error: "content is required" });
  });

  it("rejects null content", () => {
    const result = validateFeedbackInput({
      business_id: "uuid-123",
      feedback_type: "explicit",
      content: null,
    });
    expect(result).toEqual({ error: "content is required" });
  });

  it("rejects non-string content for explicit feedback", () => {
    const result = validateFeedbackInput({
      business_id: "uuid-123",
      feedback_type: "explicit",
      content: { some: "object" },
    });
    expect(result).toEqual({ error: "content must be a string for explicit feedback" });
  });

  it("rejects empty string content for explicit feedback", () => {
    const result = validateFeedbackInput({
      business_id: "uuid-123",
      feedback_type: "explicit",
      content: "   ",
    });
    expect(result).toEqual({ error: "content must not be empty for explicit feedback" });
  });

  it("rejects invalid pattern data structure", () => {
    const result = validateFeedbackInput({
      business_id: "uuid-123",
      feedback_type: "pattern",
      content: "not a pattern object",
    });
    expect(result).toEqual({
      error: "content must be { approved_ids: string[], rejected_ids: string[] } for pattern feedback",
    });
  });

  it("rejects pattern data missing approved_ids", () => {
    const result = validateFeedbackInput({
      business_id: "uuid-123",
      feedback_type: "pattern",
      content: { rejected_ids: ["a"] },
    });
    expect(result).toEqual({
      error: "content must be { approved_ids: string[], rejected_ids: string[] } for pattern feedback",
    });
  });

  it("rejects non-object body", () => {
    const result = validateFeedbackInput(null);
    expect(result).toEqual({ error: "Request body must be a JSON object" });
  });

  it("rejects string body", () => {
    const result = validateFeedbackInput("not an object");
    expect(result).toEqual({ error: "Request body must be a JSON object" });
  });
});

describe("isPatternData", () => {
  it("returns true for valid pattern data", () => {
    expect(isPatternData({ approved_ids: ["a"], rejected_ids: ["b"] })).toBe(true);
  });

  it("returns true for pattern data with context", () => {
    expect(
      isPatternData({ approved_ids: [], rejected_ids: [], context: { key: "value" } }),
    ).toBe(true);
  });

  it("returns false for null", () => {
    expect(isPatternData(null)).toBe(false);
  });

  it("returns false for string", () => {
    expect(isPatternData("not pattern")).toBe(false);
  });

  it("returns false for object without approved_ids", () => {
    expect(isPatternData({ rejected_ids: [] })).toBe(false);
  });

  it("returns false for object without rejected_ids", () => {
    expect(isPatternData({ approved_ids: [] })).toBe(false);
  });

  it("returns false for non-array approved_ids", () => {
    expect(isPatternData({ approved_ids: "not array", rejected_ids: [] })).toBe(false);
  });
});
