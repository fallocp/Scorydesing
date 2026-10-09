export interface DesignLogoInput {
  source: string;
  name?: string;
  canvas: { width: number; height: number };
}

/** Insert original logo pixels as one movable image. Replacing a marked logo
 * keeps its edited geometry and leaves every other design element intact. */
export function insertDesignLogo(html: string, input: DesignLogoInput): string {
  const { width, height } = input.canvas;
  if (![width, height].every(value => Number.isSafeInteger(value) && value > 0 && value <= 32768)) throw Error('El tamaño del diseño no es válido.');
  if (!/^data:image\/(?:png|jpeg|webp|avif|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/.test(input.source)) throw Error('El archivo del logo no es válido.');
  const document = new DOMParser().parseFromString(html, 'text/html');
  const existing = document.querySelector<HTMLImageElement>('img[data-design-logo],img.brand-logo');
  const logo = existing ?? document.createElement('img');
  logo.src = input.source; logo.alt = input.name?.trim() || 'Logo'; logo.dataset.designLogo = 'true';
  if (!logo.dataset.eid) logo.dataset.eid = `design-logo-${crypto.randomUUID()}`;
  // A replacement is a new independent image, never the previous asset's bytes.
  for (const attribute of Array.from(logo.attributes)) {
    if (attribute.name === 'srcset' || attribute.name === 'sizes' || attribute.name === 'data-asset-id'
      || attribute.name === 'data-asset-version' || attribute.name.startsWith('data-mount-')) logo.removeAttribute(attribute.name);
  }
  logo.style.setProperty('object-fit', 'contain', 'important');
  if (!existing) {
    const margin = Math.round(Math.min(width, height) * 0.04);
    const boxWidth = Math.max(1, Math.round(Math.min(width * 0.22, height * 0.30)));
    const boxHeight = Math.max(1, Math.round(Math.min(height * 0.12, width * 0.12)));
    Object.assign(logo.style, { position: 'fixed', left: `${width - margin - boxWidth}px`, top: `${margin}px`,
      width: `${boxWidth}px`, height: `${boxHeight}px`, zIndex: '30', maxWidth: 'none', margin: '0', transform: 'none' });
    document.body.append(logo);
  }
  return `<!DOCTYPE html>\n${document.documentElement.outerHTML}`;
}

/** Keep the original file bytes in the document; gallery URLs are signed and expire. */
export async function readDesignLogo(source: string | File): Promise<string> {
  const blob = typeof source === 'string' ? await fetch(source, { mode: 'cors', credentials: 'omit', signal: AbortSignal.timeout(15000) })
    .then(response => { if (!response.ok) throw Error('No se pudo cargar el logo.'); return response.blob(); }) : source;
  if (!/^image\/(?:png|jpeg|webp|avif|svg\+xml)$/i.test(blob.type) || !blob.size || blob.size > 12 * 1048576)
    throw Error('Usa un logo PNG, JPG, WebP, SVG o AVIF de hasta 12 MB.');
  return new Promise<string>((resolve, reject) => { const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(Error('No se pudo leer el logo.')); reader.readAsDataURL(blob); });
}
