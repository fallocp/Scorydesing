import { useState } from 'react';
import { VisualDesignEditor } from '@/components/VisualDesignEditor';
import { EditorBrandPanel } from '@/components/desaing/EditorBrandPanel';
import type { PresentationDesignService } from '@/components/presentations/PresentationDesignContext';
import type { FreeDesignDocument } from '@/lib/desaing/freeDesignDocument';
import { saveVersionDocument } from '@/lib/create-edit/openInEditor';
import { describeDesignError } from '@/lib/create-edit/useCreateDesign';
import './create-design.css';

/**
 * The existing Editor Visual over Crear y editar, on the saved document of one version, with the brand tools of
 * Montar marca. Aplicar saves and keeps editing; Guardar saves and returns; a failed save stays open with the reason.
 */
export function CreateDesignEditor({ service, businessId, document, onClose }: {
  service: PresentationDesignService; businessId: string; document: FreeDesignDocument; onClose(saved: FreeDesignDocument): void;
}) {
  const [saved, setSaved] = useState(document);
  const [html, setHtml] = useState(document.canvas.html);
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  async function save(next: string, close: boolean) {
    if (saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await saveVersionDocument(service, businessId, { documentId: saved.id, expectedRevision: saved.canvas.revision, html: next });
      // Keep the editor's own serialization as its document so it does not reload after saving.
      setSaved(result); setHtml(next);
      if (close) onClose(result); else setNotice('Cambios guardados.');
    } catch (problem) { setError(describeDesignError(problem)); }
    finally { setSaving(false); }
  }
  return <div className="ced-editor" role="dialog" aria-modal="true" aria-label="Editor del diseño">
    <VisualDesignEditor html={html} pieceIndex={0} dimensions={{ width: saved.width, height: saved.height }} editableElements={[]} businessId={businessId}
      onApply={next => void save(next, false)} onSave={next => void save(next, true)} onCancel={() => onClose(saved)} />
    <EditorBrandPanel html={html} width={saved.width} height={saved.height} onChange={setHtml} />
    {(saving || error || notice) && <p className={error ? 'ced-editor-status ced-editor-error' : 'ced-editor-status'} role={error ? 'alert' : 'status'}>
      {saving ? 'Guardando…' : error || notice}</p>}
  </div>;
}
