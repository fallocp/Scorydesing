/**
 * ComplianceStructuredPanel — Structured panel for viewing and editing
 * compliance rules in real-time alongside the chat.
 *
 * Three sections:
 * 1. Términos Prohibidos (forbidden_terms) — string[]
 * 2. Calificadores Requeridos (required_qualifiers) — string[]
 * 3. Valores Máximos (max_values) — Record<string, string>
 *
 * Each rule is editable inline and deletable with a single click.
 * New rules can be added via a button in each section.
 * Syncs in real-time with the store when rules change from chat.
 * Invokes `updateRulesFromPanel` on direct edits.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { useState, useCallback } from 'react';
import { Plus, X, Ban, ShieldCheck, Gauge, FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useComplianceWizardStore } from '@/store/complianceWizardStore';
import { ComplianceActions } from '@/components/compliance-wizard/ComplianceActions';
import type { ComplianceRules } from '@/types/compliance-wizard';

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function ComplianceStructuredPanel() {
  const { currentRules, updateRulesFromPanel } = useComplianceWizardStore();

  const handleUpdateRules = useCallback(
    (updatedRules: ComplianceRules) => {
      updateRulesFromPanel(updatedRules);
    },
    [updateRulesFromPanel]
  );

  // Empty state
  if (!currentRules) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <FileWarning className="h-10 w-10 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Sin reglas configuradas
            </p>
            <p className="text-xs text-muted-foreground/70">
              Usa el chat para generar tus reglas de compliance o espera a que la
              IA las genere.
            </p>
          </div>
        </div>
        <ComplianceActions />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-4">
          {/* Header */}
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              Reglas de Compliance
            </h2>
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {currentRules.forbidden_terms.length +
                currentRules.required_qualifiers.length +
                Object.keys(currentRules.max_values).length}{' '}
              reglas
            </Badge>
          </div>

          <Separator />

          {/* Section 1: Términos Prohibidos */}
          <StringArraySection
            title="Términos Prohibidos"
            icon={<Ban className="h-3.5 w-3.5 text-destructive" />}
            items={currentRules.forbidden_terms}
            placeholder="Nuevo término prohibido…"
            onUpdate={(items) =>
              handleUpdateRules({ ...currentRules, forbidden_terms: items })
            }
          />

          <Separator />

          {/* Section 2: Calificadores Requeridos */}
          <StringArraySection
            title="Calificadores Requeridos"
            icon={<ShieldCheck className="h-3.5 w-3.5 text-amber-500" />}
            items={currentRules.required_qualifiers}
            placeholder="Nuevo calificador requerido…"
            onUpdate={(items) =>
              handleUpdateRules({ ...currentRules, required_qualifiers: items })
            }
          />

          <Separator />

          {/* Section 3: Valores Máximos */}
          <MaxValuesSection
            title="Valores Máximos"
            icon={<Gauge className="h-3.5 w-3.5 text-blue-500" />}
            items={currentRules.max_values}
            onUpdate={(items) =>
              handleUpdateRules({ ...currentRules, max_values: items })
            }
          />
        </div>
      </ScrollArea>
      <ComplianceActions />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StringArraySection — For forbidden_terms and required_qualifiers
// ─────────────────────────────────────────────────────────────────────────────

interface StringArraySectionProps {
  title: string;
  icon: React.ReactNode;
  items: string[];
  placeholder: string;
  onUpdate: (items: string[]) => void;
}

