/**
 * Unit tests for aggregateResults module.
 * Tests pipeline action determination, approvedPieceIndices collection,
 * validationLevel mapping, and pipelineRunId pass-through.
 *
 * Requirements: 11.3, 11.4, 11.5, 3.4, 3.5, 8.2
 */
import { describe, it, expect } from 'vitest';
import { aggregateResults } from '../aggregateResults';
import type { CombinedPieceResult } from '../types';

function makePiece(
  pieceIndex: number,
  riskLevel: 'low' | 'medium' | 'high',
): CombinedPieceResult {
  return {
    pieceIndex,
    riskLevel,
    issues: [],
    approvedVersion: {
      headline: `Headline ${pieceIndex}`,
      body: `Body ${pieceIndex}`,
      cta: `CTA ${pieceIndex}`,
      footer: `Footer ${pieceIndex}`,
    },
    finalRecommendation: 'OK',
    compliance_status: riskLevel === 'high' ? 'rejected' : 'approved',
  };
}

describe('aggregateResults', () => {
  describe('pipelineAction determination', () => {
    it('returns halt when ALL pieces have riskLevel high', () => {
      const results = [makePiece(0, 'high'), makePiece(1, 'high'), makePiece(2, 'high')];
      const response = aggregateResults(results, true);
      expect(response.pipelineAction).toBe('halt');
    });

    it('returns continue when at least one piece is not high', () => {
      const results = [makePiece(0, 'high'), makePiece(1, 'low'), makePiece(2, 'high')];
      const response = aggregateResults(results, true);
      expect(response.pipelineAction).toBe('continue');
    });

    it('returns continue when all pieces are low', () => {
      const results = [makePiece(0, 'low'), makePiece(1, 'low')];
      const response = aggregateResults(results, true);
      expect(response.pipelineAction).toBe('continue');
    });

    it('returns continue when all pieces are medium', () => {
      const results = [makePiece(0, 'medium'), makePiece(1, 'medium')];
      const response = aggregateResults(results, true);
      expect(response.pipelineAction).toBe('continue');
    });

    it('returns continue for a single piece with low risk', () => {
      const results = [makePiece(0, 'low')];
      const response = aggregateResults(results, false);
      expect(response.pipelineAction).toBe('continue');
    });

    it('returns halt for a single piece with high risk', () => {
      const results = [makePiece(0, 'high')];
      const response = aggregateResults(results, false);
      expect(response.pipelineAction).toBe('halt');
    });

    it('returns continue for mixed risk levels', () => {
      const results = [makePiece(0, 'low'), makePiece(1, 'medium'), makePiece(2, 'high')];
      const response = aggregateResults(results, true);
      expect(response.pipelineAction).toBe('continue');
    });
  });

  describe('approvedPieceIndices', () => {
    it('contains indices of pieces with compliance_status approved', () => {
      const results = [makePiece(0, 'low'), makePiece(1, 'high'), makePiece(2, 'medium')];
      const response = aggregateResults(results, true);
      expect(response.approvedPieceIndices).toEqual([0, 2]);
    });

    it('is empty when all pieces are rejected', () => {
      const results = [makePiece(0, 'high'), makePiece(1, 'high')];
      const response = aggregateResults(results, true);
      expect(response.approvedPieceIndices).toEqual([]);
    });

    it('contains all indices when all pieces are approved', () => {
      const results = [makePiece(0, 'low'), makePiece(1, 'medium'), makePiece(2, 'low')];
      const response = aggregateResults(results, true);
      expect(response.approvedPieceIndices).toEqual([0, 1, 2]);
    });

    it('uses pieceIndex from results, not array position', () => {
      const results: CombinedPieceResult[] = [
        { ...makePiece(3, 'low') },
        { ...makePiece(7, 'high') },
        { ...makePiece(5, 'medium') },
      ];
      const response = aggregateResults(results, true);
      expect(response.approvedPieceIndices).toEqual([3, 5]);
    });
  });

  describe('validationLevel', () => {
    it('returns full when claimValidationEnabled is true', () => {
      const results = [makePiece(0, 'low')];
      const response = aggregateResults(results, true);
      expect(response.validationLevel).toBe('full');
    });

    it('returns base when claimValidationEnabled is false', () => {
      const results = [makePiece(0, 'low')];
      const response = aggregateResults(results, false);
      expect(response.validationLevel).toBe('base');
    });
  });

  describe('pipelineRunId', () => {
    it('includes pipelineRunId when provided', () => {
      const results = [makePiece(0, 'low')];
      const response = aggregateResults(results, true, 'run-123');
      expect(response.pipelineRunId).toBe('run-123');
    });

    it('does not include pipelineRunId when not provided', () => {
      const results = [makePiece(0, 'low')];
      const response = aggregateResults(results, true);
      expect(response.pipelineRunId).toBeUndefined();
      expect('pipelineRunId' in response).toBe(false);
    });

    it('does not include pipelineRunId when undefined is passed explicitly', () => {
      const results = [makePiece(0, 'low')];
      const response = aggregateResults(results, true, undefined);
      expect('pipelineRunId' in response).toBe(false);
    });

    it('preserves pipelineRunId value unchanged', () => {
      const results = [makePiece(0, 'high')];
      const runId = 'pipeline-run-abc-456-def';
      const response = aggregateResults(results, false, runId);
      expect(response.pipelineRunId).toBe(runId);
    });
  });

  describe('results pass-through', () => {
    it('includes all results in the response', () => {
      const results = [makePiece(0, 'low'), makePiece(1, 'medium'), makePiece(2, 'high')];
      const response = aggregateResults(results, true);
      expect(response.results).toBe(results);
      expect(response.results).toHaveLength(3);
    });
  });
});
