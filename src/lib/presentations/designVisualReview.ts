import type { DesignLayoutDiagnostics } from '@/utils/xendingDesign/canvasRenderer';
import { correctionIsWorse, isUnmetIssue, UNMET_PREFIX } from './designFromExisting';

export interface DesignVisualReview {
  status: 'passed' | 'needs_review' | 'unavailable';
  repairs: number;
  issues: string[];
}
export interface DesignReviewSnapshot { image: string; diagnostics?: DesignLayoutDiagnostics }
export interface DesignReviewVerdict { passed: boolean; issues: string[]; feedback: string }

const REVIEW_FAILURE = 'No se pudo completar la revisión visual';
const REPAIR_FAILURE = 'No se pudo terminar la corrección automática';
export const REPAIR_DISCARDED = 'Descarté una corrección automática porque dejaba más problemas; conservé la versión anterior.';

/** Shared by automatic corrections and the user's request to correct a reviewed proposal. */
export function buildDesignRepairFeedback(issues: string[], extraFeedback = ''): string {
  return [
    'Corrige la composición de esta propuesta usando su HTML, la captura disponible y los problemas detectados.',
    'Conserva íntegro el texto aprobado, la marca, las referencias y los recursos necesarios o pedidos por el usuario. Mantén la identidad, los bytes y el src de los recursos que reutilices; puedes cambiar su posición, dimensiones y recorte para resolver la composición.',
    'Reorganiza el flujo y reserva espacio para títulos, párrafos, tarjetas y notas. Si una foto o figura tapa contenido, ajusta su tamaño y ubicación; distribuye los bloques sin superposiciones ni recortes y conserva una tipografía legible y buen contraste.',
    'Corrige las causas en la distribución y los contenedores; no ocultes texto ni te limites a cambiar el z-index. Puedes retirar adornos y contenedores ligados a contenido obsoleto, sin eliminar texto aprobado ni fotos o recursos pedidos por el usuario.',
    extraFeedback.trim() ? `INDICACIONES DE LA REVISIÓN:\n${extraFeedback.trim().slice(0, 6000)}` : '',
    issues.length ? `PROBLEMAS DETECTADOS:\n${[...new Set(issues)].map(issue => `- ${issue}`).join('\n')}` : '',
  ].filter(Boolean).join('\n').slice(0, 14000);
}

function failureMessage(prefix: string, error: unknown): string {
  const cause = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const detail = cause.trim().slice(0, 500);
  return detail ? `${prefix}: ${detail}${/[.!?]$/.test(detail) ? '' : '.'}` : `${prefix}.`;
}

