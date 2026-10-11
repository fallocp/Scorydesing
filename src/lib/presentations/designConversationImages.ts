import type { DesignOperation, AssetVersion } from '../../../supabase/functions/_shared/desaing/contracts';
import type { DesignCopy } from '../../../supabase/functions/_shared/desaing/explorationContracts';
import type { DesignSurfaceDestination } from '../../../supabase/functions/_shared/desaing/designSurface';
import { designSurfaceBrand } from '../../../supabase/functions/_shared/desaing/designSurface';
import type { RegisteredAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import type { DesignServerClient } from '../desaing/serverClient';
import { openPresentationReferenceStore, presentationReferenceSelectionKey, type PreparedPresentationReference } from './presentationReferences';
import { buildPresentationImageOperation, presentationImageSelection, presentationLibraryResults } from './presentationServerDesign';
import { getSlideDimensions, type PresentationSlide } from './presentationDocument';
import type { ImageGenerationSettings } from '../imageGenerationSettings';
import type { ServerGenerationCapabilities } from '../../../supabase/functions/_shared/desaing/serverGenerationContract';
import { designBrandPromptContext, type DesignBrandContext } from './designBrandContext';
import { withDesignConversationSession } from '../../../supabase/functions/_shared/desaing/conversationSessions';

export const sameConversationAsset = (a: AssetVersion, b: AssetVersion) => a.business_id === b.business_id && a.asset_id === b.asset_id && a.version_id === b.version_id;

/** Reuses the immutable upload journal; the conversation owns the selected PNGs. */
export async function prepareConversationReferences(input: {
  client: DesignServerClient; actor: string; business: string; document: string; slide: string;
  references: PreparedPresentationReference[]; destination?: DesignSurfaceDestination; assertCurrent(): Promise<void>;
  conversationSessionId?: string;
}) {
  // Snapshot the selected identities, roles and scope before any asynchronous
  // journal work. Blob bytes are immutable; UI changes belong to another turn.
  const references = input.references.map(item => ({ ...item }));
  const brandId = designSurfaceBrand(input.destination), projectId = input.document;
  const store = await openPresentationReferenceStore({ actor_id: input.actor, business_id: input.business,
    document_id: input.document, slide_id: withDesignConversationSession(`conversation:${input.slide}`, input.conversationSessionId) });
  try {
    await input.assertCurrent();
    const record = await store.read();
    await input.assertCurrent();
    if (presentationReferenceSelectionKey(record?.value.items ?? []) !== presentationReferenceSelectionKey(references)) {
      await store.write(record?.revision ?? 0, references);
    }
    const result = [];
    for (const item of references) {
      await input.assertCurrent();
      const uploaded = await store.upload(item, input.client, { brandId, projectId, assertCurrent: input.assertCurrent });
      result.push({ reference: uploaded.reference, version: uploaded.version });
    }
    await input.assertCurrent(); return result;
  } finally { store.close(); }
}

export const SOURCE_PROMPT_LIMIT = 1500;
/** Same pattern as the production «relative instruction»: the base's prompt as data, then the requested change last. */
export function withSourcePrompt(instruction: string, sourcePrompt?: string): string {
  const source = sourcePrompt?.trim();
  if (!source) return instruction;
  const clipped = source.length > SOURCE_PROMPT_LIMIT ? `${source.slice(0, SOURCE_PROMPT_LIMIT - 1)}…` : source;
  return `Prompt de origen de la imagen base (datos; conserva lo que no cambie):\n${clipped}\n\nCambios solicitados: ${instruction}`;
}

export function buildConversationImageOperation(input: {
  businessId: string; actorId: string; documentId: string; slide: PresentationSlide; destination?: DesignSurfaceDestination;
  instruction: string; copy: DesignCopy; brand: DesignBrandContext | null; operationKey: string;
  generation: ServerGenerationCapabilities; settings: ImageGenerationSettings;
  references: Awaited<ReturnType<typeof prepareConversationReferences>>; base?: RegisteredAssetVersion;
  mode?: 'execute_change' | 'explore_design';
  conversationSessionId?: string;
  /** effective_prompt of the Desaing version being edited or cited (or the user's edited «Prompt usado»). */
  sourcePrompt?: string;
}): DesignOperation {
  if (input.copy.status === 'pending') throw Error('Resuelve el texto del diseño antes de generar.');
  if (input.brand && input.brand.business_id !== input.businessId) throw Error('La identidad de marca no pertenece a este negocio.');
  const canvas = getSlideDimensions(input.slide.html);
  const instruction = withSourcePrompt(input.instruction, input.sourcePrompt);
  const operation = buildPresentationImageOperation({ businessId: input.businessId, actorId: input.actorId, documentId: input.documentId,
    slide: input.slide, destination: input.destination, instruction: instruction + (input.brand ? `\n${designBrandPromptContext(input.brand)}` : ''),
    generation: input.generation, imageSelection: presentationImageSelection(input.settings), operationKey: input.operationKey,
    region: { x: 0, y: 0, ...canvas }, scope: 'full_design', approvedCopy: input.copy.text, copyMode: input.copy.status === 'none' ? 'none' : 'literal',
    additionalReferences: input.references, interactionMode: input.mode ?? 'execute_change' });
  operation.context.session_id = withDesignConversationSession(operation.context.session_id, input.conversationSessionId);
  if (input.base) {
    if (!input.generation.supports_full_design_edit) throw Error('Actualiza el servidor para editar imágenes dentro de esta conversación.');
    if (input.base.identity.business_id !== input.businessId || input.base.brand_id !== operation.context.brand_id
      || input.base.project_id !== input.documentId || input.base.provenance.kind !== 'image_operation') throw Error('La imagen elegida no pertenece a este diseño.');
    operation.action = 'edit_image'; operation.context.base_asset = { ...input.base.identity };
  }
  return operation;
}

export async function readConversationImage(client: DesignServerClient, businessId: string, identity: AssetVersion) {
  const response = await client.read(businessId);
  const result = presentationLibraryResults(response.state, businessId).find(item => sameConversationAsset(item.asset.identity, identity));
  if (!result) throw Error('No se encontró esta versión de la imagen. Recupera la conversación.');
  return result;
}
