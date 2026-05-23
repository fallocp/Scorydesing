/**
 * Unit tests for Question Engine
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */
import { describe, it, expect } from 'vitest';
import {
  COMPLIANCE_GUIDED_QUESTIONS,
  getNextQuestion,
  areQuestionsComplete,
  extractAnswersFromHistory,
} from '../questionEngine';

describe('COMPLIANCE_GUIDED_QUESTIONS', () => {
  it('should have exactly 3 questions', () => {
    expect(COMPLIANCE_GUIDED_QUESTIONS).toHaveLength(3);
  });

  it('should have questions for industry, regulator, and restrictions', () => {
    const ids = COMPLIANCE_GUIDED_QUESTIONS.map((q) => q.id);
    expect(ids).toContain('industry');
    expect(ids).toContain('regulator');
    expect(ids).toContain('restrictions');
  });

  it('should have sequential order values', () => {
    const orders = COMPLIANCE_GUIDED_QUESTIONS.map((q) => q.order).sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3]);
  });
});

describe('getNextQuestion', () => {
  it('should return the first question when no answers exist', () => {
    const result = getNextQuestion({});
    expect(result).not.toBeNull();
    expect(result!.id).toBe('industry');
    expect(result!.order).toBe(1);
  });

  it('should return the second question when only industry is answered', () => {
    const result = getNextQuestion({ industry: 'fintech' });
    expect(result).not.toBeNull();
    expect(result!.id).toBe('regulator');
  });

  it('should return the third question when industry and regulator are answered', () => {
    const result = getNextQuestion({ industry: 'fintech', regulator: 'CNBV' });
    expect(result).not.toBeNull();
    expect(result!.id).toBe('restrictions');
  });

  it('should return null when all questions are answered', () => {
    const result = getNextQuestion({
      industry: 'fintech',
      regulator: 'CNBV',
      restrictions: 'rendimiento garantizado',
    });
    expect(result).toBeNull();
  });

  it('should respect order regardless of answer insertion order', () => {
    // If regulator is answered but industry is not, should return industry first
    const result = getNextQuestion({ regulator: 'CNBV' });
    expect(result).not.toBeNull();
    expect(result!.id).toBe('industry');
  });

  it('should work with custom questions array', () => {
    const customQuestions = [
      { id: 'q1', text: 'Question 1', context: 'ctx1', order: 2 },
      { id: 'q2', text: 'Question 2', context: 'ctx2', order: 1 },
    ];
    const result = getNextQuestion({}, customQuestions);
    expect(result!.id).toBe('q2'); // order 1 comes first
  });
});

describe('areQuestionsComplete', () => {
  it('should return false when no answers exist', () => {
    expect(areQuestionsComplete({})).toBe(false);
  });

  it('should return false when only some answers exist', () => {
    expect(areQuestionsComplete({ industry: 'fintech' })).toBe(false);
    expect(areQuestionsComplete({ industry: 'fintech', regulator: 'CNBV' })).toBe(false);
  });

  it('should return true when all questions are answered', () => {
    expect(
      areQuestionsComplete({
        industry: 'fintech',
        regulator: 'CNBV',
        restrictions: 'rendimiento garantizado',
      }),
    ).toBe(true);
  });

  it('should return true even with extra answers beyond the questions', () => {
    expect(
      areQuestionsComplete({
        industry: 'fintech',
        regulator: 'CNBV',
        restrictions: 'none',
        extra_field: 'extra',
      }),
    ).toBe(true);
  });
});

describe('extractAnswersFromHistory', () => {
  it('should return empty object for empty history', () => {
    expect(extractAnswersFromHistory([])).toEqual({});
  });

  it('should extract answer from a question-answer pair', () => {
    const messages = [
      {
        role: 'assistant' as const,
        content: '¿En qué industria opera tu negocio?',
        metadata: { type: 'question', question_id: 'industry' },
      },
      {
        role: 'user' as const,
        content: 'Fintech',
      },
    ];
    const answers = extractAnswersFromHistory(messages);
    expect(answers).toEqual({ industry: 'Fintech' });
  });

  it('should extract multiple answers from sequential Q&A pairs', () => {
    const messages = [
      {
        role: 'assistant' as const,
        content: '¿En qué industria opera tu negocio?',
        metadata: { type: 'question', question_id: 'industry' },
      },
      {
        role: 'user' as const,
        content: 'Fintech',
      },
      {
        role: 'assistant' as const,
        content: '¿Qué regulador aplica?',
        metadata: { type: 'question', question_id: 'regulator' },
      },
      {
        role: 'user' as const,
        content: 'CNBV',
      },
    ];
    const answers = extractAnswersFromHistory(messages);
    expect(answers).toEqual({ industry: 'Fintech', regulator: 'CNBV' });
  });

  it('should ignore assistant messages without question metadata', () => {
    const messages = [
      {
        role: 'assistant' as const,
        content: 'Bienvenido al wizard',
        metadata: { type: 'rules_generated' },
      },
      {
        role: 'user' as const,
        content: 'Hola',
      },
    ];
    const answers = extractAnswersFromHistory(messages);
    expect(answers).toEqual({});
  });

  it('should not extract answer if no user message follows the question', () => {
    const messages = [
      {
        role: 'assistant' as const,
        content: '¿En qué industria opera tu negocio?',
        metadata: { type: 'question', question_id: 'industry' },
      },
    ];
    const answers = extractAnswersFromHistory(messages);
    expect(answers).toEqual({});
  });
});
