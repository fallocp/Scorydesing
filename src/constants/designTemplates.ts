/**
 * Static HTML templates for design pieces.
 * Placeholders: {{headline}}, {{subcopy}}, {{cta}}, {{imageUrl}},
 * {{punchline}}, {{disclaimer}}, {{floating}}, {{statText}}
 *
 * "ai" = Claude generates everything (original flow, needs API call).
 * Others = instant string replacement, no API call for structure.
 */

export interface DesignTemplate {
  id: string;
  name: string;
  emoji: string;
  description: string;
  needsImage: boolean;
  /** null = use Claude AI (original flow) */
  html: string | null;
}

const LOGO_URL = 'https://gdfhytvjnzdovjfovqfv.supabase.co/storage/v1/object/sign/Brand/Xending%20bola%20logoabril26.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8zNDdhNjgwZi1hZGU3LTQ3OGYtYjdkNy1kMGY5YzJjMDc4NDEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJCcmFuZC9YZW5kaW5nIGJvbGEgbG9nb2FicmlsMjYucG5nIiwiaWF0IjoxNzc3MTU1Nzg2LCJleHAiOjE4MDg2OTE3ODZ9.8ZrGD1_TGdtzJn5lSP3X3pvlqvFV-mfgwxLySRQUO3U';

const FONTS = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap';

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

// ─── Shared HTML skeleton (same structure for all static templates) ───

