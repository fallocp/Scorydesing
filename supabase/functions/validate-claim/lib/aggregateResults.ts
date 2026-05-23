/**
 * Result Aggregator Module
 *
 * Aggregates combined results from all pieces and determines the pipeline action.
 *
 * Rules:
 * 1. pipelineAction: 'halt' if ALL pieces have riskLevel 'high'
 * 2. pipelineAction: 'continue' if at least one piece has riskLevel different from 'high'
 * 3. approvedPieceIndices contains pieceIndex values of pieces with compliance_status 'approved'
 * 4. validationLevel: 'full' if claimValidationEnabled is true, 'base' if false
 * 5. pipelineRunId is included only if provided (not undefined)
 */

import type { CombinedPieceResult, ValidateClaimResponse } from "./types.ts";

/**
 * Aggregates individual piece results into the final ValidateClaimResponse.
 */
export function aggregateResults(
  results: CombinedPieceResult[],
  claimValidationEnabled: boolean,
  pipelineRunId?: string,
): ValidateClaimResponse {
  // 1 & 2: Determine pipeline action
  const allHigh = results.length > 0 &&
    results.every((r) => r.riskLevel === "high");
  const pipelineAction: "halt" | "continue" = allHigh ? "halt" : "continue";

  // 3: Collect indices of approved pieces
  const approvedPieceIndices: number[] = results
    .filter((r) => r.compliance_status === "approved")
    .map((r) => r.pieceIndex);

  // 4: Determine validation level
  const validationLevel: "base" | "full" = claimValidationEnabled
    ? "full"
    : "base";

  // 5: Build response, including pipelineRunId only if provided
  const response: ValidateClaimResponse = {
    results,
    pipelineAction,
    approvedPieceIndices,
    validationLevel,
  };

  if (pipelineRunId !== undefined) {
    response.pipelineRunId = pipelineRunId;
  }

  return response;
}
