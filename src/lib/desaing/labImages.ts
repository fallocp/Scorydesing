/** Raster fixtures for workflow testing. These are drawings, not AI generation or quality benchmarks. */
export interface LabImage { blob: Blob; width: number; height: number }
export interface LabBlobStore { put(key: string, blob: Blob): Promise<void>; get(key: string): Promise<Blob> }

export function openLabBlobStore(): LabBlobStore {
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('desaing-local-images-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('No se pudo abrir el almacén local de imágenes.'));
    request.onblocked = () => reject(new Error('Cierra otra pestaña del laboratorio para actualizar su almacén.'));
  });
  return {
    async put(key, blob) {
      const db = await database;
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('images', 'readwrite');
        tx.objectStore('images').add(blob, key);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(new Error('No se pudo guardar la imagen local; la versión no se reemplazó.'));
        tx.onerror = () => { /* onabort reports the failed transaction. */ };
      });
    },
    async get(key) {
      const db = await database;
      return new Promise<Blob>((resolve, reject) => {
        const request = db.transaction('images', 'readonly').objectStore('images').get(key);
        request.onsuccess = () => request.result instanceof Blob ? resolve(request.result)
          : reject(new Error('Falta una imagen guardada. No se volverá a generar automáticamente.'));
        request.onerror = () => reject(new Error('No se pudo leer la imagen local.'));
      });
    },
  };
}

export async function imageDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

export async function drawLabImage(index: number, size: { width: number; height: number }, instruction: string): Promise<LabImage> {
  const canvas = document.createElement('canvas');
  canvas.width = size.width; canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo dibujar la imagen de prueba.');
  const scale = Math.min(size.width, size.height) / 1024;
  ctx.translate(size.width / 2, size.height / 2); ctx.scale(scale, scale);
  const colors = ['#24786b', '#4269ae', '#a46735', '#6f58a4', '#276578'];
  const color = colors[index % colors.length];
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.setLineDash([8, 16]);
  ctx.beginPath(); ctx.ellipse(0, 40, 405, 235, -0.25, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  if (/mundo|globo|planeta/i.test(instruction)) {
    ctx.fillStyle = '#e3f0ee'; ctx.beginPath(); ctx.arc(0, 0, 270, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 9; ctx.stroke();
    for (const n of [-1, 0, 1]) {
      ctx.beginPath(); ctx.ellipse(0, 0, 75 + (n + 1) * 65, 270, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, n * 115, Math.sqrt(270 ** 2 - (n * 115) ** 2), 45, 0, 0, Math.PI * 2); ctx.stroke();
    }
  } else {
    ctx.rotate((-18 + index * 8) * Math.PI / 180);
    const gradient = ctx.createLinearGradient(-250, -200, 220, 250);
    gradient.addColorStop(0, '#f5fbff'); gradient.addColorStop(1, '#9dc8c8');
    ctx.fillStyle = gradient; ctx.strokeStyle = color; ctx.lineWidth = 8; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(345, -90); ctx.lineTo(30, -35); ctx.lineTo(-200, -265);
    ctx.lineTo(-278, -250); ctx.lineTo(-100, 5); ctx.lineTo(-300, 65); ctx.lineTo(-370, -15);
    ctx.lineTo(-420, 0); ctx.lineTo(-370, 150); ctx.lineTo(-305, 150); ctx.lineTo(-80, 90);
    ctx.lineTo(-150, 325); ctx.lineTo(-65, 290); ctx.lineTo(95, 40); ctx.lineTo(340, -35);
    ctx.quadraticCurveTo(420, -72, 345, -90); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(-235, 70); ctx.lineTo(260, -46); ctx.stroke();
    for (let n = 0; n < 6; n++) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(-140 + n * 53, 21 - n * 12, 8, 0, Math.PI * 2); ctx.fill(); }
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value)
    : reject(new Error('No se pudo codificar la imagen de prueba.')), 'image/png'));
  return { blob, width: canvas.width, height: canvas.height };
}