function buildTemplate(styles: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <link href="${FONTS}" rel="stylesheet">
  <style>
    ${styles}
  </style>
</head>
<body>
  <div class="story">
    <div class="bg-mesh"></div>
    <div class="grain"></div>
    <div class="card">
      <div class="logo-row">
        <img class="logo" src="${LOGO_URL}" />
        <span class="wordmark">xending</span>
      </div>
      <h1 class="headline">{{headline}}</h1>
      <p class="subcopy">{{subcopy}}</p>
      <div class="photo-wrapper">
        <img class="photo" src="{{imageUrl}}" />
        <div class="floating-element" style="{{floatingDisplay}}">{{floating}}</div>
      </div>
      <div class="promoter-overlay" style="{{promoterDisplay}}">
        <div class="promoter-photo-ring">
          <img class="promoter-photo" src="{{promoterPhoto}}" />
        </div>
        <div class="promoter-name">{{promoterName}}</div>
        <div class="promoter-role">{{promoterRole}}</div>
      </div>
      <div class="stat-pill">
        <span class="stat-dot"></span>
        <span>{{statText}}</span>
      </div>
      <div class="accent-bar"></div>
    </div>
    <div class="footer">
      <h2 class="punchline">{{punchline}}</h2>
      <button class="cta">{{cta}}</button>
      <p class="disclaimer">{{disclaimer}}</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Shared CSS (same for all templates) ───

const SHARED_CSS = `
    .story { width: 1080px; height: 1920px; position: relative; overflow: hidden; }
    .bg-mesh { position: absolute; inset: 0; }
    .grain { position: absolute; inset: 0; opacity: 0.08; mix-blend-mode: multiply; pointer-events: none;
      background-image: ${GRAIN}; }
    .card { position: absolute; top: 160px; left: 50px; right: 50px; border-radius: 44px;
      padding: 60px 70px 40px; overflow: visible; }
    .logo-row { display: flex; align-items: center; gap: 20px; margin-bottom: 40px; }
    .logo { width: 80px; height: 80px; object-fit: contain; }
    .wordmark { font-family: 'Inter', sans-serif; font-weight: 700; font-size: 42px; }
    .headline { font-family: 'Fraunces', serif; font-weight: 600; font-size: 68px;
      line-height: 1.0; margin-bottom: 30px; }
    .accent-coral { font-style: italic; background: linear-gradient(135deg, #FF7A4A, #E85A2C);
      -webkit-background-clip: text; background-clip: text; color: transparent; }
    .accent-tq { font-style: italic; background: linear-gradient(135deg, #2ED4C7, #1FB8AC);
      -webkit-background-clip: text; background-clip: text; color: transparent; }
    .subcopy { font-family: 'Inter', sans-serif; font-size: 26px; line-height: 1.4;
      margin-bottom: 40px; }
    .photo-wrapper { position: relative; overflow: visible; margin-bottom: 30px; }
    .photo { width: 100%; height: 700px; object-fit: cover; object-position: center top;
      border-radius: 20px; }
    .floating-element { position: absolute; z-index: 10; top: 30px; right: 30px;
      background: rgba(255,255,255,0.95); backdrop-filter: blur(12px);
      border-radius: 16px; padding: 20px 28px;
      border: 1px solid rgba(255,255,255,0.3);
      box-shadow: 0 8px 32px rgba(0,0,0,0.12); }
    .floating-element .label { font-family: 'JetBrains Mono', monospace; font-size: 12px;
      color: #888; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px; }
    .floating-element .value { font-family: 'Inter', sans-serif; font-weight: 700;
      font-size: 24px; color: #2ED4C7; }
    .floating-element .trend { width: 8px; height: 8px; background: #FF7A4A;
      border-radius: 50%; display: inline-block; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .stat-pill { display: none; align-items: center; gap: 14px;
      padding: 18px 26px; border-radius: 100px; margin-top: 16px; }
    .stat-dot { width: 10px; height: 10px; border-radius: 50%; }
    .accent-bar { display: none; height: 3px; margin-top: 12px; }
    .footer { position: absolute; bottom: 50px; left: 70px; right: 70px; text-align: center; }
    .punchline { font-family: 'Fraunces', serif; font-weight: 600; font-size: 48px;
      margin-bottom: 30px; }
    .cta { display: inline-flex; align-items: center; gap: 14px; padding: 24px 40px;
      border-radius: 100px; border: none; font-family: 'Inter', sans-serif;
      font-weight: 600; font-size: 24px; cursor: pointer; }
    .disclaimer { font-family: 'Inter', sans-serif; font-size: 14px; margin-top: 16px; }
    /* Promoter overlay base styles (hidden by default via {{promoterDisplay}}) */
    .promoter-overlay { display: flex; flex-direction: column; align-items: center; gap: 6px;
      margin-top: 12px; }
    .promoter-photo-ring { width: 170px; height: 170px; border-radius: 50%;
      background: linear-gradient(135deg, #2ED4C7, #1FB8AC, #FF7A4A);
      padding: 5px; box-shadow: 0 12px 40px rgba(0,0,0,0.2), 0 4px 16px rgba(46,212,199,0.3); }
    .promoter-photo { width: 100%; height: 100%; border-radius: 50%; object-fit: cover;
      border: 4px solid #fff; }
    .promoter-name { font-family: 'Inter', sans-serif; font-weight: 700; font-size: 28px; color: #0F1419;
      text-align: center; margin-top: 4px;
      text-shadow: 0 1px 8px rgba(255,255,255,0.8); }
    .promoter-role { font-family: 'Inter', sans-serif; font-size: 18px; color: #2ED4C7; font-weight: 600;
      text-align: center; letter-spacing: 0.3px;
      text-shadow: 0 1px 8px rgba(255,255,255,0.8); }
`;

// ─── Card Light (cream background, white card) ───

const CARD_LIGHT_CSS = SHARED_CSS + `
    .story { background: #F5F3F0; }
    .bg-mesh { background:
      radial-gradient(ellipse 800px 600px at 90% 10%, rgba(255,120,70,0.18) 0%, transparent 60%),
      radial-gradient(ellipse 900px 700px at 5% 95%, rgba(46,212,199,0.22) 0%, transparent 60%),
      radial-gradient(ellipse 500px 400px at 50% 50%, rgba(255,255,255,0.7) 0%, transparent 70%),
      linear-gradient(180deg, #F8F5F1 0%, #EEEBE5 100%); }
    .card { background: #fff;
      box-shadow: 0 2px 4px rgba(0,0,0,0.02), 0 30px 70px rgba(255,120,70,0.1), 0 50px 120px rgba(46,212,199,0.08); }
    .wordmark { color: #1a1a1a; }
    .headline { color: #0F1419; }
    .subcopy { color: #555; }
    .stat-pill { background: rgba(46,212,199,0.08); }
    .stat-pill span { color: #0F1419; font-family: 'Inter', sans-serif; font-weight: 600; font-size: 18px; }
    .stat-dot { background: #2ED4C7; box-shadow: 0 0 12px rgba(46,212,199,0.8); }
    .accent-bar { background: linear-gradient(90deg, #FF7A4A, #2ED4C7); }
    .punchline { color: #0F1419; }
    .cta { background: linear-gradient(135deg, #FF7A4A, #E85A2C); color: #fff; }
    .disclaimer { color: #999; }
`;

// ─── Card Dark (navy background, dark card) ───

const CARD_DARK_CSS = SHARED_CSS + `
    .story { background: #0F1419; }
    .bg-mesh { background:
      radial-gradient(ellipse 800px 600px at 80% 20%, rgba(255,120,70,0.1) 0%, transparent 60%),
      radial-gradient(ellipse 900px 700px at 10% 80%, rgba(46,212,199,0.12) 0%, transparent 60%),
      radial-gradient(ellipse 600px 600px at 50% 50%, rgba(255,255,255,0.03) 0%, transparent 70%); }
    .card { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 2px 4px rgba(0,0,0,0.1), 0 30px 70px rgba(0,0,0,0.3); }
    .wordmark { color: #fff; }
    .headline { color: #FFFFFF; }
    .subcopy { color: rgba(255,255,255,0.7); }
    .floating-element { background: rgba(15,20,25,0.9); border: 1px solid rgba(46,212,199,0.2); }
    .floating-element .label { color: rgba(255,255,255,0.5); }
    .floating-element .value { color: #2ED4C7; }
    .stat-pill { background: rgba(255,255,255,0.06); }
    .stat-pill span { color: #fff; font-family: 'Inter', sans-serif; font-weight: 600; font-size: 18px; }
    .stat-dot { background: #2ED4C7; box-shadow: 0 0 12px rgba(46,212,199,0.8); }
    .accent-bar { background: linear-gradient(90deg, #FF7A4A, #2ED4C7); }
    .punchline { color: #FFFFFF; }
    .cta { background: linear-gradient(135deg, #2ED4C7, #1FB8AC); color: #0F1419; font-weight: 700; }
    .disclaimer { color: rgba(255,255,255,0.35); }
`;

// ─── Card Coral (warm coral gradient background) ───

const CARD_CORAL_CSS = SHARED_CSS + `
    .story { background: #FFF5F2; }
    .bg-mesh { background:
      radial-gradient(ellipse 900px 700px at 85% 15%, rgba(255,120,70,0.28) 0%, transparent 55%),
      radial-gradient(ellipse 800px 600px at 10% 85%, rgba(46,212,199,0.15) 0%, transparent 60%),
      radial-gradient(ellipse 600px 500px at 50% 50%, rgba(255,255,255,0.6) 0%, transparent 70%),
      linear-gradient(160deg, #FFF5F2 0%, #FFE8E0 50%, #FFF0EB 100%); }
    .card { background: #fff;
      box-shadow: 0 2px 4px rgba(0,0,0,0.02), 0 30px 70px rgba(255,120,70,0.15), 0 50px 120px rgba(255,120,70,0.08); }
    .wordmark { color: #1a1a1a; }
    .headline { color: #0F1419; }
    .subcopy { color: #555; }
    .floating-element { background: linear-gradient(135deg, #FF7A4A, #E85A2C); border: none; }
    .floating-element .label { color: rgba(255,255,255,0.8); }
    .floating-element .value { color: #FFFFFF; }
    .floating-element .trend { background: #fff; }
    .stat-pill { background: rgba(255,120,70,0.08); }
    .stat-pill span { color: #0F1419; font-family: 'Inter', sans-serif; font-weight: 600; font-size: 18px; }
    .stat-dot { background: #FF7A4A; box-shadow: 0 0 12px rgba(255,120,70,0.8); }
    .accent-bar { background: linear-gradient(90deg, #FF7A4A, #E85A2C); }
    .punchline { color: #0F1419; }
    .cta { background: linear-gradient(135deg, #0F1419, #1a2332); color: #fff; }
    .disclaimer { color: #999; }
`;

// ─── Card Turquesa (turquoise accent background) ───

const CARD_TURQUESA_CSS = SHARED_CSS + `
    .story { background: #F0FDFB; }
    .bg-mesh { background:
      radial-gradient(ellipse 900px 700px at 15% 20%, rgba(46,212,199,0.25) 0%, transparent 55%),
      radial-gradient(ellipse 800px 600px at 85% 80%, rgba(255,120,70,0.12) 0%, transparent 60%),
      radial-gradient(ellipse 600px 500px at 50% 50%, rgba(255,255,255,0.6) 0%, transparent 70%),
      linear-gradient(160deg, #F0FDFB 0%, #E6FAF7 50%, #F0FDFB 100%); }
    .card { background: #fff;
      box-shadow: 0 2px 4px rgba(0,0,0,0.02), 0 30px 70px rgba(46,212,199,0.12), 0 50px 120px rgba(46,212,199,0.06); }
    .wordmark { color: #1a1a1a; }
    .headline { color: #0F1419; }
    .subcopy { color: #555; }
    .floating-element { background: linear-gradient(135deg, #2ED4C7, #1FB8AC); border: none; }
    .floating-element .label { color: rgba(255,255,255,0.8); }
    .floating-element .value { color: #FFFFFF; }
    .floating-element .trend { background: #fff; }
    .stat-pill { background: rgba(46,212,199,0.08); }
    .stat-pill span { color: #0F1419; font-family: 'Inter', sans-serif; font-weight: 600; font-size: 18px; }
    .stat-dot { background: #2ED4C7; box-shadow: 0 0 12px rgba(46,212,199,0.8); }
    .accent-bar { background: linear-gradient(90deg, #2ED4C7, #1FB8AC); }
    .punchline { color: #0F1419; }
    .cta { background: linear-gradient(135deg, #2ED4C7, #1FB8AC); color: #0F1419; font-weight: 700; }
    .disclaimer { color: #999; }
`;

// ─── Card Navy Gradient (deep navy with subtle gradient) ───

const CARD_NAVY_CSS = SHARED_CSS + `
    .story { background: #0a1628; }
    .bg-mesh { background:
      radial-gradient(ellipse 800px 600px at 70% 10%, rgba(46,212,199,0.15) 0%, transparent 60%),
      radial-gradient(ellipse 900px 700px at 20% 90%, rgba(255,120,70,0.08) 0%, transparent 60%),
      linear-gradient(180deg, #0a1628 0%, #0F1419 50%, #0a1628 100%); }
    .card { background: linear-gradient(145deg, rgba(46,212,199,0.08), rgba(255,255,255,0.03));
      border: 1px solid rgba(46,212,199,0.15);
      box-shadow: 0 2px 4px rgba(0,0,0,0.2), 0 30px 70px rgba(0,0,0,0.4); }
    .wordmark { color: #2ED4C7; }
    .headline { color: #FFFFFF; }
    .subcopy { color: rgba(255,255,255,0.65); }
    .floating-element { background: rgba(46,212,199,0.15); border: 1px solid rgba(46,212,199,0.3); }
    .floating-element .label { color: rgba(255,255,255,0.5); }
    .floating-element .value { color: #2ED4C7; }
    .stat-pill { background: rgba(46,212,199,0.08); }
    .stat-pill span { color: #2ED4C7; font-family: 'Inter', sans-serif; font-weight: 600; font-size: 18px; }
    .stat-dot { background: #FF7A4A; box-shadow: 0 0 12px rgba(255,120,70,0.8); }
    .accent-bar { background: linear-gradient(90deg, #2ED4C7, #FF7A4A); }
    .punchline { color: #FFFFFF; }
    .cta { background: linear-gradient(135deg, #FF7A4A, #E85A2C); color: #fff; }
    .disclaimer { color: rgba(255,255,255,0.3); }
`;


// ─── Promoter template (overlap: photo bridges card and footer) ───

// buildPromoterTemplate removed — buildTemplate now includes promoter HTML for all templates

const PROMOTER_CSS = SHARED_CSS + `
    .story { background: #F5F3F0; position: relative; }
    .bg-mesh { background:
      radial-gradient(ellipse 800px 600px at 90% 10%, rgba(255,120,70,0.18) 0%, transparent 60%),
      radial-gradient(ellipse 900px 700px at 5% 95%, rgba(46,212,199,0.22) 0%, transparent 60%),
      radial-gradient(ellipse 500px 400px at 50% 50%, rgba(255,255,255,0.7) 0%, transparent 70%),
      linear-gradient(180deg, #F8F5F1 0%, #EEEBE5 100%); }
    .card { position: absolute; top: 48px; left: 50px; right: 50px;
      border-radius: 44px; padding: 44px 56px 44px; overflow: visible; background: #fff;
      box-shadow: 0 2px 4px rgba(0,0,0,0.02), 0 30px 70px rgba(255,120,70,0.1), 0 50px 120px rgba(46,212,199,0.08);
      z-index: 2; }
    .wordmark { color: #1a1a1a; font-size: 36px; }
    .logo-row { margin-bottom: 24px; }
    .logo { width: 64px; height: 64px; }
    .headline { color: #0F1419; font-size: 50px; margin-bottom: 12px; }
    .subcopy { color: #555; font-size: 21px; margin-bottom: 20px; }
    .photo-wrapper { position: relative; overflow: visible; margin-bottom: 0; }
    .photo { width: 100%; height: 920px; object-fit: cover; object-position: center top; border-radius: 20px; }
    .stat-pill { display: none; }
    .promoter-overlay { position: absolute; z-index: 10;
      bottom: -60px; left: 50%; transform: translate(-166px, 308px);
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      height: 371px; }
    .promoter-photo-ring { width: 170px; height: 170px; border-radius: 50%;
      background: linear-gradient(135deg, #2ED4C7, #1FB8AC, #FF7A4A);
      padding: 5px; box-shadow: 0 12px 40px rgba(0,0,0,0.2), 0 4px 16px rgba(46,212,199,0.3); }
    .promoter-photo { width: 100%; height: 100%; border-radius: 50%; object-fit: cover;
      border: 4px solid #fff; }
    .promoter-name { font-family: 'Inter', sans-serif; font-weight: 700; font-size: 28px; color: #0F1419;
      text-align: center; margin-top: 4px;
      text-shadow: 0 1px 8px rgba(255,255,255,0.8); }
    .promoter-role { font-family: 'Inter', sans-serif; font-size: 18px; color: #2ED4C7; font-weight: 600;
      text-align: center; letter-spacing: 0.3px;
      text-shadow: 0 1px 8px rgba(255,255,255,0.8); }
    .footer { position: absolute; bottom: 50px; left: 70px; right: 70px;
      text-align: center; z-index: 2; }
    .punchline { color: #0F1419; font-size: 44px; margin-bottom: 22px; }
    .cta { background: linear-gradient(135deg, #FF7A4A, #E85A2C); color: #fff;
      padding: 26px 44px; font-size: 26px; }
    .disclaimer { color: #999; }
`;

// ─── Promoter overlay CSS for story format (injected only when promoter is active) ───
const PROMOTER_STORY_INJECT = `
    /* Promoter active: compact card + promoter overlay */
    .card { top: 48px; padding: 44px 56px 44px; }
    .logo { width: 64px; height: 64px; }
    .wordmark { font-size: 36px; }
    .logo-row { margin-bottom: 24px; }
    .headline { font-size: 50px; margin-bottom: 12px; }
    .subcopy { font-size: 21px; margin-bottom: 20px; }
    .photo-wrapper { margin-bottom: 0; }
    .photo { height: 920px; }
    .stat-pill { display: none; }
    .promoter-overlay { position: absolute; z-index: 10;
      bottom: -60px; left: 50%; transform: translate(-190px, 271px);
      flex-direction: column; align-items: center; gap: 6px;
      height: 371px; }
    .promoter-photo-ring { width: 170px; height: 170px; padding: 5px; }
    .promoter-photo { border: 4px solid #fff; }
    .promoter-name { font-size: 28px; margin-top: 4px; }
    .promoter-role { font-size: 18px; }
    .punchline { font-size: 44px; margin-bottom: 22px; }
    .cta { padding: 26px 44px; font-size: 26px; }
`;

export { PROMOTER_STORY_INJECT };

// ─── Export all templates ───

export const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    id: 'ai',
    name: 'IA Creativo',
    emoji: '✨',
    description: 'Claude genera diseño único',
    needsImage: true,
    html: null, // Claude generates everything
  },
  {
    id: 'card-light',
    name: 'Card Light',
    emoji: '📐',
    description: 'Fondo cream, card blanca',
    needsImage: true,
    html: buildTemplate(CARD_LIGHT_CSS),
  },
  {
    id: 'card-dark',
    name: 'Card Dark',
    emoji: '🌙',
    description: 'Fondo navy, estilo premium',
    needsImage: true,
    html: buildTemplate(CARD_DARK_CSS),
  },
  {
    id: 'card-coral',
    name: 'Card Coral',
    emoji: '🔥',
    description: 'Fondo coral cálido',
    needsImage: true,
    html: buildTemplate(CARD_CORAL_CSS),
  },
  {
    id: 'card-turquesa',
    name: 'Card Turquesa',
    emoji: '💎',
    description: 'Fondo turquesa fresco',
    needsImage: true,
    html: buildTemplate(CARD_TURQUESA_CSS),
  },
  {
    id: 'card-navy',
    name: 'Card Navy',
    emoji: '🌊',
    description: 'Navy profundo con turquesa',
    needsImage: true,
    html: buildTemplate(CARD_NAVY_CSS),
  },
];

