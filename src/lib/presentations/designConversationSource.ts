import type { ConversationDesignSource } from '../../../supabase/functions/_shared/desaing/conversationActions';
import type { PresentationSlide } from './presentationDocument';
import type { PreparedPresentationReference } from './presentationReferences';

/** The destination never changes when the assistant selects another design. */
export function resolveConversationDesignSource(source: ConversationDesignSource, slides: readonly PresentationSlide[],
  references: readonly PreparedPresentationReference[]) {
  if (source.source.kind === 'slide') {
    const id = source.source.slide_id, revision = source.source.revision;
    const slide = slides.find(item => item.id === id && String(item.revision) === revision);
    if (!slide) throw Error('La diapositiva de referencia cambió. Pide actualizar la propuesta antes de continuar.');
    return { slide };
  }
  if (source.source.kind === 'reference') {
    const id = source.source.reference_id, reference = references.find(item => item.id === id);
    if (!reference || reference.role === 'content_source') throw Error('La referencia visual ya no está disponible. Actualiza la propuesta.');
    return { reference };
  }
  return { asset: source.source.asset };
}

export function describeConversationDesignSource(source: ConversationDesignSource, slides: readonly PresentationSlide[],
  references: readonly PreparedPresentationReference[]): string {
  const item = source.source;
  const index = item.kind === 'slide' ? slides.findIndex(slide => slide.id === item.slide_id) : -1;
  const label = item.kind === 'slide' ? (index >= 0 ? `Diapositiva ${index + 1}: ${slides[index].title}` : 'Diapositiva elegida')
    : item.kind === 'reference' ? references.find(ref => ref.id === item.reference_id)?.name ?? 'Referencia elegida' : 'Imagen elegida';
  const mode = { replicate: 'Replicar composición', adapt_layout: 'Adaptar distribución', style_only: 'Tomar sólo el estilo' }[source.mode];
  return `${mode} · ${label}`;
}

export function conversationDesignSourceInstruction(source: ConversationDesignSource): string {
  const modes = {
    replicate: 'Reproduce la composición y proporciones de la fuente visual principal, ajustando sólo lo necesario para que el texto aprobado quepa y sea legible.',
    adapt_layout: 'Reutiliza los componentes, jerarquía y tratamiento visual de la fuente principal. Reorganiza los bloques para acomodar todo el texto aprobado sin superposiciones.',
    style_only: 'Toma la paleta, tipografía, tratamiento de imágenes y lenguaje visual de la fuente principal; crea una distribución adecuada al contenido aprobado.',
  };
  return `\nFuente de diseño acordada: ${JSON.stringify(source)}. ${modes[source.mode]} El destino y el tamaño del lienzo siguen siendo los actuales. El texto de la fuente no reemplaza el contenido aprobado.`;
}

export async function designEditableHtmlHash(html: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(html));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
