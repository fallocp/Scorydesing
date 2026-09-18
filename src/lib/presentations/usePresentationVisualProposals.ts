import { useEffect, useRef, useState } from 'react';
import type { ExplorationSession, ExplorationScope, IdeaSelection } from '../../../supabase/functions/_shared/desaing/explorationContracts';
import type { DesignServerClient } from '../desaing/serverClient';
import { openVisualProposalStore } from '../desaing/visualProposalStore';
import { createVisualProposalController, type VisualProposalControllerState, type VisualProposalServerRead } from '../desaing/visualProposalController';
import { assertDesignRegion, buildPresentationImageOperation, prepareServerCapture, presentationGenerationCapabilities, type DesignRegion } from './presentationServerDesign';
import type { PresentationSlide } from './presentationDocument';
import type { DesignReference } from '../../../supabase/functions/_shared/desaing/contracts';
import type { RegisteredAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import type { ServerGenerationCapabilities } from '../../../supabase/functions/_shared/desaing/serverGenerationContract';
import { designSurfaceBrand, type DesignSurfaceDestination } from '../../../supabase/functions/_shared/desaing/designSurface';

export interface PresentationVisualProposalOptions {
  client: DesignServerClient;
  businessId: string;
  documentId: string;
  slide: PresentationSlide;
  session: ExplorationSession | null;
  capture: File | null;
  region: DesignRegion;
  scope?: ExplorationScope;
  approvedCopy?: string;
  destination?: DesignSurfaceDestination;
  productionSource?: RegisteredAssetVersion;
  productionCopyVersion?: string;
  referenceKey?: string;
  recreateReferenceId?: string;
  prepareReferences?(generation: ServerGenerationCapabilities): Promise<{ reference: DesignReference; version: RegisteredAssetVersion }[]>;
  prepareSession(): Promise<ExplorationSession>;
  onBind?(selection: IdeaSelection, operationKey: string): Promise<void>;
  simulation?: boolean;
  disabled?: boolean;
  onSnapshot?(response: VisualProposalServerRead): void;
}
const empty: VisualProposalControllerState = { sets: [], currentSet: null, views: [], busy: false, ready: false, generation: null };
const codeOf = (error: unknown) => error && typeof error === 'object' && 'code' in error ? String(error.code)
  : error instanceof Error ? error.message : '';
const messages: Record<string, string> = {
  job_quota_exceeded: 'No hay cupo para todos los borradores seleccionados. Elige menos propuestas antes de generar.',
  capture_required: 'Añade la captura de esta diapositiva antes de generar borradores.',
  visual_proposal_unresolved: 'Hay una solicitud pendiente de confirmar. Recupera sus resultados antes de generar otra.',
  visual_proposal_outcome_unknown: 'No se pudo confirmar el resultado. Recupera los borradores; no repetiremos la generación.',
  server_generation_outcome_unknown: 'No se pudo confirmar el resultado. Recupera los borradores; no repetiremos la generación.',
  visual_proposal_context_changed: 'El encargo, la captura o la diapositiva cambió. Revisa las ideas para el contexto actual.',
  exploration_context_changed: 'El encargo, la captura o la diapositiva cambió. Revisa las ideas para el contexto actual.',
  exploration_idea_version_changed: 'Esta idea tiene una versión más reciente. Selecciona la propuesta actualizada antes de generar.',
  visual_proposal_revision_conflict: 'Otra pestaña actualizó estas propuestas. Recupera la versión guardada antes de continuar.',
  visual_proposal_recovery_required: 'Recupera las propuestas guardadas antes de continuar.',
  visual_proposal_queue_stopped: 'La generación se detuvo. Conservamos los resultados y las propuestas aún sin enviar.',
  server_generation_unavailable: 'La generación está pausada. Puedes consultar las propuestas guardadas.',
  server_session_changed: 'Tu sesión cambió. Cierra y vuelve a abrir este panel.',
  design_brief_too_large: 'Esta idea supera el tamaño de encargo permitido. Simplifica sus instrucciones antes de generar.',
};
const inputKey = (options: PresentationVisualProposalOptions) => JSON.stringify([
  options.businessId, options.documentId, options.slide.id, options.slide.revision, options.slide.html,
  options.region.x, options.region.y, options.region.width, options.region.height,
  options.referenceKey, options.recreateReferenceId, options.scope, options.approvedCopy, options.destination, options.productionSource?.identity, options.productionCopyVersion,
]);
const contextKey = (session: ExplorationSession) => JSON.stringify({ ...session.context, interaction_mode: 'explore_design' });

/** The workspace supplies current context; this hook never launches images from an effect. */
export function usePresentationVisualProposals(options: PresentationVisualProposalOptions) {
  const latest = useRef(options); latest.current = options;
  const [state, setState] = useState<VisualProposalControllerState>(empty);
  const [error, setError] = useState('');
  const controller = useRef<ReturnType<typeof createVisualProposalController> | null>(null);
  const lifetime = useRef(0);
  const scope = options.session?.context.session_id;
  const actor = options.session?.context.actor_id;
  const sessionKey = options.session ? JSON.stringify(options.session.sets.map(set => [set.set_id,
    set.ideas.map(idea => [idea.idea_id, idea.version])])) : '';
  useEffect(() => {
    const token = ++lifetime.current;
    let active = true, own: ReturnType<typeof createVisualProposalController> | null = null;
    setState(empty); setError('');
    if (options.disabled || !actor || !scope) return;
    const current = () => active && lifetime.current === token;
    void (async () => {
      const store = await openVisualProposalStore({ actor_id: actor, business_id: options.businessId, session_id: scope });
      if (!current()) { store.close(); return; }
      own = createVisualProposalController({ client: options.client, store,
        generation: response => {
          const settings = presentationGenerationCapabilities(response.generation, !!latest.current.simulation, response.state);
          return latest.current.scope === 'full_design' && !settings?.supports_full_design ? null : settings;
        },
        onBind: async (selection, operationKey) => { if (!current()) throw new Error('visual_proposal_view_closed');
          await latest.current.onBind?.(selection, operationKey); },
        onChange: next => { if (current()) setState(next); },
        onSnapshot: next => { if (current()) latest.current.onSnapshot?.(next); },
        async getSource() {
          if (!current()) throw new Error('visual_proposal_view_closed');
          const value = latest.current, identity = inputKey(value), capture = value.capture;
          const session = await value.prepareSession();
          if (!current()) throw new Error('visual_proposal_view_closed');
          if (inputKey(latest.current) !== identity || latest.current.capture !== capture) throw new Error('visual_proposal_context_changed');
          const frozenSession = structuredClone(session), slide = structuredClone(value.slide), region = { ...value.region };
          return { session: frozenSession, brandId: designSurfaceBrand(value.destination), projectId: value.documentId,
            async assertCurrent() {
              if (!current()) throw new Error('visual_proposal_view_closed');
              if (inputKey(latest.current) !== identity || latest.current.capture !== capture) throw new Error('visual_proposal_context_changed');
              const fresh = await latest.current.prepareSession();
              if (contextKey(fresh) !== contextKey(frozenSession)) throw new Error('visual_proposal_context_changed');
            },
            async prepareCapture(maxReferenceEdge) {
              if (!capture) {
                if (value.scope === 'full_design' && frozenSession.context.instruction.includes('Sin captura de lienzo. La planificación inicial es textual.')) return null;
                throw new Error('capture_required');
              }
              assertDesignRegion(slide, region);
              // The exploration context hashes a 1024-edge normalized PNG. Use
              // that same normalization even when a simulation allows larger references.
              const blob = await prepareServerCapture(capture, Math.min(1024, maxReferenceEdge));
              const expected = /Identidad de la captura local: ([a-f0-9]{64})\./.exec(frozenSession.context.instruction)?.[1];
              if (!expected) throw new Error('visual_proposal_context_changed');
              const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
              const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
              if (actual !== expected) throw new Error('visual_proposal_context_changed');
              return blob;
            },
            async buildOperation(candidate, reference, generation, operationKey) {
              const additionalReferences = await value.prepareReferences?.(generation) ?? [];
              return buildPresentationImageOperation({ businessId: value.businessId, actorId: frozenSession.context.actor_id,
                documentId: value.documentId, slide, reference, region, instruction: candidate.instruction,
                operationKey, generation, interactionMode: 'explore_design', additionalReferences, recreateReferenceId: value.recreateReferenceId,
                scope: value.scope, approvedCopy: value.approvedCopy, destination: value.destination,
                productionSource: value.productionSource, productionCopyVersion: value.productionCopyVersion });
            },
          };
        },
      });
      controller.current = own;
      await own.load();
    })().catch(problem => { if (current()) setError(messages[codeOf(problem)] ?? 'No se pudieron recuperar las propuestas visuales. Intenta recuperarlas antes de generar.'); });
    return () => { active = false; if (controller.current === own) controller.current = null; own?.close(); };
  }, [options.client, options.businessId, options.documentId, options.slide.id, actor, scope, !!options.disabled]);
  // Refinements and combinations only synchronize metadata. No effect submits images.
  useEffect(() => {
    const value = controller.current;
    if (!value || state.busy) return;
    void value.load().catch(problem => setError(messages[codeOf(problem)] ?? 'Recupera las propuestas guardadas antes de continuar.'));
  }, [sessionKey]);
  async function action(run: (value: ReturnType<typeof createVisualProposalController>) => Promise<void>) {
    const value = controller.current;
    if (!value) return null;
    setError('');
    try { await run(value); return controller.current === value ? value.snapshot() : null; }
    catch (problem) { if (controller.current === value) setError(messages[codeOf(problem)] ?? 'La generación se detuvo. Conservamos los resultados; recupera su estado antes de continuar.'); return null; }
  }
  return { ...state, error: options.destination ? error.replace(/esta diapositiva/g, 'este lienzo').replace(/la diapositiva/g, 'el lienzo') : error,
    generate: (candidateIds: string[]) => action(value => value.generate(candidateIds)),
    recover: () => action(value => value.recover()),
  };
}