export function getTemplateById(id: string): DesignTemplate | undefined {
  return DESIGN_TEMPLATES.find((t) => t.id === id);
}

/**
 * Auto-apply accent colors to key words in text.
 * Alternates between accent-coral and accent-tq on important words.
 * Wraps words that match financial/action keywords in accent spans.
 */
// Priority HIGH: nouns, key business concepts — these get colored first
const ACCENT_KEYWORDS_HIGH = [
  // Financial terms
  'tipo', 'cambio', 'dólares', 'pesos', 'USD', 'MXN', 'margen', 'utilidad',
  'ahorro', 'comisión', 'comisiones', 'fees', 'cobertura', 'crédito', 'factoraje', 'línea',
  'pago', 'pagos', 'transferencia', 'transferencias', 'cobro', 'cobros',
  'costo', 'costos', 'desglose', 'capas', 'spread',
  'divisas', 'moneda', 'monedas', 'capital', 'liquidez', 'financiamiento',
  // Business / logistics nouns
  'banco', 'bancos', 'proveedor', 'proveedores', 'embarque', 'embarques', 'mercancía',
  'producción', 'importación', 'exportación', 'contenedor', 'contenedores',
  'factura', 'facturas', 'operación', 'operaciones', 'tesorería',
  'cliente', 'clientes', 'negocio', 'empresa',
  // Multidivisa / control terms
  'cuentas', 'cuenta', 'saldos', 'visibilidad', 'conciliación', 'conciliar',
  'plataforma', 'global', 'centralizar', 'multidivisa', 'trazabilidad',
  // Cobertura / volatilidad terms
  'volatilidad', 'protección', 'presupuesto', 'riesgo',
  // Control operativo terms
  'orden', 'errores', 'manual', 'manuales', 'automatización',
  // Descriptors
  'rápido', 'gratis', 'digital', 'hábil', 'mismo', 'día', 'hoy',
  'mejor', 'seguro', 'fijo', 'garantizado', 'agilidad', 'rapidez',
  'control', 'transparencia', 'confianza', 'eficiencia',
];