/** Three rendered candidates at most: original + two repairs. Never discard a usable result on review failure. */
export async function reviewAndRepairDesign(input: {
  html: string;
  render(html: string): Promise<DesignReviewSnapshot>;
  review(html: string, snapshot: DesignReviewSnapshot): Promise<DesignReviewVerdict>;
  repair(html: string, snapshot: DesignReviewSnapshot, feedback: string): Promise<string>;
  assertCurrent(): Promise<void>;
  onProgress?(stage: 'reviewing' | 'repairing', repairs: number): void;
  /** Issues that are not a defect of this proposal (inherited empty slots), never sent to a repair. */
  ignoreIssue?(issue: string): boolean;
  ignoreDiagnostic?(issue: { code: string; element?: string; message: string }): boolean;
  /** Repair instruction; defaults to the generic composition correction. */
  feedback?(issues: string[], reviewFeedback: string): string;
  /** A repair that leaves more problems is discarded and the previous version kept. */
  discardWorse?: boolean;
  /** Automatic repairs allowed (default 2). 0 = review only: problems go to the user's «Corregir». */
  maxRepairs?: number;
}): Promise<{ html: string; visualReview: DesignVisualReview }> {
  const maxRepairs = input.maxRepairs ?? 2;
  let html = input.html, repairs = 0;
  let best = { html, visualReview: { status: 'unavailable' as DesignVisualReview['status'], repairs, issues: [] as string[] } };
  let bestScore = Infinity, previous: { score: number; issues: string[] } | null = null;
  for (;;) {
    await input.assertCurrent();
    input.onProgress?.('reviewing', repairs);
    let snapshot: DesignReviewSnapshot, verdict: DesignReviewVerdict;
    try {
      snapshot = await input.render(html);
      await input.assertCurrent();
      verdict = await input.review(html, snapshot);
      await input.assertCurrent();
    } catch (error) {
      // Authentication/target changes must still abort, even while a best-effort review fails.
      await input.assertCurrent();
      return { ...best, visualReview: { ...best.visualReview, repairs,
        status: bestScore === Infinity ? 'unavailable' : 'needs_review',
        issues: [...best.visualReview.issues.slice(0, 19), failureMessage(REVIEW_FAILURE, error)] } };
    }
    const measured = (snapshot.diagnostics?.issues ?? []).filter(issue => !input.ignoreDiagnostic?.(issue)).map(issue => issue.message);
    const incomplete = !snapshot.diagnostics || snapshot.diagnostics.truncated;
    const reviewed = verdict.issues.filter(issue => !input.ignoreIssue?.(issue));
    // Every objection was about an inherited gap: the proposal itself passes.
    const ignoredAll = !verdict.passed && verdict.issues.length > 0 && !reviewed.length && !!input.ignoreIssue;
    const issues = [...new Set([...measured, ...reviewed])].slice(0, 18);
    if (incomplete) issues.push('La comprobación geométrica del lienzo quedó incompleta.');
    if (!verdict.passed && !ignoredAll && !issues.length) issues.push(verdict.feedback || 'La revisión visual detectó cambios pendientes.');
    const passed = (verdict.passed || ignoredAll) && issues.length === 0;
    const score = measured.length * 10 + issues.length;
    if (input.discardWorse && previous && repairs > 0 && (score > previous.score || correctionIsWorse(previous.issues, issues))) {
      return { ...best, visualReview: { ...best.visualReview, repairs,
        issues: [...best.visualReview.issues.slice(0, 19), REPAIR_DISCARDED] } };
    }
    previous = { score, issues };
    if (score < bestScore) {
      bestScore = score;
      best = { html, visualReview: { status: passed ? 'passed' : 'needs_review', repairs, issues } };
    }
    if (passed) return { html, visualReview: { status: 'passed', repairs, issues: [] } };
    // Missing diagnostics require renderer upgrade, not another paid model attempt.
    if (repairs >= maxRepairs || (!measured.length && incomplete && verdict.passed)) {
      return { ...best, visualReview: { ...best.visualReview, repairs } };
    }
    const feedback = input.feedback ? input.feedback(issues, verdict.feedback) : buildDesignRepairFeedback(issues, verdict.feedback);
    input.onProgress?.('repairing', repairs + 1);
    try {
      await input.assertCurrent();
      repairs++;
      html = await input.repair(html, snapshot, feedback);
      await input.assertCurrent();
    } catch (error) {
      await input.assertCurrent();
      return { ...best, visualReview: { ...best.visualReview, repairs,
        issues: [...best.visualReview.issues.slice(0, 19), `${failureMessage(REPAIR_FAILURE, error)} Se conserva la mejor propuesta revisada.`] } };
    }
  }
}

export function describeVisualReview(review?: DesignVisualReview): string {
  if (!review || review.status === 'unavailable') return 'Aquí está la propuesta, pero la revisión automática no pudo completarse.'
    + (review?.issues.length ? ` ${review.issues[review.issues.length - 1]}` : ' Échale un ojo antes de aplicarla.');
  if (review.status === 'needs_review') {
    const notice = (issue: string) => issue.startsWith(REPAIR_FAILURE) || issue.startsWith(REVIEW_FAILURE) || issue === REPAIR_DISCARDED;
    const failure = review.issues.filter(notice).pop();
    // The request checklist: never «listo» while something the user asked for is missing.
    const unmet = review.issues.filter(isUnmetIssue).map(issue => issue.slice(UNMET_PREFIX.length).trim());
    const problems = review.issues.filter(issue => !notice(issue) && !isUnmetIssue(issue)).join(' ');
    const missing = unmet.length ? `Falta cumplir lo que pediste: ${unmet.slice(0, 4).join('; ')}.` : '';
    const summaries: string[] = [];
    if (/tapad[oa]|\btapa[n]?\b|\bcubre[n]?\b|solapa|superpon|superpuest/i.test(problems)) summaries.push('hay texto tapado o superpuesto');
    if (/ocult/i.test(problems)) summaries.push('hay texto oculto');
    if (/recort|fuera del lienzo|desbord/i.test(problems)) summaries.push('hay contenido recortado o fuera del lienzo');
    if (/contraste|ilegible|poco legible|difícil de leer/i.test(problems)) summaries.push('hay problemas de legibilidad o contraste');
    if (/no (?:se )?carg|falt[^.]*\b(?:imagen|recurso|ícono|icono)|placeholder/i.test(problems)) summaries.push('faltan recursos visuales');
    if (/vac[ií][oa]|sin contenido|espacio (?:sobrante|desaprovechado)/i.test(problems)) summaries.push('hay espacios o contenedores vacíos que ajustar');
    if (/geométrica.*incompleta/i.test(problems)) summaries.push('la comprobación de la distribución quedó incompleta');
    const found = summaries.length ? `Ojo: ${summaries.slice(0, 3).join('; ')}.` : problems || !unmet.length ? 'Ojo: la composición necesita ajustes.' : '';
    return [found, missing, failure ?? '', '¿La corrijo?'].filter(Boolean).join(' ');
  }
  return 'Revisada: no vi problemas. ¿Algo más?';
}
