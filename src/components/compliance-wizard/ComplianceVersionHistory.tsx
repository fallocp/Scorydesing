/**
 * ComplianceVersionHistory — Version history panel for compliance rules.
 *
 * Displays a list of rule versions with date, time, and change summary.
 * Each version has a "Restaurar" button that invokes `rollbackToVersion`
 * from the store to restore that version's rules snapshot.
 *
 * Requirements: 6.2, 6.3
 */

import { History, RotateCcw, FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useComplianceWizardStore } from '@/store/complianceWizardStore';
import type { RuleVersion } from '@/types/compliance-wizard';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDateTime(isoString: string): { date: string; time: string } {
  const d = new Date(isoString);
  const date = d.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return { date, time };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface VersionItemProps {
  version: RuleVersion;
  isLatest: boolean;
  onRollback: (versionId: string) => void;
  isGenerating: boolean;
}

function VersionItem({ version, isLatest, onRollback, isGenerating }: VersionItemProps) {
  const { date, time } = formatDateTime(version.created_at);

  return (
    <div className="flex items-start gap-3 rounded-md border border-border/50 bg-muted/20 p-3">
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            v{version.version_number}
          </Badge>
          {isLatest && (
            <Badge variant="secondary" className="text-[10px]">
              Actual
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {date} · {time}
        </p>
        {version.change_summary && (
          <p className="text-xs text-foreground leading-relaxed">
            {version.change_summary}
          </p>
        )}
      </div>

      {!isLatest && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => onRollback(version.id)}
          disabled={isGenerating}
          aria-label={`Restaurar versión ${version.version_number}`}
        >
          <RotateCcw className="h-3 w-3" />
          Restaurar
        </Button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function ComplianceVersionHistory() {
  const { versions, rollbackToVersion, isGenerating } =
    useComplianceWizardStore();

  // Empty state
  if (versions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <FileWarning className="h-10 w-10 text-muted-foreground/50" />
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Sin historial de versiones
          </p>
          <p className="text-xs text-muted-foreground/70">
            Las versiones aparecerán aquí cuando apruebes tus reglas de
            compliance.
          </p>
        </div>
      </div>
    );
  }

  // Sort versions descending by version_number (most recent first)
  const sortedVersions = [...versions].sort(
    (a, b) => b.version_number - a.version_number
  );

  const handleRollback = (versionId: string) => {
    rollbackToVersion(versionId);
  };

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Historial de Versiones
          </h2>
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {versions.length} {versions.length === 1 ? 'versión' : 'versiones'}
          </Badge>
        </div>

        <Separator />

        {/* Version list */}
        <div className="space-y-2">
          {sortedVersions.map((version, index) => (
            <VersionItem
              key={version.id}
              version={version}
              isLatest={index === 0}
              onRollback={handleRollback}
              isGenerating={isGenerating}
            />
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}

export default ComplianceVersionHistory;
