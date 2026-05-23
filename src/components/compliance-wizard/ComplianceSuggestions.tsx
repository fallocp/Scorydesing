/**
 * ComplianceSuggestions — Proactive suggestions panel for the Compliance Wizard.
 *
 * Displays suggestion cards based on patterns detected in validation history.
 * Each card shows:
 * - Pattern name and occurrences count
 * - Evidence: examples of rejected content
 * - Suggested rule type and value
 * - Accept / Reject buttons
 *
 * Invokes `acceptSuggestion` / `rejectSuggestion` from the store.
 * Includes a "Buscar sugerencias" button that calls `fetchSuggestions`.
 *
 * Requirements: 7.2, 7.3, 7.4
 */

import { useState } from 'react';
import {
  Lightbulb,
  Check,
  X,
  RefreshCw,
  AlertTriangle,
  Tag,
  ShieldCheck,
  Gauge,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useComplianceWizardStore } from '@/store/complianceWizardStore';
import type { ValidationPattern } from '@/types/compliance-wizard';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getRuleTypeLabel(type: ValidationPattern['suggestedRule']['type']): string {
  switch (type) {
    case 'forbidden_term':
      return 'Término prohibido';
    case 'required_qualifier':
      return 'Calificador requerido';
    case 'max_value':
      return 'Valor máximo';
    default:
      return type;
  }
}

function getRuleTypeIcon(type: ValidationPattern['suggestedRule']['type']) {
  switch (type) {
    case 'forbidden_term':
      return <Tag className="h-3 w-3 text-destructive" />;
    case 'required_qualifier':
      return <ShieldCheck className="h-3 w-3 text-amber-500" />;
    case 'max_value':
      return <Gauge className="h-3 w-3 text-blue-500" />;
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SuggestionCard
// ─────────────────────────────────────────────────────────────────────────────

interface SuggestionCardProps {
  suggestion: ValidationPattern;
  onAccept: (pattern: string) => void;
  onReject: (pattern: string) => void;
  isProcessing: boolean;
}

function SuggestionCard({
  suggestion,
  onAccept,
  onReject,
  isProcessing,
}: SuggestionCardProps) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium leading-tight">
            {suggestion.pattern}
          </CardTitle>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {suggestion.occurrences} ocurrencias
          </Badge>
        </div>
        <CardDescription className="flex items-center gap-1 text-xs">
          {getRuleTypeIcon(suggestion.suggestedRule.type)}
          <span>{getRuleTypeLabel(suggestion.suggestedRule.type)}:</span>
          <span className="font-medium text-foreground">
            {suggestion.suggestedRule.key
              ? `${suggestion.suggestedRule.key} = ${suggestion.suggestedRule.value}`
              : suggestion.suggestedRule.value}
          </span>
        </CardDescription>
      </CardHeader>

      <CardContent className="px-4 pb-2">
        {/* Evidence: examples of rejected content */}
        {suggestion.examples.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Evidencia
            </p>
            <ul className="space-y-0.5">
              {suggestion.examples.slice(0, 3).map((example, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-1.5 text-xs text-muted-foreground"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500/70" />
                  <span className="line-clamp-2 italic">"{example}"</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <CardFooter className="gap-2 px-4 pb-3 pt-1">
        <Button
          size="sm"
          variant="default"
          className="h-7 flex-1 gap-1 text-xs"
          onClick={() => onAccept(suggestion.pattern)}
          disabled={isProcessing}
        >
          <Check className="h-3 w-3" />
          Aceptar
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 flex-1 gap-1 text-xs"
          onClick={() => onReject(suggestion.pattern)}
          disabled={isProcessing}
        >
          <X className="h-3 w-3" />
          Rechazar
        </Button>
      </CardFooter>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function ComplianceSuggestions() {
  const { suggestions, fetchSuggestions, acceptSuggestion, rejectSuggestion } =
    useComplianceWizardStore();
  const [isLoading, setIsLoading] = useState(false);
  const [processingPattern, setProcessingPattern] = useState<string | null>(null);

  const handleFetchSuggestions = async () => {
    setIsLoading(true);
    try {
      await fetchSuggestions();
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = async (pattern: string) => {
    setProcessingPattern(pattern);
    try {
      await acceptSuggestion(pattern);
    } finally {
      setProcessingPattern(null);
    }
  };

  const handleReject = async (pattern: string) => {
    setProcessingPattern(pattern);
    try {
      await rejectSuggestion(pattern);
    } finally {
      setProcessingPattern(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Lightbulb className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold text-foreground">
          Sugerencias Proactivas
        </h2>
        <Badge variant="outline" className="ml-auto text-[10px]">
          {suggestions.length}
        </Badge>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3 p-4">
          {/* Fetch suggestions button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 text-xs"
            onClick={handleFetchSuggestions}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}
            />
            {isLoading ? 'Buscando…' : 'Buscar sugerencias'}
          </Button>

          {/* Empty state */}
          {suggestions.length === 0 && !isLoading && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Lightbulb className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                No hay sugerencias disponibles.
              </p>
              <p className="text-[10px] text-muted-foreground/70">
                Las sugerencias se generan a partir de patrones recurrentes en
                tus validaciones.
              </p>
            </div>
          )}

          {/* Suggestion cards */}
          {suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.pattern}
              suggestion={suggestion}
              onAccept={handleAccept}
              onReject={handleReject}
              isProcessing={processingPattern === suggestion.pattern}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export default ComplianceSuggestions;
