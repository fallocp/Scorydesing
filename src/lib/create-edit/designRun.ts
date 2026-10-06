import type { DesignSurfaceDestination } from '../../../supabase/functions/_shared/desaing/designSurface';
import type { DesignCopy, DesignUnderstanding, ExplorationRequest } from '../../../supabase/functions/_shared/desaing/explorationContracts';
import type { FormatPresetId } from '../../../supabase/functions/_shared/desaing/formats';
import type { RegisteredAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import type { ServerGenerationCapabilities } from '../../../supabase/functions/_shared/desaing/serverGenerationContract';
import type { ServerSnapshot } from '../../../supabase/functions/_shared/desaing/serverState';
import type { DesignOperation } from '../../../supabase/functions/_shared/desaing/contracts';
import { XENDING_STYLES, xendingStyleBlock, type XendingStyle } from '../../../supabase/functions/_shared/desaing/xendingVisualSystem';
import type { PresentationSlide } from '../presentations/presentationDocument';
import { buildConversationImageOperation, type prepareConversationReferences } from '../presentations/designConversationImages';
import { presentationImageSelection, presentationLibraryResults, type PresentationLibraryResult } from '../presentations/presentationServerDesign';
import type { DesignBrandContext } from '../presentations/designBrandContext';
import type { ImageGenerationSettings } from '../imageGenerationSettings';
import { COVER_SOURCE_CANVAS, coverVisibleHeight, designFormatOption } from './formats';
import { coverTextBox, type CoverTextBox } from './coverComposer';
import { createAssetGenerationOperation } from '../../../supabase/functions/_shared/desaing/assetGeneration';

export const DESIGN_PAGE_ID = 'main';
export const DESIGN_DESTINATION: DesignSurfaceDestination = { document_type: 'special', page_id: DESIGN_PAGE_ID };
export const MAX_DESIGN_VERSIONS = 4;
/** Soft monthly reference, never a block: the user decides whether to keep generating. */
export const MONTHLY_SPEND_WARNING_MICRO_USD = 40_000_000;

/** How text reaches an ultrawide cover: drawn over the image (exact, editable) or painted by the model. */
export type CoverTextMode = 'editable' | 'image';
export interface CoverLayout { align: 'left' | 'center' | 'right'; size: 'small' | 'medium' | 'large'; color: 'navy' | 'white'; highlight: string }
/** What the vision model understood from the references; valid only for the exact selection in `key`. */
export interface ReferenceReading {
  key: string;
  /** Detailed render plan combining the references; editable by the user. */
  instruction: string;
  notes: { position: number; text: string }[];
  align: CoverLayout['align'] | null;
  highlight: string;
}
export interface DesignSetup {
  documentId: string;
  formatId: FormatPresetId;
  style: XendingStyle;
  copy: string;
  noText: boolean;
  instruction: string;
  count: number;
  coverText: CoverTextMode;
  coverLayout: CoverLayout;
  includeLogo: boolean;
  reading: ReferenceReading | null;
  /** faithful: keep the composition reference as-is; vary: use it as inspiration for new layouts. */
  referenceMode: 'faithful' | 'vary';
  /** Separate layers: background without the object + the object as a transparent PNG + the text as HTML. */
  layers: boolean;
  /** Background operation key → object operation key, saved before enqueuing so a reload keeps the pairs. */
  layerPairs: LayerPair[];
}
export interface LayerPair { background: string; object: string }
/** Object pieces are generated square and mounted with `contain`. */
export const LAYER_OBJECT_CANVAS = Object.freeze({ width: 1024, height: 1024 });
const MAX_LAYER_PAIRS = 200;
export const DEFAULT_COVER_LAYOUT: CoverLayout = Object.freeze({ align: 'center', size: 'medium', color: 'navy', highlight: '' });
/** Identity of a reference selection: pixels and roles. */
export const referencesKey = (items: readonly { id: string; role: string }[]) => JSON.stringify(items.map(item => [item.id, item.role]));
const uploadedKey = (references: UploadedReferences) => referencesKey(references.map(item => ({ id: item.reference.reference_id, role: item.reference.roles[0] })));
export const isCoverFormat = (formatId: FormatPresetId) => designFormatOption(formatId).mode === 'compose_assets';
/** The model paints text only for ordinary formats or covers set to "Dentro del diseño"; separate layers always keep it as HTML. */
const modelDrawsText = (setup: Pick<DesignSetup, 'formatId' | 'noText' | 'coverText' | 'layers'>) =>
  !setup.noText && !setup.layers && (!isCoverFormat(setup.formatId) || setup.coverText === 'image');
/** Text drawn over the image (exact and editable): editable covers and separate layers. */
export const overlaysText = (setup: Pick<DesignSetup, 'formatId' | 'noText' | 'coverText' | 'layers' | 'copy'>) =>
  !setup.noText && !!setup.copy.trim() && (setup.layers || isCoverFormat(setup.formatId) && setup.coverText === 'editable');
const SIDE = { left: 'la izquierda', center: 'el centro', right: 'la derecha' } as const;

/**
 * Where the object layer goes on the final canvas: opposite the text, or low and centered when the text is centered.
 * A square box, as large as the free side allows.
 */
export function layerObjectRegion(canvas: { width: number; height: number }, align: CoverLayout['align']) {
  const margin = Math.round(Math.min(canvas.width, canvas.height) * 0.05);
  if (align === 'center') {
    const size = Math.round(Math.min(canvas.width * 0.6, canvas.height * 0.45));
    return { x: Math.round((canvas.width - size) / 2), y: canvas.height - margin - size, width: size, height: size };
  }
  const size = Math.round(Math.min(canvas.width * 0.38, canvas.height - margin * 2));
  return { x: align === 'left' ? canvas.width - margin - size : margin, y: Math.round((canvas.height - size) / 2), width: size, height: size };
}
/** Text area that leaves the object region free (centered text goes above the object). */
export function layerTextBox(canvas: { width: number; height: number }, layout: Pick<CoverLayout, 'align'>, personal: boolean): CoverTextBox {
  const box = coverTextBox(canvas, layout, personal);
  if (layout.align !== 'center') return box;
  const object = layerObjectRegion(canvas, 'center');
  return { ...box, height: Math.max(canvas.height * 0.2, object.y - box.y - canvas.height * 0.03) };
}
const objectSide = (align: CoverLayout['align']) => align === 'left' ? SIDE.right : align === 'right' ? SIDE.left : 'la parte inferior central';
export type UploadedReferences = Awaited<ReturnType<typeof prepareConversationReferences>>;

export function newDesignSetup(formatId: FormatPresetId = 'cover_16_9', instruction = ''): DesignSetup {
  return { documentId: crypto.randomUUID(), formatId, style: 'white_v2', copy: '', noText: false, instruction, count: 3,
    coverText: 'editable', coverLayout: { ...DEFAULT_COVER_LAYOUT }, includeLogo: false, reading: null, referenceMode: 'faithful',
    layers: false, layerPairs: [] };
}

/** A blank surface for the rendered canvas (the 3:1 source band for covers); its CSS is only read for dimensions. */
export function designSurface(setup: Pick<DesignSetup, 'formatId'>): PresentationSlide {
  const option = designFormatOption(setup.formatId);
  const { width, height } = option.mode === 'compose_assets' ? COVER_SOURCE_CANVAS : option.canvas;
  return { id: DESIGN_PAGE_ID, revision: 1, title: option.label,
    html: `<style>.lab-canvas{width:${width}px;height:${height}px}</style><main class="lab-canvas"></main>` };
}

export function designCopy(setup: Pick<DesignSetup, 'copy' | 'noText' | 'formatId' | 'coverText' | 'layers'>): DesignCopy {
  if (!setup.noText && !setup.copy.trim()) throw new Error('design_copy_required');
  if (!modelDrawsText(setup)) return { status: 'none', text: '', source_reference_ids: [] };
  return { status: 'literal', text: setup.copy.trim(), source_reference_ids: [] };
}

function coverGuidance(setup: DesignSetup): string[] {
  const option = designFormatOption(setup.formatId);
  if (option.mode !== 'compose_assets') return [];
  const band = Math.round(coverVisibleHeight(option.canvas) * 100);
  return [`Portada ultra ancha (${option.canvas.width}×${option.canvas.height}): esta imagen se recortará al centro. Mantén todo lo importante dentro de la franja horizontal central (${band}% de la altura); arriba y abajo solo fondo que continúe la escena.`,
    ...(setup.formatId === 'linkedin_personal_cover' ? ['Deja libre la esquina inferior izquierda: ahí se superpone la foto de perfil.'] : []),
    ...(!setup.noText && setup.coverText === 'editable' && !setup.layers
      ? [`Deja un área limpia y uniforme ${setup.coverLayout.align === 'left' ? 'a la izquierda' : setup.coverLayout.align === 'right' ? 'a la derecha' : 'al centro'} para colocar el texto después. No dibujes texto.`] : [])];
}

/** Separate layers: this image is only the background; the object and the text are placed on top later. */
function layerBackgroundGuidance(setup: DesignSetup): string[] {
  if (!setup.layers) return [];
  const align = setup.coverLayout.align;
  return [`CAPAS SEPARADAS: esta imagen es SOLO EL FONDO. No dibujes el objeto principal (mundo, globo, producto, persona, dispositivo) ni ningún texto: se colocan después como capas aparte.
Deja ${objectSide(align)} libre y limpia, con el fondo continuo y una sombra de contacto suave donde apoyará el objeto; deja ${SIDE[align]} limpio para el texto. Conserva el ambiente, la luz, los materiales y los elementos secundarios sutiles.`];
}

const ROLE_GUIDANCE: Record<string, string> = {
  layout_reference: 'COMPOSICIÓN: copia su distribución (dónde va el texto, dónde va el objeto, proporciones, márgenes y jerarquía); no copies su objeto si otra imagen aporta el objeto o el mundo',
  image_style_reference: 'ESTILO: toma su mundo visual, iluminación, materiales y ambiente',
  object_reference: 'OBJETO: este es el objeto, persona o mundo que debe aparecer en la pieza',
  content_source: 'TEXTO: de aquí sale el texto y el contenido (ya está transcrito arriba); no copies su diseño salvo que también sea la composición',
  brand_reference: 'MARCA: respeta su identidad de marca',
};
const LOGO_RULE = 'LOGOTIPOS: no copies ni dibujes logotipos, isotipos, monogramas ni marcas de agua de las referencias (tampoco el de Xending). Donde la referencia tenga un logo, deja el espacio limpio o continúa la composición.';
const LOGO_KEEP = 'LOGOTIPO: conserva el logotipo tal como aparece en la referencia, sin redibujarlo ni inventar otro.';

function referenceGuidance(setup: DesignSetup, references: UploadedReferences): string[] {
  if (!references.length) return [];
  const roles = references.map(item => item.reference.roles[0]);
  const lines = references.map((item, position) => `- Imagen ${position + 1}: ${item.reference.roles.map(role => ROLE_GUIDANCE[role] ?? role).join('; ')}.`);
  const parts = [`Imágenes adjuntas, en orden:\n${lines.join('\n')}`];
  const combines = roles.includes('layout_reference') && roles.some(role => role === 'object_reference' || role === 'image_style_reference');
  if (setup.referenceMode === 'vary') parts.push(`VARIACIÓN: usa las referencias como inspiración, no como plantilla. Conserva la idea, el texto y el mundo visual, pero propone una distribución, un encuadre y una jerarquía nuevos.${combines ? ' Usa el objeto o mundo de la imagen de OBJETO o ESTILO, no el de la imagen de COMPOSICIÓN.' : ''}`);
  else if (combines) parts.push('COMBINACIÓN: conserva la distribución de la imagen de COMPOSICIÓN y reemplaza su objeto o escena por el de la imagen de OBJETO o ESTILO. No pongas los dos objetos: usa solo el nuevo, en la misma posición y proporción que el original.');
  const reading = setup.reading?.key === uploadedKey(references) ? setup.reading : null;
  if (reading) parts.push(`PLAN A PARTIR DE LAS REFERENCIAS (síguelo con precisión):\n${reading.instruction.trim()}${reading.notes.length
    ? `\n${reading.notes.map(note => `- Imagen ${note.position}: ${note.text}`).join('\n')}` : ''}`);
  return parts;
}

/** One version of the same brief; each index asks for a distinct composition. */
export function designInstruction(setup: DesignSetup, references: UploadedReferences, index: number, total: number): string {
  const option = designFormatOption(setup.formatId);
  const parts = [setup.instruction.trim() || 'Diseña una pieza de marca clara y atractiva para este formato.',
    `Formato final: ${option.label} (${option.canvas.width}×${option.canvas.height}). Usa todo el lienzo y deja el texto importante lejos de los bordes.`];
  parts.push(...referenceGuidance(setup, references), setup.includeLogo ? LOGO_KEEP : LOGO_RULE);
  parts.push(...coverGuidance(setup), ...layerBackgroundGuidance(setup));
  // Faithful recreations keep the reference layout across versions; only details change.
  const faithful = setup.referenceMode === 'faithful' && references.some(item => item.reference.roles.includes('layout_reference'));
  if (total > 1) parts.push(faithful
    ? `Versión ${index + 1} de ${total}: conserva la misma distribución y varía solo detalles (ángulo del objeto, iluminación, materiales, acentos de color).`
    : `Versión ${index + 1} de ${total}: propone una composición claramente distinta de las otras versiones, sin cambiar el texto ni la marca.`);
  parts.push(xendingStyleBlock(setup.style, modelDrawsText(setup)));
  return parts.join('\n\n');
}

export function editInstruction(setup: DesignSetup, change: string): string {
  if (!change.trim()) throw new Error('design_change_required');
  return [`Ajusta esta imagen: ${change.trim()}`,
    'Conserva todo lo demás: texto exacto, composición, marca y estilo. Cambia solo lo que se pide.',
    setup.includeLogo ? LOGO_KEEP : LOGO_RULE, ...coverGuidance(setup), ...layerBackgroundGuidance(setup), xendingStyleBlock(setup.style, modelDrawsText(setup))].join('\n\n');
}

/** The object layer alone: the same object the full design would show, isolated on a transparent background. */
export function objectInstruction(setup: DesignSetup, references: UploadedReferences, index: number, total: number): string {
  const roles = references.map(item => item.reference.roles[0]);
  const source = roles.includes('object_reference') ? 'el de la imagen de OBJETO' : roles.includes('image_style_reference') ? 'el mundo de la imagen de ESTILO'
    : roles.includes('layout_reference') ? 'el objeto principal de la imagen de COMPOSICIÓN' : 'el hero visual que pide la pieza';
  const parts = [setup.instruction.trim() || 'Pieza de marca clara y atractiva.',
    `CAPA DE OBJETO: genera SOLO el objeto principal de la pieza (${source}), completo, centrado y aislado sobre fondo TRANSPARENTE. Sin fondo, sin piso, sin marco, sin escena, sin texto ni logotipos. Bordes limpios y nítidos; puede tener sombras propias suaves, nunca una sombra proyectada sobre un fondo. Ocupa cerca del 85% del lienzo cuadrado sin tocar los bordes.`];
  if (references.length) parts.push(`Imágenes adjuntas, en orden:\n${references.map((item, position) =>
    `- Imagen ${position + 1}: ${item.reference.roles.map(role => ROLE_GUIDANCE[role] ?? role).join('; ')}.`).join('\n')}`);
  const reading = setup.reading?.key === uploadedKey(references) ? setup.reading : null;
  if (reading) parts.push(`Plan de la pieza completa (usa solo lo que describe el objeto):\n${reading.instruction.trim()}`);
  if (total > 1) parts.push(`Versión ${index + 1} de ${total}: varía solo el ángulo, la iluminación o los acentos de color del objeto.`);
  parts.push(LOGO_RULE, xendingStyleBlock(setup.style, false));
  return parts.join('\n\n');
}

interface OperationInput {
  setup: DesignSetup; businessId: string; actorId: string; brand: DesignBrandContext | null;
  generation: ServerGenerationCapabilities; settings: ImageGenerationSettings; references: UploadedReferences;
}
export function buildDesignVersionOperation(input: OperationInput & { index: number; total: number; operationKey: string }): DesignOperation {
  return buildConversationImageOperation({ businessId: input.businessId, actorId: input.actorId, documentId: input.setup.documentId,
    slide: designSurface(input.setup), destination: DESIGN_DESTINATION, instruction: designInstruction(input.setup, input.references, input.index, input.total),
    copy: designCopy(input.setup), brand: input.brand, operationKey: input.operationKey, generation: input.generation,
    settings: input.settings, references: input.references });
}
export function buildDesignEditOperation(input: OperationInput & { base: RegisteredAssetVersion; change: string; operationKey: string }): DesignOperation {
  return buildConversationImageOperation({ businessId: input.businessId, actorId: input.actorId, documentId: input.setup.documentId,
    slide: designSurface(input.setup), destination: DESIGN_DESTINATION, instruction: editInstruction(input.setup, input.change),
    copy: designCopy(input.setup), brand: input.brand, operationKey: input.operationKey, generation: input.generation,
    settings: input.settings, references: input.references, base: input.base });
}

/** The object layer as a transparent asset generation; it reuses the references uploaded for the background. */
export function buildDesignObjectOperation(input: Omit<OperationInput, 'brand'> & { index: number; total: number; operationKey: string }): DesignOperation {
  if (!input.generation.supports_asset_generation) throw Error('server_generation_unavailable');
  const selection = presentationImageSelection(input.settings);
  if (!(input.generation.profiles ?? [input.generation.profile]).includes(selection.profile)
    || input.generation.qualities && !input.generation.qualities.includes(selection.quality)) throw Error('unsupported_image_selection');
  return createAssetGenerationOperation({ operationKey: input.operationKey, actorId: input.actorId, businessId: input.businessId,
    process: 'create_edit', prompt: objectInstruction(input.setup, input.references, input.index, input.total), profile: selection.profile,
    quality: selection.quality, executor: input.generation.executor, references: input.references.map(item => structuredClone(item.reference)),
    canvas: LAYER_OBJECT_CANVAS, background: 'transparent' });
}
/** The object layer paired with a background version, once it has a reviewable result. */
export function layerObjectResult(state: ServerSnapshot, businessId: string, setup: Pick<DesignSetup, 'layerPairs'>, background: PresentationLibraryResult) {
  const pair = setup.layerPairs.find(item => item.background === background.job.operation_key);
  return pair ? presentationLibraryResults(state, businessId).find(item => item.job.operation_key === pair.object) ?? null : null;
}

/** Images marked "Texto y contenido" are read first; otherwise every reference is read. */
export function textSources(references: UploadedReferences): UploadedReferences {
  const marked = references.filter(item => item.reference.roles.includes('content_source'));
  return marked.length ? marked : references;
}
const ROLE_NAMES: Record<string, string> = { layout_reference: 'Composición', image_style_reference: 'Estilo visual', object_reference: 'Objeto o mundo',
  content_source: 'Texto y contenido', brand_reference: 'Marca' };
/** One vision call that sees every reference: literal text, what to take from each image and a detailed render plan. It never renders. */
export function buildReadingRequest(input: { setup: DesignSetup; businessId: string; actorId: string; references: UploadedReferences; requestKey: string }): ExplorationRequest {
  if (!input.references.length) throw new Error('design_text_source_required');
  const documentId = input.setup.documentId, sources = textSources(input.references).map(item => input.references.indexOf(item) + 1);
  const roles = input.references.map((item, index) => `Imagen ${index + 1}: ${item.reference.roles.map(role => ROLE_NAMES[role] ?? role).join(', ')}`).join('; ');
  const wish = input.setup.instruction.trim().slice(0, 1200);
  const mode = input.setup.referenceMode === 'vary' ? 'Modo: VARIAR (usa las referencias como inspiración y propone una distribución nueva).'
    : 'Modo: RECREAR FIEL (conserva la distribución de la imagen de composición).';
  const message = [`Analiza con detalle las imágenes adjuntas para crear un diseño nuevo${wish ? `. Pedido del usuario: «${wish}»` : ''}. Roles: ${roles}. ${mode}`,
    `1) design_understanding.copy: transcribe literalmente el texto visible de la${sources.length > 1 ? 's imágenes' : ' imagen'} ${sources.join(', ')}, en orden de lectura, con saltos de línea, mayúsculas, acentos, signos, cifras y URL. No traduzcas ni corrijas.${input.setup.includeLogo ? '' : ' Omite el texto que forma parte de un logotipo (el nombre de marca junto a su isotipo).'} Usa status=literal; none si no hay texto; pending y una pregunta si algún carácter es dudoso.`,
    '2) design_understanding.references: por cada imagen, qué tomar exactamente de ella según su rol (posiciones, proporciones, jerarquía, objeto, materiales, colores) y qué NO tomar.',
    `3) design_understanding.resolved_instruction: un prompt detallado para el generador de imágenes que combine las imágenes según sus roles y el pedido: distribución (dónde va el texto y dónde el objeto, en qué proporción), el objeto o mundo a usar, iluminación y materiales.${input.setup.includeLogo ? '' : ' Sin logotipos.'} No repitas el texto literal.`,
    '4) design_understanding.preserve: incluye exactamente «ALINEACION_TEXTO: izquierda», «ALINEACION_TEXTO: centro» o «ALINEACION_TEXTO: derecha» según dónde está el texto en la composición y, si una palabra del título está en otro color, «RESALTAR: <palabra>».'].join('\n');
  return { request_key: input.requestKey, kind: 'discussion', scope: 'full_design', history: [], message,
    context: { actor_id: input.actorId, business_id: input.businessId, brand_id: 'free_design', project_id: documentId,
      session_id: `create_design:${documentId}:references`, workspace: 'free_design', interaction_mode: 'execute_change',
      target: { document_type: 'special', document_id: documentId, page_id: DESIGN_PAGE_ID, revision: '1' },
      instruction: 'Análisis de referencias para un diseño nuevo. No generes imágenes.', immutable_elements: [],
      references: input.references.map(item => structuredClone(item.reference)) },
    design_brief: { copy: { status: 'pending', text: '', source_reference_ids: [] }, brand: null, selected_instruction: '', preserve: [] } };
}
/** Maps the model's understanding to the setup; unknown alignment markers are ignored. */
export function readingFromUnderstanding(understanding: DesignUnderstanding, references: UploadedReferences): { copy: DesignCopy; reading: ReferenceReading; question: string } {
  const marker = (name: string) => understanding.preserve.map(item => item.match(new RegExp(`^\\s*${name}\\s*:\\s*(.+?)\\s*$`, 'i'))?.[1]).find(Boolean) ?? '';
  const alignText = marker('ALINEACION_TEXTO').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const align = alignText.startsWith('izq') ? 'left' : alignText.startsWith('der') ? 'right' : alignText.startsWith('cen') ? 'center' : null;
  const notes = understanding.references.flatMap(item => {
    const position = references.findIndex(ref => ref.reference.reference_id === item.reference_id) + 1;
    return position && item.instruction.trim() ? [{ position, text: item.instruction.trim() }] : [];
  });
  return { copy: understanding.copy, question: understanding.pending_questions[0] ?? '',
    reading: { key: uploadedKey(references), instruction: understanding.resolved_instruction.trim(), notes, align, highlight: marker('RESALTAR').slice(0, 80) } };
}

/** Saved versions of this design, oldest first. */
export function designResults(state: ServerSnapshot, businessId: string, documentId: string): PresentationLibraryResult[] {
  return presentationLibraryResults(state, businessId).filter(item => item.asset.project_id === documentId
    && item.job.plan.operation.context.workspace === 'free_design').sort((a, b) => a.job.created_at - b.job.created_at);
}
/** Jobs of this design that have not produced a reviewable result yet. */
export function pendingDesignJobs(state: ServerSnapshot, documentId: string, objectKeys: readonly string[] = []) {
  return state.jobs.jobs.filter(job => isDesignJob(job, documentId, objectKeys)
    && job.calls.some(call => ['pending', 'running', 'result_received', 'validating', 'uncertain'].includes(call.state)));
}
/** Background versions live in the design project; object layers are asset generations tracked by key. */
export const isDesignJob = (job: ServerSnapshot['jobs']['jobs'][number], documentId: string, objectKeys: readonly string[]) =>
  job.plan.operation.context.project_id === documentId || objectKeys.includes(job.operation_key);

/** Image spend recorded this calendar month (UTC): settled amounts, otherwise reservations. */
export function monthlyImageSpendMicroUsd(state: ServerSnapshot, now = new Date()): number {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  let total = 0;
  for (const job of state.jobs.jobs) {
    if (job.created_at < start) continue;
    for (const call of job.calls) if (!(call.state === 'cancelled' && !call.attempt)) total += call.settlement?.actual_micro_usd ?? call.reserved_micro_usd;
  }
  return total;
}

/** Platform label used by Xending Design's saved mockups grid. */
export function mockupPlatform(formatId: FormatPresetId): string {
  const known: Partial<Record<FormatPresetId, string>> = { instagram_story: 'instagram-story', instagram_square: 'instagram-post',
    linkedin_landscape: 'linkedin-post', cover_16_9: 'banner', presentation_16_9: 'banner' };
  return known[formatId] ?? formatId.replace(/_/g, '-');
}

const STORAGE_VERSION = 1;
export function designStorageKey(actor: string, business: string) {
  return `scory:create-design:v${STORAGE_VERSION}:${encodeURIComponent(actor)}:${encodeURIComponent(business)}`;
}
export function readDesignSetup(raw: string | null): DesignSetup | null {
  try {
    const value = JSON.parse(raw ?? 'null') as Record<string, unknown> | null;
    if (!value || typeof value !== 'object' || typeof value.documentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.documentId)
      || typeof value.formatId !== 'string' || !XENDING_STYLES.includes(value.style as XendingStyle)
      || typeof value.copy !== 'string' || value.copy.length > 4000 || typeof value.noText !== 'boolean'
      || typeof value.instruction !== 'string' || value.instruction.length > 8000
      || !Number.isSafeInteger(value.count) || Number(value.count) < 1 || Number(value.count) > MAX_DESIGN_VERSIONS) return null;
    designFormatOption(value.formatId as FormatPresetId);
    // Setups saved before covers existed have no cover fields.
    const layout = value.coverLayout as Partial<CoverLayout> | undefined;
    const coverLayout: CoverLayout = { align: ['left', 'center', 'right'].includes(String(layout?.align)) ? layout!.align! : DEFAULT_COVER_LAYOUT.align,
      size: ['small', 'medium', 'large'].includes(String(layout?.size)) ? layout!.size! : DEFAULT_COVER_LAYOUT.size,
      color: ['navy', 'white'].includes(String(layout?.color)) ? layout!.color! : DEFAULT_COVER_LAYOUT.color,
      highlight: typeof layout?.highlight === 'string' ? layout.highlight.slice(0, 80) : '' };
    const reading = value.reading as ReferenceReading | null | undefined;
    const validReading = reading && typeof reading.key === 'string' && typeof reading.instruction === 'string' && reading.instruction.length <= 6000
      && Array.isArray(reading.notes) && reading.notes.every(note => Number.isSafeInteger(note?.position) && typeof note.text === 'string' && note.text.length <= 1200)
      && (reading.align === null || ['left', 'center', 'right'].includes(reading.align)) && typeof reading.highlight === 'string' ? reading : null;
    const validKey = (key: unknown): key is string => typeof key === 'string' && key.length > 0 && key.length <= 200;
    const layerPairs = Array.isArray(value.layerPairs) ? (value.layerPairs as Partial<LayerPair>[])
      .filter((pair): pair is LayerPair => validKey(pair?.background) && validKey(pair?.object)).slice(-MAX_LAYER_PAIRS) : [];
    return { ...(value as unknown as DesignSetup), coverText: value.coverText === 'image' ? 'image' : 'editable', coverLayout,
      includeLogo: value.includeLogo === true, reading: validReading, referenceMode: value.referenceMode === 'vary' ? 'vary' : 'faithful',
      layers: value.layers === true, layerPairs: layerPairs.map(pair => ({ background: pair.background, object: pair.object })) };
  } catch { return null; }
}