// Priority LOW: verbs, actions — only colored if slots remain after HIGH
const ACCENT_KEYWORDS_LOW = [
  'protege', 'asegura', 'cotiza', 'envía', 'abre', 'pacta', 'ahorra', 'compara',
  'cubre', 'simplifica', 'acelera', 'garantiza', 'optimiza', 'confirma', 'espera',
  'libera', 'recibe', 'valida', 'evalúa', 'controla', 'gestiona', 'reduce',
  'centraliza', 'consolida', 'fragmenta', 'dispersa', 'concilia',
];

function autoAccentText(text: string, maxAccents: number = 2): string {
  // If text already has accent spans, return as-is
  if (text.includes('accent-coral') || text.includes('accent-tq')) return text;

  const words = text.split(/(\s+)/);

  // First pass: find positions of HIGH priority keywords
  const highPositions: number[] = [];
  const lowPositions: number[] = [];

  words.forEach((word, i) => {
    const cleanWord = word.replace(/[.,;:!?¿¡]/g, '').toLowerCase();
    if (ACCENT_KEYWORDS_HIGH.some((kw) => cleanWord === kw.toLowerCase())) {
      highPositions.push(i);
    } else if (ACCENT_KEYWORDS_LOW.some((kw) => cleanWord === kw.toLowerCase())) {
      lowPositions.push(i);
    }
  });

  // Pick positions: HIGH first, then LOW to fill remaining slots
  let selectedPositions = [
    ...highPositions.slice(0, maxAccents),
    ...lowPositions.slice(0, Math.max(0, maxAccents - highPositions.length)),
  ].slice(0, maxAccents);

  // Fallback: if fewer keywords matched than maxAccents, fill remaining slots with substantive words
  // Only if the text has enough substantive words (>4) to avoid over-saturating short phrases
  if (selectedPositions.length < maxAccents) {
    const skipWords = new Set([
      'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
      'de', 'del', 'en', 'con', 'por', 'para', 'a', 'al',
      'que', 'no', 'es', 'se', 'su', 'sus', 'tu', 'tus',
      'y', 'o', 'ni', 'si', 'lo', 'le', 'les', 'me', 'te',
      'sin', 'ser', 'son', 'fue', 'hay', 'más', 'muy',
    ]);

    // Count substantive words in the text
    const substantiveWords = words.filter((w) => {
      const clean = w.replace(/[.,;:!?¿¡]/g, '').toLowerCase().trim();
      return clean.length >= 4 && !skipWords.has(clean);
    });

    // Only fill extra slots if text has enough substance (>4 substantive words)
    // or if we have 0 matches (always need at least 1 accent)
    const shouldFill = selectedPositions.length === 0 || substantiveWords.length > 4;

    if (shouldFill) {
      for (let i = 0; i < words.length && selectedPositions.length < maxAccents; i++) {
        if (selectedPositions.includes(i)) continue;
        const cleanWord = words[i].replace(/[.,;:!?¿¡]/g, '').toLowerCase().trim();
        if (cleanWord.length >= 4 && !skipWords.has(cleanWord)) {
          selectedPositions.push(i);
        }
      }
    }
  }

  // Apply accent classes alternating coral/tq
  let usesCoral = true;
  const result = words.map((word, i) => {
    if (selectedPositions.includes(i)) {
      const cls = usesCoral ? 'accent-coral' : 'accent-tq';
      usesCoral = !usesCoral;
      return `<span class="${cls}">${word}</span>`;
    }
    return word;
  });

  return result.join('');
}

