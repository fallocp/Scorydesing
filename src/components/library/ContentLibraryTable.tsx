/**
 * ContentLibraryTable — Table/list of content pieces with status badges and actions.
 *
 * Each row shows: status badge (colored), rama × ángulo, funnel stage badge,
 * headline (truncated), date, and actions (Continuar pipeline, Asignar a calendario).
 *
 * Requirements: 8.7
 */

import { useNavigate } from 'react-router-dom';
import { Play, CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ContentPiece {
  id: string;
  piece_data: {
    headline?: string;
    body?: string;
    angle?: string;
    narrativeAngle?: string;
    [key: string]: unknown;
  };
  funnel_stage: string;
  status: string;
  created_at: string;
}

interface ContentLibraryTableProps {
  pieces: ContentPiece[];
  isLoading?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { emoji: string; label: string; className: string }> = {
  generated: { emoji: '🟡', label: 'Generada', className: 'bg-yellow-100 text-yellow-800' },
  approved: { emoji: '🔵', label: 'Aprobada', className: 'bg-blue-100 text-blue-800' },
  image_selected: { emoji: '🟠', label: 'Con imagen', className: 'bg-orange-100 text-orange-800' },
  channels_adapted: { emoji: '🟣', label: 'Canales adaptados', className: 'bg-purple-100 text-purple-800' },
  html_assembled: { emoji: '⚪', label: 'HTML ensamblado', className: 'bg-gray-100 text-gray-800' },
  rendered: { emoji: '⚪', label: 'Renderizada', className: 'bg-gray-100 text-gray-800' },
  scheduled: { emoji: '📅', label: 'Programada', className: 'bg-indigo-100 text-indigo-800' },
  published: { emoji: '🟢', label: 'Publicada', className: 'bg-green-100 text-green-800' },
};

const FUNNEL_BADGE: Record<string, { label: string; className: string }> = {
  atraccion: { label: 'ATR', className: 'bg-green-100 text-green-800' },
  conexion: { label: 'CON', className: 'bg-blue-100 text-blue-800' },
  conversion: { label: 'CVR', className: 'bg-red-100 text-red-800' },
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '…';
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ContentLibraryTable({ pieces, isLoading }: ContentLibraryTableProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        Cargando piezas…
      </div>
    );
  }

  if (pieces.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        No hay piezas que coincidan con los filtros
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[140px]">Status</TableHead>
          <TableHead>Rama × Ángulo</TableHead>
          <TableHead className="w-[80px]">Funnel</TableHead>
          <TableHead>Headline</TableHead>
          <TableHead className="w-[100px]">Fecha</TableHead>
          <TableHead className="w-[200px] text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pieces.map((piece) => {
          const statusCfg = STATUS_CONFIG[piece.status] ?? {
            emoji: '❓',
            label: piece.status,
            className: 'bg-gray-100 text-gray-800',
          };
          const funnelCfg = FUNNEL_BADGE[piece.funnel_stage];
          const headline = piece.piece_data?.headline ?? '(sin headline)';
          const angle = piece.piece_data?.angle ?? '';
          const narrativeAngle = piece.piece_data?.narrativeAngle ?? '';

          return (
            <TableRow key={piece.id}>
              {/* Status */}
              <TableCell>
                <Badge variant="secondary" className={`text-xs ${statusCfg.className}`}>
                  {statusCfg.emoji} {statusCfg.label}
                </Badge>
              </TableCell>

              {/* Rama × Ángulo */}
              <TableCell className="text-sm">
                <span className="font-medium">{angle}</span>
                {narrativeAngle && (
                  <span className="text-muted-foreground"> × {narrativeAngle}</span>
                )}
              </TableCell>

              {/* Funnel stage */}
              <TableCell>
                {funnelCfg && (
                  <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${funnelCfg.className}`}>
                    {funnelCfg.label}
                  </Badge>
                )}
              </TableCell>

              {/* Headline */}
              <TableCell className="text-sm max-w-[250px]">
                {truncate(headline, 60)}
              </TableCell>

              {/* Date */}
              <TableCell className="text-xs text-muted-foreground">
                {formatDate(piece.created_at)}
              </TableCell>

              {/* Actions */}
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      const stepMap: Record<string, number> = {
                        approved: 3,
                        image_selected: 4,
                        channels_adapted: 5,
                        generated: 2,
                      };
                      const step = stepMap[piece.status] ?? 2;
                      navigate(`/xending-design/pipeline?resumeFrom=${piece.id}&step=${step}`);
                    }}
                  >
                    <Play className="h-3 w-3 mr-1" />
                    Continuar pipeline
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() =>
                      navigate(`/xending-design/calendar?assignPiece=${piece.id}&funnelStage=${piece.funnel_stage}`)
                    }
                  >
                    <CalendarPlus className="h-3 w-3 mr-1" />
                    Calendario
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