function StringArraySection({
  title,
  icon,
  items,
  placeholder,
  onUpdate,
}: StringArraySectionProps) {
  const [newValue, setNewValue] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleAdd = () => {
    const trimmed = newValue.trim();
    if (!trimmed) return;
    onUpdate([...items, trimmed]);
    setNewValue('');
  };

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleRemove = (index: number) => {
    onUpdate(items.filter((_, i) => i !== index));
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditValue(items[index]);
  };

  const handleConfirmEdit = () => {
    if (editingIndex === null) return;
    const trimmed = editValue.trim();
    if (!trimmed) {
      // If empty, remove the item
      handleRemove(editingIndex);
    } else {
      const updated = [...items];
      updated[editingIndex] = trimmed;
      onUpdate(updated);
    }
    setEditingIndex(null);
    setEditValue('');
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirmEdit();
    } else if (e.key === 'Escape') {
      setEditingIndex(null);
      setEditValue('');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium text-foreground">{title}</span>
        <Badge variant="outline" className="ml-auto text-[10px]">
          {items.length}
        </Badge>
      </div>

      {/* Items list */}
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, index) =>
          editingIndex === index ? (
            <Input
              key={index}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleConfirmEdit}
              onKeyDown={handleEditKeyDown}
              className="h-7 w-48 text-xs"
              autoFocus
            />
          ) : (
            <Badge
              key={index}
              variant="secondary"
              className="cursor-pointer gap-1 pr-1 text-xs hover:bg-secondary/60"
              onClick={() => handleStartEdit(index)}
            >
              <span>{item}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(index);
                }}
                className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive"
                aria-label={`Eliminar "${item}"`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )
        )}
      </div>

      {/* Add new item */}
      <div className="flex gap-1.5">
        <Input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={handleAddKeyDown}
          placeholder={placeholder}
          className="h-7 flex-1 text-xs"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleAdd}
          disabled={!newValue.trim()}
          aria-label={`Agregar a ${title}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MaxValuesSection — For max_values (key-value pairs)
// ─────────────────────────────────────────────────────────────────────────────

interface MaxValuesSectionProps {
  title: string;
  icon: React.ReactNode;
  items: Record<string, string>;
  onUpdate: (items: Record<string, string>) => void;
}

function MaxValuesSection({
  title,
  icon,
  items,
  onUpdate,
}: MaxValuesSectionProps) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editKeyValue, setEditKeyValue] = useState('');
  const [editValueValue, setEditValueValue] = useState('');

  const entries = Object.entries(items);

  const handleAdd = () => {
    const trimmedKey = newKey.trim();
    const trimmedValue = newValue.trim();
    if (!trimmedKey || !trimmedValue) return;
    onUpdate({ ...items, [trimmedKey]: trimmedValue });
    setNewKey('');
    setNewValue('');
  };

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleRemove = (key: string) => {
    const updated = { ...items };
    delete updated[key];
    onUpdate(updated);
  };

  const handleStartEdit = (key: string) => {
    setEditingKey(key);
    setEditKeyValue(key);
    setEditValueValue(items[key]);
  };

  const handleConfirmEdit = () => {
    if (editingKey === null) return;
    const trimmedKey = editKeyValue.trim();
    const trimmedValue = editValueValue.trim();

    if (!trimmedKey || !trimmedValue) {
      // If either is empty, remove the entry
      handleRemove(editingKey);
    } else {
      const updated = { ...items };
      // If key changed, remove old key
      if (editingKey !== trimmedKey) {
        delete updated[editingKey];
      }
      updated[trimmedKey] = trimmedValue;
      onUpdate(updated);
    }
    setEditingKey(null);
    setEditKeyValue('');
    setEditValueValue('');
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirmEdit();
    } else if (e.key === 'Escape') {
      setEditingKey(null);
      setEditKeyValue('');
      setEditValueValue('');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium text-foreground">{title}</span>
        <Badge variant="outline" className="ml-auto text-[10px]">
          {entries.length}
        </Badge>
      </div>

      {/* Items list */}
      <div className="space-y-1.5">
        {entries.map(([key, value]) =>
          editingKey === key ? (
            <div key={key} className="flex gap-1.5">
              <Input
                value={editKeyValue}
                onChange={(e) => setEditKeyValue(e.target.value)}
                onKeyDown={handleEditKeyDown}
                className="h-7 flex-1 text-xs"
                placeholder="Clave"
                autoFocus
              />
              <Input
                value={editValueValue}
                onChange={(e) => setEditValueValue(e.target.value)}
                onBlur={handleConfirmEdit}
                onKeyDown={handleEditKeyDown}
                className="h-7 w-24 text-xs"
                placeholder="Valor"
              />
            </div>
          ) : (
            <div
              key={key}
              className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-xs cursor-pointer hover:bg-muted/50"
              onClick={() => handleStartEdit(key)}
            >
              <span className="font-medium text-foreground">{key}</span>
              <span className="text-muted-foreground">=</span>
              <span className="text-foreground">{value}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(key);
                }}
                className="ml-auto rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive"
                aria-label={`Eliminar "${key}"`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )
        )}
      </div>

      {/* Add new key-value pair */}
      <div className="flex gap-1.5">
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={handleAddKeyDown}
          placeholder="Clave (ej: tasa_maxima)"
          className="h-7 flex-1 text-xs"
        />
        <Input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={handleAddKeyDown}
          placeholder="Valor (ej: 18%)"
          className="h-7 w-24 text-xs"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleAdd}
          disabled={!newKey.trim() || !newValue.trim()}
          aria-label={`Agregar a ${title}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default ComplianceStructuredPanel;
