/**
 * Pure function hook wrapping the assembleTemplate utility.
 * Takes template, content, brand, partner, promoter and returns assembled HTML string.
 * Uses useCallback for memoization.
 */

import { useCallback } from 'react';
import {
  assembleTemplate,
  type AssembleTemplateParams,
} from '@/utils/xendingDesign/templateAssembler';

/**
 * Returns a memoized assemble function that delegates to the pure assembleTemplate utility.
 * Components call the returned function with template params to get assembled HTML.
 */
export function useTemplateAssembler() {
  const assemble = useCallback(
    (params: AssembleTemplateParams): string => assembleTemplate(params),
    []
  );

  return { assemble };
}
