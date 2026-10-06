import type { PresentationDesignService } from '@/components/presentations/PresentationDesignContext';
import { assertFreeDesignDocument, updateFreeDesignCanvas, type FreeDesignDocument, type FreeDesignKind, type FreeDesignWorkspace } from '../desaing/freeDesignDocument';
import { openFreeDesignStore } from '../desaing/freeDesignStore';
import { reviseSlide } from '../presentations/presentationDocument';
import { mountServerPresentationAsset, type PresentationLibraryResult } from '../presentations/presentationServerDesign';
import { sanitizePresentationHtml } from '../presentations/presentationHtml';
import { reconcileMountedAssets } from '../presentations/presentationManifest';
import { COVER_FONT_CSS, coverTextHtml, layoutCoverText } from './coverComposer';
import { designFormatOption } from './formats';
import { layerObjectRegion, layerTextBox, overlaysText, type DesignSetup } from './designRun';

/** Location state read by FreeDesignPage to select a document and open the Editor Visual. */
export interface OpenInEditorState { openEditor: 'visual'; documentId: string }

/** Editable text is added as HTML when the model did not paint it (editable covers and separate layers). */
export const editorNeedsText = overlaysText;

/** Blank Diseño libre document with the exact final canvas of the chosen format. */
function blankDocument(scope: { actor_id: string; business_id: string }, name: string, kind: FreeDesignKind, width: number, height: number, copy: string): FreeDesignDocument {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>.lab-canvas{position:relative;width:${width}px;height:${height}px;overflow:hidden;background:#fff}</style></head><body><main class="lab-canvas"></main></body></html>`;
  const value: FreeDesignDocument = { schema_version: 1, id: crypto.randomUUID(), ...scope, kind, name, brief: '', approved_copy: copy.slice(0, 4000),
    width, height, canvas: { id: crypto.randomUUID(), revision: 1, title: name, html, mounted_assets: [] } };
  assertFreeDesignDocument(value, scope); return value;
}

/**
 * Final editor HTML from the mounted images: the object layer (if any) moves inside the design root as an absolute image
 * above the background, since the editor only selects elements there, and the editable text is added on top.
 */
export async function arrangeEditorHtml(input: { html: string; setup: DesignSetup; objectElement?: string }): Promise<string> {
  const { setup } = input, canvas = designFormatOption(setup.formatId).canvas;
  const doc = new DOMParser().parseFromString(input.html, 'text/html');
  const main = doc.querySelector('main.slide') ?? doc.body;
  const piece = input.objectElement ? doc.querySelector<HTMLImageElement>(`img[data-eid="${input.objectElement}"]`) : null;
  if (piece) { piece.style.position = 'absolute'; piece.style.zIndex = '15'; piece.dataset.mountZIndex = '15'; main.append(piece); }
  if (editorNeedsText(setup)) {
    const personal = setup.formatId === 'linkedin_personal_cover';
    const text = await layoutCoverText({ canvas, text: setup.copy, layout: setup.coverLayout, personal,
      box: piece ? layerTextBox(canvas, setup.coverLayout, personal) : undefined });
    if (text) {
      const fonts = doc.createElement('link'); fonts.rel = 'stylesheet'; fonts.href = COVER_FONT_CSS; doc.head.append(fonts);
      main.insertAdjacentHTML('beforeend', coverTextHtml(text));
    }
  }
  return sanitizePresentationHtml(`<!DOCTYPE html>\n${doc.documentElement.outerHTML}`);
}

type Service = Pick<PresentationDesignService, 'client' | 'continuity'>;
/** One read-modify-write on the saved Diseño libre workspace (Supabase when available, otherwise this device). */
async function withWorkspace<T>(service: Service, businessId: string, task: (input: {
  scope: { actor_id: string; business_id: string };
  record: { revision: number; value: FreeDesignWorkspace };
  write(value: FreeDesignWorkspace): Promise<unknown>;
}) => Promise<T>): Promise<T> {
  const actor = (await service.client.session()).actorId, scope = { actor_id: actor, business_id: businessId };
  const store = service.continuity ? await service.continuity.openFreeWorkspace(scope) : await openFreeDesignStore(scope);
  try {
    const record = await store.read();
    if ('status' in store && typeof store.status === 'function' && store.status() !== 'synced') throw Error('conversation_sync_unavailable');
    return await task({ scope, record, write: value => store.write(record.revision, value) });
  } finally { store.close(); }
}

/** The editor document of a version is the one whose canvas mounts that version's image. */
export function versionDocument(workspace: FreeDesignWorkspace, versionId: string): FreeDesignDocument | null {
  return workspace.documents.find(item => item.canvas.mounted_assets?.some(mounted => mounted.asset.version_id === versionId)) ?? null;
}
/** Editor documents of the given versions, by version id. */
export async function readVersionDocuments(service: Service, businessId: string, versionIds: readonly string[]): Promise<Map<string, FreeDesignDocument>> {
  return withWorkspace(service, businessId, async ({ record }) => new Map(versionIds.flatMap(id => {
    const found = versionDocument(record.value, id); return found ? [[id, found] as const] : [];
  })));
}

/** Saves the editor HTML into the version document; fails visibly if another tab saved first. */
export async function saveVersionDocument(service: Service, businessId: string, input: { documentId: string; expectedRevision: number; html: string }): Promise<FreeDesignDocument> {
  return withWorkspace(service, businessId, async ({ record, write }) => {
    const target = record.value.documents.find(item => item.id === input.documentId);
    if (!target) throw Error('editor_document_missing');
    if (target.canvas.revision !== input.expectedRevision) throw Error('editor_document_changed');
    const html = sanitizePresentationHtml(input.html);
    const next = reviseSlide([target.canvas], { slide_id: target.canvas.id, expected_revision: target.canvas.revision,
      html, mounted_assets: reconcileMountedAssets(target.canvas, html) })[0];
    const saved = updateFreeDesignCanvas(target, next, target.canvas.revision);
    await write({ ...record.value, documents: record.value.documents.map(item => item.id === saved.id ? saved : item) });
    return saved;
  });
}

/**
 * Opens the editor document of an approved version, creating it the first time: the image as full background
 * (cover-cropped for LinkedIn), the object layer and the editable text as positioned `data-eid` elements.
 * Reopening a version continues its saved edits instead of creating a copy.
 */
export async function openVersionDocument(input: { service: Service; businessId: string; setup: DesignSetup; result: PresentationLibraryResult;
  /** Approved transparent object layer, mounted as its own draggable image. */
  object?: PresentationLibraryResult | null }): Promise<FreeDesignDocument> {
  const { service, businessId, setup } = input, option = designFormatOption(setup.formatId), { width, height } = option.canvas;
  return withWorkspace(service, businessId, async ({ scope, record, write }) => {
    const existing = versionDocument(record.value, input.result.asset.identity.version_id);
    if (existing) return existing;
    if (record.value.documents.length >= 30) throw Error('free_workspace_full');
    const name = `${option.label} · ${new Date().toLocaleDateString('es-MX')}`.slice(0, 160);
    const cover = option.mode === 'compose_assets';
    const blank = blankDocument(scope, name, cover ? 'cover' : 'special', width, height, setup.noText ? '' : setup.copy);
    const background = await mountServerPresentationAsset(service.client, { businessId, documentId: blank.id, slide: blank.canvas, asset: input.result.asset,
      region: { x: 0, y: 0, width, height }, replaceFullDesign: true });
    // The background fills the canvas with a centered crop, like the downloaded PNG (the 3:1 band on covers).
    const backgroundDoc = new DOMParser().parseFromString(background.html, 'text/html');
    if (cover || input.object) backgroundDoc.querySelectorAll<HTMLImageElement>('img[data-mount-fit]').forEach(img => { img.dataset.mountFit = 'cover'; img.style.objectFit = 'cover'; });
    const withBackground = { ...background, html: sanitizePresentationHtml(`<!DOCTYPE html>\n${backgroundDoc.documentElement.outerHTML}`) };
    const mounted = input.object ? await mountServerPresentationAsset(service.client, { businessId, documentId: blank.id, slide: withBackground,
      asset: input.object.asset, region: layerObjectRegion(option.canvas, setup.coverLayout.align) }) : withBackground;
    const html = await arrangeEditorHtml({ html: mounted.html, setup, objectElement: input.object ? mounted.mounted_assets?.at(-1)?.element_id : undefined });
    const created: FreeDesignDocument = { ...blank, canvas: { ...mounted, html, mounted_assets: reconcileMountedAssets(mounted, html) } };
    assertFreeDesignDocument(created, scope);
    await write({ documents: [...record.value.documents, created], selected_id: created.id });
    return created;
  });
}