/**
 * Fill a static template with actual content.
 * Auto-applies accent colors to headline and punchline keywords.
 */
// ─── Format-specific CSS overrides ───
// These override the base Story layout (1080x1920) for other formats.

const FORMAT_OVERRIDES: Record<string, string> = {
  'instagram-story': '', // promoter styles injected conditionally via PROMOTER_STORY_INJECT

  'instagram-post': `
    .story { width: 1080px; height: 1080px; }
    .card { top: 40px; left: 40px; right: 40px; padding: 40px 50px 30px; border-radius: 32px; }
    .logo { width: 56px; height: 56px; }
    .wordmark { font-size: 32px; }
    .logo-row { margin-bottom: 24px; gap: 14px; }
    .headline { font-size: 44px; margin-bottom: 16px; }
    .subcopy { font-size: 20px; margin-bottom: 20px; }
    .photo { height: 380px; border-radius: 16px; object-position: center center; }
    .photo-wrapper { margin-bottom: 16px; }
    .floating-element { padding: 14px 20px; border-radius: 12px; top: 16px; right: 16px; }
    .floating-element .label { font-size: 10px; margin-bottom: 4px; }
    .floating-element .value { font-size: 18px; }
    .stat-pill { display: none; }
    .accent-bar { display: none; }
    .footer { bottom: 24px; left: 50px; right: 50px; }
    .punchline { font-size: 30px; margin-bottom: 16px; }
    .cta { padding: 16px 28px; font-size: 18px; border-radius: 80px; }
    .disclaimer { font-size: 11px; margin-top: 10px; }
    /* Promoter overlay for square format */
    .promoter-overlay { position: absolute; z-index: 10; bottom: -40px; left: 50%;
      transform: translateX(-50%); height: auto;
      display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .promoter-photo-ring { width: 80px; height: 80px; padding: 3px; }
    .promoter-photo { border: 2px solid #fff; }
    .promoter-name { font-size: 16px; margin-top: 2px; }
    .promoter-role { font-size: 12px; }
  `,

  'linkedin-post': `
    .story { width: 1200px; height: 628px; position: relative; overflow: hidden; }
    .bg-mesh { position: absolute; inset: 0; }
    .grain { position: absolute; inset: 0; }
    .card { position: absolute; top: 8px; left: 8px; width: 52%; height: 620px;
      border-radius: 0; padding: 24px 28px 16px; display: flex; flex-direction: column; justify-content: flex-start;
      box-shadow: none; background: inherit; }
    .logo { width: 36px; height: 36px; }
    .wordmark { font-size: 22px; }
    .logo-row { margin-bottom: 10px; gap: 10px; }
    .headline { font-size: 32px; margin-bottom: 10px; line-height: 1.1; max-width: 95%; }
    .subcopy { font-size: 19px; margin-bottom: 0; line-height: 45.4px; max-width: 88%; color: #444; }
    .photo-wrapper { display: none; }
    .floating-element { display: none; }
    .stat-pill { display: none; }
    .accent-bar { display: none; }
    .footer { position: absolute; bottom: 16px; left: 28px; right: auto; width: 48%; text-align: center; }
    .punchline { font-size: 24px; margin-bottom: 12px; line-height: 1.4; }
    .cta { padding: 14px 28px; font-size: 18px; border-radius: 80px; }
    .disclaimer { font-size: 9px; margin-top: 8px; line-height: 1.3; }
    .story::after {
      content: ''; position: absolute; top: 0; right: 0; width: 48%; height: 100%;
      background-image: var(--bg-photo); background-size: cover; background-position: center;
    }
    /* Promoter overlay for horizontal format */
    .promoter-overlay { z-index: 10; position: absolute; left: 50%;
      flex-direction: column; align-items: center; gap: 4px;
      transform: translate(-148px, 287px); }
    .promoter-photo-ring { width: 100px; height: 100px; padding: 3px; }
    .promoter-photo { border: 3px solid #fff; }
    .promoter-name { font-size: 18px; margin-top: 2px; }
    .promoter-role { font-size: 13px; }
  `,

  'banner': `
    .story { width: 1920px; height: 1080px; display: flex; flex-direction: row; }
    .bg-mesh { position: absolute; inset: 0; }
    .grain { position: absolute; inset: 0; }
    .card { position: relative; top: 0; left: 0; right: auto; width: 50%; height: 100%;
      border-radius: 0; padding: 60px 70px 40px; display: flex; flex-direction: column; justify-content: center; }
    .logo { width: 64px; height: 64px; }
    .wordmark { font-size: 36px; }
    .logo-row { margin-bottom: 30px; gap: 16px; }
    .headline { font-size: 52px; margin-bottom: 20px; }
    .subcopy { font-size: 22px; margin-bottom: 24px; }
    .photo-wrapper { display: none; }
    .stat-pill { padding: 14px 22px; margin-top: 10px; }
    .stat-pill span { font-size: 16px; }
    .accent-bar { height: 3px; margin-top: 10px; }
    .footer { position: absolute; bottom: 40px; left: 70px; right: auto; width: 45%; text-align: left; }
    .punchline { font-size: 32px; margin-bottom: 20px; }
    .cta { padding: 20px 36px; font-size: 20px; border-radius: 80px; }
    .disclaimer { font-size: 12px; margin-top: 12px; }
    .story::after {
      content: ''; position: absolute; top: 0; right: 0; width: 50%; height: 100%;
      background-image: var(--bg-photo); background-size: cover; background-position: center;
    }
  `,
};

