export const TEST_BUSINESS_ID = '62b2ce10-47be-4e2d-a9aa-14ab81790b42';
export const TEST_OTHER_BUSINESS_ID = 'ed29311c-95b1-4a77-a1c1-001cbb1fbc0c';
export const TEST_DRAFT_KEY = `xending-presentation-draft:${TEST_BUSINESS_ID}`;

function slideHtml(title: string, subtitle: string, accent: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif}
    .slide{position:relative;width:800px;height:450px;overflow:hidden;background:#f6f3ee;color:#142c39}
    .accent{position:absolute;left:48px;top:52px;width:56px;height:5px;background:${accent}}
    h1{position:absolute;left:48px;top:76px;width:700px;margin:0;font-size:44px;line-height:1.1}
    .subtitle{position:absolute;left:48px;top:162px;max-width:640px;margin:0;font-size:20px;color:#536570}
    .foot{position:absolute;left:48px;bottom:26px;font-size:13px;color:#536570}
    </style></head><body><main class="slide" data-slide-root>
    <div class="accent"></div><h1 data-eid="h1">${title}</h1>
    <p class="subtitle" data-eid="subtitle">${subtitle}</p><p class="foot">Biblioteca local · HTML editable</p>
    </main><script id="__ed_cfg" type="application/json">{"positions":{},"styles":{}}</script></body></html>`;
}

/** Intentionally legacy-shaped: mounting the actual page must create stable IDs and revisions. */
export const TEST_SLIDES = [
  { title: 'Prueba local: portada', html: slideHtml('Un mundo de ideas', 'Esta portada conserva texto y recibe una pieza reutilizable.', '#ee7853') },
  { title: 'Prueba local: segunda página', html: slideHtml('Segunda página activa', 'Este contenido debe aparecer en la exportación del deck.', '#159c91') },
];

export function seedDraft(): void {
  // Reload must read the real saved deck, not reconstruct a successful fixture.
  if (localStorage.getItem(TEST_DRAFT_KEY) === null) {
    localStorage.setItem(TEST_DRAFT_KEY, JSON.stringify(TEST_SLIDES));
  }
}
