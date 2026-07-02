/**
 * editorIcons — Catálogo de iconos GENÉRICOS para el Editor Visual.
 *
 * Cada icono es un SVG monocromo que usa `currentColor`, de modo que se recolorea
 * con el color del elemento en el editor. Se insertan como elemento movible y
 * redimensionable.
 *
 * Los iconos de MARCA (con branding Xending) NO viven aquí: se cargan desde el
 * Storage del negocio (carpeta `brand-icons/`) y el equipo los va surtiendo.
 */

export interface EditorIcon {
  id: string;
  name: string;        // etiqueta visible
  keywords: string;    // términos para el buscador
  group: 'social' | 'business';
  svg: string;         // SVG completo, con width/height 100% y currentColor
}

// Envoltorios para no repetir atributos.
const stroke = (inner: string) =>
  `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const solid = (inner: string) =>
  `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor">${inner}</svg>`;

export const EDITOR_ICONS: EditorIcon[] = [
  // ─── Sociales / marca (monocromo, recoloreable) ───────────────────────────
  {
    id: 'linkedin', name: 'LinkedIn', keywords: 'linkedin social red profesional', group: 'social',
    svg: solid('<path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/>'),
  },
  {
    id: 'instagram', name: 'Instagram', keywords: 'instagram insta social foto', group: 'social',
    svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" stroke="none"/></svg>',
  },
  {
    id: 'x', name: 'X (Twitter)', keywords: 'x twitter social tweet', group: 'social',
    svg: solid('<path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.46l8.6-9.83L0 1.15h7.6l5.24 6.93 6.06-6.93zm-1.29 19.5h2.04L6.49 3.24H4.3z"/>'),
  },
  {
    id: 'facebook', name: 'Facebook', keywords: 'facebook fb social meta', group: 'social',
    svg: solid('<path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.03 4.39 11.03 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8v8.44C19.61 23.1 24 18.1 24 12.07z"/>'),
  },
  {
    id: 'youtube', name: 'YouTube', keywords: 'youtube video social', group: 'social',
    svg: solid('<path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.5 15.5v-7l6.3 3.5-6.3 3.5z"/>'),
  },
  {
    id: 'whatsapp', name: 'WhatsApp', keywords: 'whatsapp wa chat mensaje', group: 'social',
    svg: solid('<path d="M.06 24l1.68-6.13A11.86 11.86 0 0 1 .16 11.9C.16 5.34 5.5 0 12.06 0a11.82 11.82 0 0 1 8.41 3.49 11.82 11.82 0 0 1 3.48 8.42c0 6.56-5.34 11.9-11.9 11.9a11.9 11.9 0 0 1-5.68-1.45L.06 24zM6.6 20.13c1.68.99 3.28 1.59 5.45 1.59 5.45 0 9.89-4.43 9.89-9.88a9.82 9.82 0 0 0-2.9-6.99 9.82 9.82 0 0 0-6.98-2.9c-5.46 0-9.9 4.44-9.9 9.89 0 2.28.67 3.99 1.79 5.79l-.99 3.62 3.64-.95zm11.36-5.66c-.07-.12-.27-.2-.57-.35-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.42.25-.7.25-1.29.17-1.42z"/>'),
  },
  {
    id: 'tiktok', name: 'TikTok', keywords: 'tiktok video social', group: 'social',
    svg: solid('<path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.08-.14 1.62.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>'),
  },

  // ─── Negocio / fintech (línea, recoloreable) ──────────────────────────────
  { id: 'phone',  name: 'Teléfono', keywords: 'telefono phone llamada contacto', group: 'business', svg: stroke('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>') },
  { id: 'mail',   name: 'Correo',   keywords: 'mail correo email arroba contacto', group: 'business', svg: stroke('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>') },
  { id: 'globe',  name: 'Web',      keywords: 'web globo mundo internet sitio', group: 'business', svg: stroke('<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>') },
  { id: 'map-pin',name: 'Ubicación',keywords: 'ubicacion pin mapa direccion location', group: 'business', svg: stroke('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>') },
  { id: 'check',  name: 'Check',    keywords: 'check palomita ok listo', group: 'business', svg: stroke('<path d="M20 6 9 17l-5-5"/>') },
  { id: 'check-circle', name: 'Check círculo', keywords: 'check circulo verificado ok', group: 'business', svg: stroke('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>') },
  { id: 'arrow-right', name: 'Flecha', keywords: 'flecha arrow derecha siguiente', group: 'business', svg: stroke('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>') },
  { id: 'star',   name: 'Estrella', keywords: 'estrella star favorito', group: 'business', svg: stroke('<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>') },
  { id: 'shield', name: 'Escudo',   keywords: 'escudo shield seguridad proteccion', group: 'business', svg: stroke('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>') },
  { id: 'lock',   name: 'Candado',  keywords: 'candado lock seguridad privado', group: 'business', svg: stroke('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>') },
  { id: 'trending-up', name: 'Tendencia', keywords: 'grafica tendencia crecimiento subir chart', group: 'business', svg: stroke('<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>') },
  { id: 'clock',  name: 'Reloj',    keywords: 'reloj tiempo hora clock', group: 'business', svg: stroke('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>') },
  { id: 'dollar', name: 'Dólar',    keywords: 'dolar dinero moneda precio pago money', group: 'business', svg: stroke('<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>') },
  { id: 'building', name: 'Edificio', keywords: 'edificio empresa oficina building', group: 'business', svg: stroke('<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/>') },
  { id: 'user',   name: 'Usuario',  keywords: 'usuario persona user perfil cliente', group: 'business', svg: stroke('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>') },
  { id: 'send',   name: 'Enviar / Avión', keywords: 'enviar avion envio send transferencia pago', group: 'business', svg: stroke('<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/>') },
  { id: 'route',  name: 'Ruta / Mapa', keywords: 'ruta mapa rutas camino trayecto route', group: 'business', svg: stroke('<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>') },
  { id: 'wallet', name: 'Billetera', keywords: 'billetera wallet pago tarjeta cartera', group: 'business', svg: stroke('<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5"/><path d="M18 12a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>') },
  { id: 'refresh', name: 'Cambio / Refresh', keywords: 'cambio divisas refresh intercambio fx swap', group: 'business', svg: stroke('<path d="M3 2v6h6"/><path d="M21 12A9 9 0 0 0 6 5.3L3 8"/><path d="M21 22v-6h-6"/><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/>') },
  { id: 'award',  name: 'Insignia', keywords: 'insignia premio award medalla calidad', group: 'business', svg: stroke('<circle cx="12" cy="8" r="6"/><path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5"/>') },
  { id: 'zap',    name: 'Rayo / Rápido', keywords: 'rayo rapido zap veloz instantaneo', group: 'business', svg: stroke('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>') },
];

// ─── Telegram (marca, monocromo) ─────────────────────────────────────────────
EDITOR_ICONS.push({
  id: 'telegram', name: 'Telegram', keywords: 'telegram social mensajeria', group: 'social',
  svg: solid('<path d="M23.9 3.6 20.3 20.5c-.27 1.2-.98 1.5-1.98.93l-5.47-4.03-2.64 2.54c-.29.29-.54.54-1.1.54l.39-5.56 10.12-9.14c.44-.39-.1-.61-.68-.22L6.94 13.5 1.5 11.8c-1.18-.37-1.2-1.18.25-1.75L22.38 2.1c.98-.36 1.84.22 1.52 1.5z"/>'),
});