export function fillTemplate(
  templateHtml: string,
  data: {
    headline: string;
    subcopy: string;
    cta: string;
    imageUrl: string;
    punchline: string;
    disclaimer: string;
    floating?: string;
    statText?: string;
    promoterName?: string;
    promoterRole?: string;
    promoterPhoto?: string;
    // Bulletin-specific fields
    category?: string;
    dataLabel?: string;
    dataValue?: string;
    source?: string;
    bgImageUrl?: string;
  },
  format?: string,
): string {
  const defaultFloating = '';
  const defaultStat = 'Cobertura cambiaria disponible';

  const accentedHeadline = autoAccentText(data.headline, 2);
  const accentedPunchline = autoAccentText(data.punchline, 2);

  // Dynamic font-size for subcopy based on word count (only for story/post, not linkedin/banner)
  const subcopyWordCount = data.subcopy.trim().split(/\s+/).length;
  let subcopyStyle = '';
  if (format === 'instagram-post') {
    if (subcopyWordCount > 50) {
      subcopyStyle = ' style="font-size: 0.85em;"';
    } else if (subcopyWordCount > 35) {
      subcopyStyle = ' style="font-size: 0.92em;"';
    }
  }

  let result = templateHtml
    .replace(/\{\{headline\}\}/g, accentedHeadline)
    .replace(/<p class="subcopy">\{\{subcopy\}\}<\/p>/g, `<p class="subcopy"${subcopyStyle}>${data.subcopy}</p>`)
    .replace(/\{\{cta\}\}/g, data.cta)
    .replace(/\{\{imageUrl\}\}/g, data.imageUrl)
    .replace(/\{\{punchline\}\}/g, accentedPunchline)
    .replace(/\{\{disclaimer\}\}/g, data.disclaimer)
    .replace(/\{\{floating\}\}/g, data.floating || defaultFloating)
    .replace(/\{\{floatingDisplay\}\}/g, data.floating ? '' : 'display:none')
    .replace(/\{\{statText\}\}/g, data.statText || defaultStat)
    .replace(/\{\{promoterName\}\}/g, data.promoterName || 'Fernando Arroyo')
    .replace(/\{\{promoterRole\}\}/g, data.promoterRole || 'Asesor de pagos internacionales')
    .replace(/\{\{promoterPhoto\}\}/g, data.promoterPhoto || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')
    .replace(/\{\{promoterDisplay\}\}/g, data.promoterPhoto ? '' : 'display:none')
    .replace(/\{\{category\}\}/g, data.category || 'NOTICIA')
    .replace(/\{\{dataLabel\}\}/g, data.dataLabel || '')
    .replace(/\{\{dataValue\}\}/g, data.dataValue || '')
    .replace(/\{\{dataDisplay\}\}/g, data.dataValue ? '' : 'display:none')
    .replace(/\{\{source\}\}/g, data.source || '')
    .replace(/\{\{bgImageUrl\}\}/g, data.bgImageUrl || '')
    .replace(/\{\{bgImageDisplay\}\}/g, data.bgImageUrl ? '' : 'display:none');

  // Inject format-specific CSS overrides
  if (format && FORMAT_OVERRIDES[format]) {
    const overrideCss = FORMAT_OVERRIDES[format];
    // For horizontal formats, set the photo as CSS background variable
    if (['linkedin-post', 'banner'].includes(format)) {
      result = result.replace(
        '</style>',
        `\n    /* Format override: ${format} */\n    ${overrideCss}\n    .story { --bg-photo: url("${data.imageUrl}"); }\n  </style>`
      );
    } else {
      result = result.replace(
        '</style>',
        `\n    /* Format override: ${format} */\n    ${overrideCss}\n  </style>`
      );
    }
  }

  // Inject promoter-specific layout override for story format
  if (data.promoterPhoto && (!format || format === 'instagram-story')) {
    result = result.replace(
      '</style>',
      `\n    ${PROMOTER_STORY_INJECT}\n  </style>`
    );
  }

  return result;
}
