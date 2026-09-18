import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DesaingLab } from './components/desaing/DesaingLab';
import { LAB_BUSINESS, LAB_POLICY, LabRuntime } from './lib/desaing/labRuntime';
import { drawLabImage, openLabBlobStore } from './lib/desaing/labImages';
import { openBrowserDesignStore } from './lib/desaing/localDesignStore';
import type { LabActions, LabViewModel } from './lib/desaing/labTypes';

function LabApp() {
  const runtime = useRef<LabRuntime | null>(null);
  const locked = useRef(false);
  const [model, setModel] = useState<LabViewModel | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    async function start() {
      try {
        const lab = new LabRuntime({ store: openBrowserDesignStore(LAB_BUSINESS, LAB_POLICY),
          blobs: openLabBlobStore(), draw: drawLabImage });
        runtime.current = lab;
        await lab.initialize();
        const next = await lab.view();
        if (active) setModel(next);
      } catch (error) { if (active) setStartupError(message(error)); }
    }
    void start();
    return () => { active = false; };
  }, []);

  async function run(action: (lab: LabRuntime) => Promise<unknown>, notice?: string, rejectOnFailure = false) {
    if (locked.current || !runtime.current) {
      if (rejectOnFailure) throw new Error('Hay otra operación en curso.');
      return;
    }
    locked.current = true;
    setModel(current => current ? { ...current, busy: true, error: null, notice: null } : current);
    let failure: string | null = null;
    try { await action(runtime.current); }
    catch (error) { failure = message(error); }
    try { setModel({ ...await runtime.current.view(), error: failure, notice: failure ? null : notice ?? null }); }
    catch (error) { setModel(current => current ? { ...current, busy: false, error: message(error) } : current); }
    finally { locked.current = false; }
    if (failure && rejectOnFailure) throw new Error(failure);
  }

  const actions: LabActions = {
    onWorkspace: workspace => run(lab => lab.configure({ workspace })),
    onMode: mode => run(lab => lab.configure({ mode })),
    onPrompt: prompt => run(lab => lab.configure({ prompt }), undefined, true),
    onFormat: format => run(lab => lab.setFormat(format), 'Nuevo lienzo preparado. Las imágenes anteriores siguen disponibles.'),
    onGenerate: (count, scenario) => run(async lab => { const job = await lab.createJob(count); await lab.runJob(job, scenario); }, 'Simulación guardada. Revisa los resultados.'),
    onSelect: id => run(lab => lab.select(id)),
    onApproveDirection: id => run(lab => lab.approveDirection(id), 'Dirección aprobada. Esta acción no crea imágenes.'),
    onMedium: id => run(async lab => { const job = await lab.createMediumJob(id); await lab.runJob(job); }, 'Versión media de muestra lista para revisar.'),
    onApproveResult: id => run(lab => lab.approveResult(id), 'Resultado aprobado para colocarlo en el documento.'),
    onMount: id => {
      const expected = { document_id: model!.composition.documentId, revision: model!.composition.revision };
      return run(lab => lab.mount(id, expected), 'Imagen colocada. El texto sigue siendo editable.');
    },
    onCancel: id => run(lab => lab.cancel(id), 'Se cancelaron los pendientes. Los intentos iniciados conservan su estado.'),
    onContinue: id => run(lab => lab.runJob(id), 'Se procesaron únicamente los candidatos pendientes.'),
    onRecover: () => run(lab => lab.recover(), 'Estado recuperado. No se repitieron llamadas inciertas.'),
    onCompositionChange: patch => {
      const expected = { document_id: model!.composition.documentId, revision: model!.composition.revision };
      return run(lab => lab.editComposition(patch, expected), 'Composición guardada sin generar otra imagen.');
    },
    onExportHtml: () => run(async lab => {
      const html = await lab.exportHtml();
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'desaing-composicion.html'; document.body.append(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }, 'HTML exportado con las imágenes incluidas.'),
  };
  if (startupError) return <main style={{ padding: 48, fontFamily: 'system-ui' }}><h1>Laboratorio DesAIng</h1>
    <p role="alert">{startupError}</p><p>El estado guardado se conserva. Usa un navegador con almacenamiento local habilitado.</p>
    <button onClick={() => location.reload()}>Volver a abrir</button></main>;
  if (!model) return <p style={{ padding: 48, fontFamily: 'system-ui' }}>Abriendo el laboratorio local…</p>;
  return <DesaingLab model={model} actions={actions} />;
}

function message(error: unknown): string {
  const value = error instanceof Error ? error.message : 'No se pudo completar la operación.';
  const known: Record<string, string> = {
    job_quota_exceeded: 'Se alcanzó el límite de imágenes de esta sesión de prueba.',
    invalid_image_job: 'Escribe una instrucción y revisa los parámetros del borrador.',
    local_policy_mismatch: 'La configuración del laboratorio cambió. El historial se conserva y necesita revisión.',
    local_transaction_support_unavailable: 'Este navegador no permite las transacciones locales necesarias.',
  };
  return known[value] ?? (/^[a-z_]+$/.test(value) ? 'No se pudo guardar el cambio. Recupera el estado y revisa el resultado.' : value);
}

createRoot(document.getElementById('root')!).render(<LabApp />);
