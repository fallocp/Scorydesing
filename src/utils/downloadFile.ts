/**
 * Fuerza la descarga de una imagen, venga como data URL o como URL remota.
 *
 * El atributo `download` de un ancla NO fuerza la descarga cuando el `href`
 * apunta a otro origen (el bucket público de Supabase Storage lo es): el
 * navegador navega a la imagen y la muestra en vez de guardarla. Por eso las
 * URLs http(s) se traen primero a un blob del mismo origen, y ahí `download`
 * sí funciona. Las data: y blob: se descargan directo.
 */
export async function downloadImage(src: string, filename: string): Promise<void> {
  let href = src;
  let objectUrl: string | null = null;

  if (/^https?:/i.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`No se pudo descargar la imagen (${res.status})`);
    const blob = await res.blob();
    objectUrl = URL.createObjectURL(blob);
    href = objectUrl;
  }

  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  if (objectUrl) URL.revokeObjectURL(objectUrl);
}
