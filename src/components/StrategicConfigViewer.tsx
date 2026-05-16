/**
 * StrategicConfigViewer — Read-only panel showing a branch's full
 * strategic configuration.
 *
 * Displays: objetivo, insight, dolor, promesa, audiencia, claims,
 * CTAs, footers, and visual guide.
 *
 * Requirements: 3.2, 3.6
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { StrategicConfig } from '@/types/xendingDesign';

interface StrategicConfigViewerProps {
  /** The branch name for the header */
  branchName: string;
  /** The strategic config to display */
  config: StrategicConfig;
}

export function StrategicConfigViewer({
  branchName,
  config,
}: StrategicConfigViewerProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Configuración Estratégica — {branchName}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Objetivo */}
        <ConfigSection label="🎯 Objetivo" content={config.objetivo} />

        {/* Insight */}
        <ConfigSection label="💡 Insight" content={config.insight} />

        {/* Dolor */}
        <ConfigSection label="😣 Dolor" content={config.dolor} />

        {/* Promesa */}
        <ConfigSection label="✨ Promesa" content={config.promesa} />

        {/* Audiencia */}
        <ConfigSection label="👥 Audiencia" content={config.audiencia} />

        <Separator />

        {/* Ángulos */}
        <TagSection label="📐 Ángulos" items={config.angulos} />

        {/* Claims permitidos */}
        <TagSection
          label="✅ Claims Permitidos"
          items={config.claims_permitidos}
          variant="success"
        />

        {/* Claims prohibidos */}
        <TagSection
          label="🚫 Claims Prohibidos"
          items={config.claims_prohibidos}
          variant="destructive"
        />

        <Separator />

        {/* CTAs */}
        <TagSection label="🔗 CTAs" items={config.ctas} variant="cta" />

        {/* Footers */}
        {config.footers.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">
              📝 Footers
            </p>
            {config.footers.map((footer, i) => (
              <p key={i} className="text-xs text-muted-foreground italic">
                {footer}
              </p>
            ))}
          </div>
        )}

        {/* Guía visual */}
        {config.guia_visual && (
          <ConfigSection label="🎨 Guía Visual" content={config.guia_visual} />
        )}
      </CardContent>
    </Card>
  );
}

function ConfigSection({
  label,
  content,
}: {
  label: string;
  content: string;
}) {
  if (!content) return null;

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{content}</p>
    </div>
  );
}

function TagSection({
  label,
  items,
  variant = 'default',
}: {
  label: string;
  items: string[];
  variant?: 'default' | 'success' | 'destructive' | 'cta';
}) {
  if (!items || items.length === 0) return null;

  const badgeClass = {
    default: '',
    success:
      'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
    destructive:
      'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    cta: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  }[variant];

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge
            key={item}
            variant="outline"
            className={`text-[11px] px-2 py-0.5 font-normal ${badgeClass}`}
          >
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}
