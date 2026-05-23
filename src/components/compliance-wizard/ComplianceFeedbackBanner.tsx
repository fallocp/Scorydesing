/**
 * ComplianceFeedbackBanner — Proactive feedback banner shown in the wizard
 * when there are recent validation issues or pending disputes.
 *
 * Shows a friendly, non-technical summary like:
 * "Desde tu última visita: 5 rechazos de alto riesgo, 2 disputas pendientes.
 *  ¿Quieres ajustar algo?"
 *
 * The user can click to start iterating on their rules directly from the banner.
 */

import { AlertTriangle, MessageSquare, X } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useComplianceWizardStore } from '@/store/complianceWizardStore';

export function ComplianceFeedbackBanner() {
  const { feedbackHint, feedbackStats, sendMessage } = useComplianceWizardStore();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !feedbackHint) return null;

  const hasIssues = feedbackStats && (feedbackStats.high_risk > 0 || feedbackStats.pending_disputes > 0);

  return (
    <Alert
      className="relative mx-4 mt-3 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
    >
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-sm font-medium text-amber-900 dark:text-amber-200">
        Retroalimentación de tus reglas
      </AlertTitle>
      <AlertDescription className="mt-1 text-xs text-amber-800 dark:text-amber-300">
        {feedbackHint}
      </AlertDescription>

      {hasIssues && feedbackStats.top_reasons.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {feedbackStats.top_reasons.slice(0, 3).map((r) => (
            <span
              key={r.reason}
              className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
            >
              {r.reason} ({r.count}x)
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="default"
          className="h-7 gap-1.5 text-xs"
          onClick={() => {
            sendMessage('Quiero ajustar mis reglas basándome en los rechazos recientes. ¿Qué me recomiendas?');
            setDismissed(true);
          }}
        >
          <MessageSquare className="h-3 w-3" />
          Ajustar reglas
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-amber-700 hover:text-amber-900"
          onClick={() => setDismissed(true)}
        >
          Ahora no
        </Button>
      </div>

      <button
        type="button"
        className="absolute right-2 top-2 rounded-full p-0.5 text-amber-600 hover:bg-amber-200/50"
        onClick={() => setDismissed(true)}
        aria-label="Cerrar"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </Alert>
  );
}

export default ComplianceFeedbackBanner;
