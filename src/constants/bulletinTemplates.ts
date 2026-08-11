/**
 * Bulletin templates — same card layout as campaign templates but with
 * data highlight + category badge instead of photo.
 * Card stretches to fill the story and content is vertically centered.
 */

import type { DesignTemplate } from '@/constants/designTemplates';

const LOGO_URL = 'https://gdfhytvjnzdovjfovqfv.supabase.co/storage/v1/object/sign/Brand/Xending%20bola%20logoabril26.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8zNDdhNjgwZi1hZGU3LTQ3OGYtYjdkNy1kMGY5YzJjMDc4NDEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJCcmFuZC9YZW5kaW5nIGJvbGEgbG9nb2FicmlsMjYucG5nIiwiaWF0IjoxNzc3MTU1Nzg2LCJleHAiOjE4MDg2OTE3ODZ9.8ZrGD1_TGdtzJn5lSP3X3pvlqvFV-mfgwxLySRQUO3U';

const FONTS = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Poppins:wght@400;500;600;700&family=Fraunces:wght@400;600&family=JetBrains+Mono:wght@400;500;600&display=swap';

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

// ─── Shared base (same as designTemplates SHARED_CSS) ───
const BASE_CSS = `
    .story { width: 1080px; height: 1920px; position: relative; overflow: hidden; }
    .bg-mesh { position: absolute; inset: 0; }
    .grain { position: absolute; inset: 0; opacity: 0.08; mix-blend-mode: multiply; pointer-events: none;
      background-image: ${GRAIN}; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .accent-coral { font-style: italic; background: linear-gradient(135deg, #FF7A4A, #E85A2C);
      -webkit-background-clip: text; background-clip: text; color: transparent; }
    .accent-tq { font-style: italic; background: linear-gradient(135deg, #2ED4C7, #1FB8AC);
      -webkit-background-clip: text; background-clip: text; color: transparent; }
    .disclaimer { font-family: 'Fraunces', serif; font-size: 14px; margin-top: 16px; }
`;

// ─── Bulletin layout (card fills story, content centered) ───
const BULLETIN_LAYOUT = `
    .card { position: absolute; top: 80px; left: 50px; right: 50px; bottom: 100px;
      border-radius: 44px; padding: 50px 60px 40px;
      display: flex; flex-direction: column; overflow: hidden; }
    .bg-image { position: absolute; inset: 0; background-size: cover; background-position: center;
      opacity: 0.15; pointer-events: none; }
    .bg-image-overlay { position: absolute; inset: 0; pointer-events: none; }
    .logo-row { display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px; flex-shrink: 0; position: relative; z-index: 2; }
    .logo-left { display: flex; align-items: center; gap: 20px; }
    .logo { width: 80px; height: 80px; object-fit: contain; }
    .wordmark { font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 42px; }
    .bulletin-category { display: inline-flex; align-items: center; gap: 10px;
      padding: 10px 22px; border-radius: 100px;
      background: rgba(255,122,74,0.12); border: 1px solid rgba(255,122,74,0.25);
      font-family: 'Poppins', sans-serif; font-weight: 600; font-size: 16px;
      color: #FF7A4A; text-transform: uppercase; letter-spacing: 1.5px; }
    .cat-dot { width: 8px; height: 8px; border-radius: 50%; background: #FF7A4A;
      animation: pulse 2s infinite; }
    .bulletin-label { font-family: 'Poppins', sans-serif; font-size: 13px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 3px; opacity: 0.3; flex-shrink: 0;
      position: relative; z-index: 2; }
    .bulletin-content { flex: 1; display: flex; flex-direction: column;
      justify-content: center; align-items: center; text-align: center;
      position: relative; z-index: 2; }
    .bulletin-data { margin-bottom: 24px; }
    .bulletin-data-label { font-family: 'Poppins', sans-serif; font-size: 20px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 3px; margin-bottom: 12px; }
    .bulletin-data-value { font-family: 'JetBrains Mono', monospace; font-weight: 700;
      font-size: 88px; line-height: 1.1;
      background: linear-gradient(135deg, #2ED4C7, #1FB8AC);
      -webkit-background-clip: text; background-clip: text; color: transparent; }
    .accent-bar { height: 3px; width: 120px; margin: 16px auto 24px;
      background: linear-gradient(90deg, #FF7A4A, #2ED4C7); }
    .headline { font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 64px;
      line-height: 1.1; margin-bottom: 24px; max-width: 850px; }
    .subcopy { font-family: 'Poppins', sans-serif; font-size: 28px; line-height: 1.5;
      margin-bottom: 24px; max-width: 800px; }
    .bulletin-source { font-family: 'Poppins', sans-serif; font-size: 16px;
      font-weight: 500; text-transform: uppercase; letter-spacing: 2px; }
    .footer { position: absolute; bottom: 30px; left: 70px; right: 70px; text-align: center; }
`;

// ─── Color variants ───

interface ColorScheme {
  id: string;
  name: string;
  description: string;
  storyBg: string;
  meshBg: string;
  cardStyle: string;
  wordmarkColor: string;
  headlineColor: string;
  subColor: string;
  labelColor: string;
  sourceColor: string;
  disclaimerColor: string;
  barBg: string;
}

const SCHEMES: ColorScheme[] = [
  {
    id: 'bulletin-light', name: 'Boletín Light', description: 'Fondo cream, card blanca',
    storyBg: '#F5F3F0',
    meshBg: 'radial-gradient(ellipse 800px 600px at 90% 10%, rgba(255,120,70,0.18) 0%, transparent 60%), radial-gradient(ellipse 900px 700px at 5% 95%, rgba(46,212,199,0.22) 0%, transparent 60%), radial-gradient(ellipse 500px 400px at 50% 50%, rgba(255,255,255,0.7) 0%, transparent 70%), linear-gradient(180deg, #F8F5F1 0%, #EEEBE5 100%)',
    cardStyle: 'background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.02), 0 30px 70px rgba(255,120,70,0.1), 0 50px 120px rgba(46,212,199,0.08);',
    wordmarkColor: '#1a1a1a', headlineColor: '#0F1419', subColor: '#555',
    labelColor: '#888', sourceColor: '#999', disclaimerColor: '#999',
    barBg: 'linear-gradient(90deg, #FF7A4A, #2ED4C7)',
  },
  {
    id: 'bulletin-dark', name: 'Boletín Dark', description: 'Fondo navy, estilo premium',
    storyBg: '#0F1419',
    meshBg: 'radial-gradient(ellipse 800px 600px at 80% 20%, rgba(255,120,70,0.1) 0%, transparent 60%), radial-gradient(ellipse 900px 700px at 10% 80%, rgba(46,212,199,0.12) 0%, transparent 60%), radial-gradient(ellipse 600px 600px at 50% 50%, rgba(255,255,255,0.03) 0%, transparent 70%)',
    cardStyle: 'background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 2px 4px rgba(0,0,0,0.1), 0 30px 70px rgba(0,0,0,0.3);',
    wordmarkColor: '#fff', headlineColor: '#FFFFFF', subColor: 'rgba(255,255,255,0.7)',
    labelColor: 'rgba(255,255,255,0.4)', sourceColor: 'rgba(255,255,255,0.3)', disclaimerColor: 'rgba(255,255,255,0.25)',
    barBg: 'linear-gradient(90deg, #FF7A4A, #2ED4C7)',
  },
  {
    id: 'bulletin-coral', name: 'Boletín Coral', description: 'Fondo coral cálido',
    storyBg: '#FFF5F2',
    meshBg: 'radial-gradient(ellipse 900px 700px at 85% 15%, rgba(255,120,70,0.28) 0%, transparent 55%), radial-gradient(ellipse 800px 600px at 10% 85%, rgba(46,212,199,0.15) 0%, transparent 60%), radial-gradient(ellipse 600px 500px at 50% 50%, rgba(255,255,255,0.6) 0%, transparent 70%), linear-gradient(160deg, #FFF5F2 0%, #FFE8E0 50%, #FFF0EB 100%)',
    cardStyle: 'background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.02), 0 30px 70px rgba(255,120,70,0.15), 0 50px 120px rgba(255,120,70,0.08);',
    wordmarkColor: '#1a1a1a', headlineColor: '#0F1419', subColor: '#555',
    labelColor: '#888', sourceColor: '#999', disclaimerColor: '#999',
    barBg: 'linear-gradient(90deg, #FF7A4A, #E85A2C)',
  },
  {
    id: 'bulletin-turquesa', name: 'Boletín Turquesa', description: 'Fondo turquesa fresco',
    storyBg: '#F0FDFB',
    meshBg: 'radial-gradient(ellipse 900px 700px at 15% 20%, rgba(46,212,199,0.25) 0%, transparent 55%), radial-gradient(ellipse 800px 600px at 85% 80%, rgba(255,120,70,0.12) 0%, transparent 60%), radial-gradient(ellipse 600px 500px at 50% 50%, rgba(255,255,255,0.6) 0%, transparent 70%), linear-gradient(160deg, #F0FDFB 0%, #E6FAF7 50%, #F0FDFB 100%)',
    cardStyle: 'background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.02), 0 30px 70px rgba(46,212,199,0.12), 0 50px 120px rgba(46,212,199,0.06);',
    wordmarkColor: '#1a1a1a', headlineColor: '#0F1419', subColor: '#555',
    labelColor: '#888', sourceColor: '#999', disclaimerColor: '#999',
    barBg: 'linear-gradient(90deg, #2ED4C7, #1FB8AC)',
  },
  {
    id: 'bulletin-navy', name: 'Boletín Navy', description: 'Navy profundo con turquesa',
    storyBg: '#0a1628',
    meshBg: 'radial-gradient(ellipse 800px 600px at 70% 10%, rgba(46,212,199,0.15) 0%, transparent 60%), radial-gradient(ellipse 900px 700px at 20% 90%, rgba(255,120,70,0.08) 0%, transparent 60%), linear-gradient(180deg, #0a1628 0%, #0F1419 50%, #0a1628 100%)',
    cardStyle: 'background: linear-gradient(145deg, rgba(46,212,199,0.08), rgba(255,255,255,0.03)); border: 1px solid rgba(46,212,199,0.15); box-shadow: 0 2px 4px rgba(0,0,0,0.2), 0 30px 70px rgba(0,0,0,0.4);',
    wordmarkColor: '#2ED4C7', headlineColor: '#FFFFFF', subColor: 'rgba(255,255,255,0.65)',
    labelColor: 'rgba(255,255,255,0.4)', sourceColor: 'rgba(255,255,255,0.3)', disclaimerColor: 'rgba(255,255,255,0.25)',
    barBg: 'linear-gradient(90deg, #2ED4C7, #FF7A4A)',
  },
];

function buildBulletin(s: ColorScheme): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <link href="${FONTS}" rel="stylesheet">
  <style>
    ${BASE_CSS}
    ${BULLETIN_LAYOUT}
    .story { background: ${s.storyBg}; }
    .bg-mesh { background: ${s.meshBg}; }
    .card { ${s.cardStyle} }
    .wordmark { color: ${s.wordmarkColor}; }
    .headline { color: ${s.headlineColor}; }
    .subcopy { color: ${s.subColor}; }
    .bulletin-data-label { color: ${s.labelColor}; }
    .bulletin-source { color: ${s.sourceColor}; }
    .bulletin-label { color: ${s.labelColor}; }
    .accent-bar { background: ${s.barBg}; }
    .disclaimer { color: ${s.disclaimerColor}; }
    .footer .disclaimer { color: ${s.disclaimerColor}; }
  </style>
</head>
<body>
  <div class="story">
    <div class="bg-mesh"></div>
    <div class="grain"></div>
    <div class="bg-image" style="background-image: url('{{bgImageUrl}}'); {{bgImageDisplay}}"></div>
    <div class="card">
      <div class="logo-row">
        <div class="logo-left">
          <img class="logo" src="${LOGO_URL}" />
          <span class="wordmark">xending</span>
        </div>
        <div class="bulletin-category">
          <span class="cat-dot"></span>
          <span>{{category}}</span>
        </div>
      </div>
      <div class="bulletin-label">Boletín informativo</div>
      <div class="bulletin-content">
        <div class="bulletin-data" style="{{dataDisplay}}">
          <div class="bulletin-data-label">{{dataLabel}}</div>
          <div class="bulletin-data-value">{{dataValue}}</div>
        </div>
        <div class="accent-bar"></div>
        <h1 class="headline">{{headline}}</h1>
        <p class="subcopy">{{subcopy}}</p>
        <div class="bulletin-source">{{source}}</div>
      </div>
    </div>
    <div class="footer">
      <p class="disclaimer">{{disclaimer}}</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Hero variants: same bulletin layout but card has image as background ───
// Reuses BULLETIN_LAYOUT — the image goes as background-image on the card itself
// with a strong overlay so text remains readable.

interface HeroColorScheme extends ColorScheme {
  cardOverlay: string;  // overlay on top of the background image
}

const HERO_SCHEMES: HeroColorScheme[] = [
  {
    id: 'bulletin-hero-light', name: 'Imagen Light', description: 'Boletín con imagen de fondo — claro',
    storyBg: '#F5F3F0',
    meshBg: 'radial-gradient(ellipse 800px 600px at 90% 10%, rgba(255,120,70,0.12) 0%, transparent 60%), radial-gradient(ellipse 900px 700px at 5% 95%, rgba(46,212,199,0.15) 0%, transparent 60%), linear-gradient(180deg, #F8F5F1 0%, #EEEBE5 100%)',
    cardStyle: 'background-size: cover; background-position: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02), 0 30px 70px rgba(255,120,70,0.1), 0 50px 120px rgba(46,212,199,0.08);',
    wordmarkColor: '#1a1a1a', headlineColor: '#0F1419', subColor: '#444',
    labelColor: '#666', sourceColor: '#777', disclaimerColor: '#999',
    barBg: 'linear-gradient(90deg, #FF7A4A, #2ED4C7)',
    cardOverlay: 'rgba(255,255,255,0.82)',
  },
  {
    id: 'bulletin-hero-dark', name: 'Imagen Dark', description: 'Boletín con imagen de fondo — oscuro',
    storyBg: '#0F1419',
    meshBg: 'radial-gradient(ellipse 800px 600px at 80% 20%, rgba(255,120,70,0.1) 0%, transparent 60%), radial-gradient(ellipse 900px 700px at 10% 80%, rgba(46,212,199,0.12) 0%, transparent 60%)',
    cardStyle: 'background-size: cover; background-position: center; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 2px 4px rgba(0,0,0,0.1), 0 30px 70px rgba(0,0,0,0.3);',
    wordmarkColor: '#fff', headlineColor: '#FFFFFF', subColor: 'rgba(255,255,255,0.85)',
    labelColor: 'rgba(255,255,255,0.5)', sourceColor: 'rgba(255,255,255,0.4)', disclaimerColor: 'rgba(255,255,255,0.25)',
    barBg: 'linear-gradient(90deg, #FF7A4A, #2ED4C7)',
    cardOverlay: 'rgba(15,20,25,0.78)',
  },
  {
    id: 'bulletin-hero-navy', name: 'Imagen Navy', description: 'Boletín con imagen de fondo — navy',
    storyBg: '#0a1628',
    meshBg: 'radial-gradient(ellipse 800px 600px at 70% 10%, rgba(46,212,199,0.15) 0%, transparent 60%), radial-gradient(ellipse 900px 700px at 20% 90%, rgba(255,120,70,0.08) 0%, transparent 60%), linear-gradient(180deg, #0a1628 0%, #0F1419 50%, #0a1628 100%)',
    cardStyle: 'background-size: cover; background-position: center; border: 1px solid rgba(46,212,199,0.15); box-shadow: 0 2px 4px rgba(0,0,0,0.2), 0 30px 70px rgba(0,0,0,0.4);',
    wordmarkColor: '#2ED4C7', headlineColor: '#FFFFFF', subColor: 'rgba(255,255,255,0.8)',
    labelColor: 'rgba(255,255,255,0.5)', sourceColor: 'rgba(255,255,255,0.4)', disclaimerColor: 'rgba(255,255,255,0.25)',
    barBg: 'linear-gradient(90deg, #2ED4C7, #FF7A4A)',
    cardOverlay: 'rgba(10,22,40,0.75)',
  },
];

function buildHeroBulletin(s: HeroColorScheme): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <link href="${FONTS}" rel="stylesheet">
  <style>
    ${BASE_CSS}
    ${BULLETIN_LAYOUT}
    .story { background: ${s.storyBg}; }
    .bg-mesh { background: ${s.meshBg}; }
    .card { ${s.cardStyle} }
    .card-overlay { position: absolute; inset: 0; background: ${s.cardOverlay};
      border-radius: 44px; z-index: 1; }
    .logo-row { z-index: 2; }
    .bulletin-label { z-index: 2; }
    .bulletin-content { z-index: 2; }
    .wordmark { color: ${s.wordmarkColor}; }
    .headline { color: ${s.headlineColor}; }
    .subcopy { color: ${s.subColor}; }
    .bulletin-data-label { color: ${s.labelColor}; }
    .bulletin-source { color: ${s.sourceColor}; }
    .bulletin-label { color: ${s.labelColor}; }
    .accent-bar { background: ${s.barBg}; }
    .disclaimer { color: ${s.disclaimerColor}; }
    .footer .disclaimer { color: ${s.disclaimerColor}; }
  </style>
</head>
<body>
  <div class="story">
    <div class="bg-mesh"></div>
    <div class="grain"></div>
    <div class="card" style="background-image: url('{{imageUrl}}');">
      <div class="card-overlay"></div>
      <div class="logo-row">
        <div class="logo-left">
          <img class="logo" src="${LOGO_URL}" />
          <span class="wordmark">xending</span>
        </div>
        <div class="bulletin-category">
          <span class="cat-dot"></span>
          <span>{{category}}</span>
        </div>
      </div>
      <div class="bulletin-label">Boletín informativo</div>
      <div class="bulletin-content">
        <div class="bulletin-data" style="{{dataDisplay}}">
          <div class="bulletin-data-label">{{dataLabel}}</div>
          <div class="bulletin-data-value">{{dataValue}}</div>
        </div>
        <div class="accent-bar"></div>
        <h1 class="headline">{{headline}}</h1>
        <p class="subcopy">{{subcopy}}</p>
        <div class="bulletin-source">{{source}}</div>
      </div>
    </div>
    <div class="footer">
      <p class="disclaimer">{{disclaimer}}</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── V2 Layout: improved composition, better hierarchy ───
const V2_LAYOUT = `
    .story { width: 1080px; height: 1920px; position: relative; overflow: hidden; }
    .bg-mesh { position: absolute; inset: 0; }
    .grain { position: absolute; inset: 0; opacity: 0.08; mix-blend-mode: multiply; pointer-events: none;
      background-image: ${GRAIN}; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .accent-coral { font-style: italic; background: linear-gradient(135deg, #FF7A4A, #E85A2C);
      -webkit-background-clip: text; background-clip: text; color: transparent; }
    .accent-tq { font-style: italic; background: linear-gradient(135deg, #2ED4C7, #1FB8AC);
      -webkit-background-clip: text; background-clip: text; color: transparent; }
    .disclaimer { font-family: 'Fraunces', serif; font-size: 14px; }

    .card { position: absolute; top: 80px; left: 50px; right: 50px; bottom: 100px;
      border-radius: 44px; padding: 50px 60px 50px;
      display: flex; flex-direction: column; overflow: hidden; }
    .card-overlay { position: absolute; inset: 0; border-radius: 44px; z-index: 1; }
    .bg-image { position: absolute; inset: 0; background-size: cover; background-position: center;
      opacity: 0.15; pointer-events: none; }

    .logo-row { display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 0; flex-shrink: 0; position: relative; z-index: 2; }
    .logo-left { display: flex; align-items: center; gap: 20px; }
    .logo { width: 70px; height: 70px; object-fit: contain; }
    .wordmark { font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 38px; }

    .bulletin-category { display: inline-flex; align-items: center; gap: 10px;
      padding: 10px 22px; border-radius: 100px;
      background: rgba(255,122,74,0.12); border: 1px solid rgba(255,122,74,0.25);
      font-family: 'Poppins', sans-serif; font-weight: 600; font-size: 15px;
      color: #FF7A4A; text-transform: uppercase; letter-spacing: 1.5px; }
    .cat-dot { width: 8px; height: 8px; border-radius: 50%; background: #FF7A4A;
      animation: pulse 2s infinite; }

    .top-bar { height: 3px; width: 100%; margin: 28px 0 0;
      background: linear-gradient(90deg, #FF7A4A, #2ED4C7);
      position: relative; z-index: 2; flex-shrink: 0; }

    .bulletin-content { flex: 1; display: flex; flex-direction: column;
      justify-content: center; align-items: center; text-align: center;
      position: relative; z-index: 2; padding: 0 10px; }

    .bulletin-data { margin-bottom: 28px; }
    .bulletin-data-label { font-family: 'Poppins', sans-serif; font-size: 18px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 4px; margin-bottom: 14px; opacity: 0.5; }
    .bulletin-data-value { font-family: 'JetBrains Mono', monospace; font-weight: 700;
      font-size: 110px; line-height: 1.0;
      background: linear-gradient(135deg, #2ED4C7, #1FB8AC);
      -webkit-background-clip: text; background-clip: text; color: transparent; }

    .accent-bar { height: 3px; width: 100px; margin: 0 auto 28px;
      background: linear-gradient(90deg, #FF7A4A, #2ED4C7); }

    .headline { font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 60px;
      line-height: 1.1; margin-bottom: 20px; max-width: 850px; }
    .subcopy { font-family: 'Poppins', sans-serif; font-size: 26px; line-height: 1.4;
      margin-bottom: 0; max-width: 800px; }

    .source-pill { display: inline-flex; align-items: center; gap: 12px;
      padding: 14px 28px; border-radius: 100px;
      font-family: 'Poppins', sans-serif; font-weight: 600; font-size: 15px;
      text-transform: uppercase; letter-spacing: 2px;
      position: relative; z-index: 2; flex-shrink: 0; margin-top: auto; }
    .source-dot { width: 8px; height: 8px; border-radius: 50%;
      animation: pulse 2s infinite; }

    .footer { position: absolute; bottom: 30px; left: 70px; right: 70px; text-align: center; }
`;

// ─── V2 color schemes ───

interface V2ColorScheme {
  id: string;
  name: string;
  description: string;
  storyBg: string;
  meshBg: string;
  cardBg: string;
  cardOverlay: string;
  wordmarkColor: string;
  headlineColor: string;
  subColor: string;
  labelColor: string;
  disclaimerColor: string;
  sourcePillBg: string;
  sourcePillColor: string;
  sourceDotColor: string;
  topBarBg: string;
  accentBarBg: string;
}

const V2_SCHEMES: V2ColorScheme[] = [
  {
    id: 'bulletin-v2-light', name: 'V2 Light', description: 'Diseño mejorado — claro, dato protagonista',
    storyBg: '#F5F3F0',
    meshBg: 'radial-gradient(ellipse 800px 600px at 90% 10%, rgba(255,120,70,0.18) 0%, transparent 60%), radial-gradient(ellipse 900px 700px at 5% 95%, rgba(46,212,199,0.22) 0%, transparent 60%), radial-gradient(ellipse 500px 400px at 50% 50%, rgba(255,255,255,0.7) 0%, transparent 70%), linear-gradient(180deg, #F8F5F1 0%, #EEEBE5 100%)',
    cardBg: '#fff',
    cardOverlay: '',
    wordmarkColor: '#1a1a1a', headlineColor: '#0F1419', subColor: '#555',
    labelColor: '#888', disclaimerColor: '#999',
    sourcePillBg: 'rgba(46,212,199,0.08)', sourcePillColor: '#2ED4C7', sourceDotColor: '#2ED4C7',
    topBarBg: 'linear-gradient(90deg, #FF7A4A, #2ED4C7)',
    accentBarBg: 'linear-gradient(90deg, #FF7A4A, #2ED4C7)',
  },
  {
    id: 'bulletin-v2-dark', name: 'V2 Dark', description: 'Diseño mejorado — oscuro premium',
    storyBg: '#0F1419',
    meshBg: 'radial-gradient(ellipse 800px 600px at 80% 20%, rgba(255,120,70,0.1) 0%, transparent 60%), radial-gradient(ellipse 900px 700px at 10% 80%, rgba(46,212,199,0.12) 0%, transparent 60%)',
    cardBg: 'rgba(255,255,255,0.06)',
    cardOverlay: '',
    wordmarkColor: '#fff', headlineColor: '#FFFFFF', subColor: 'rgba(255,255,255,0.7)',
    labelColor: 'rgba(255,255,255,0.4)', disclaimerColor: 'rgba(255,255,255,0.25)',
    sourcePillBg: 'rgba(46,212,199,0.12)', sourcePillColor: 'rgba(255,255,255,0.6)', sourceDotColor: '#2ED4C7',
    topBarBg: 'linear-gradient(90deg, #FF7A4A, #2ED4C7)',
    accentBarBg: 'linear-gradient(90deg, #FF7A4A, #2ED4C7)',
  },
  {
    id: 'bulletin-v2-navy', name: 'V2 Navy', description: 'Diseño mejorado — navy profundo',
    storyBg: '#0a1628',
    meshBg: 'radial-gradient(ellipse 800px 600px at 70% 10%, rgba(46,212,199,0.15) 0%, transparent 60%), radial-gradient(ellipse 900px 700px at 20% 90%, rgba(255,120,70,0.08) 0%, transparent 60%), linear-gradient(180deg, #0a1628 0%, #0F1419 50%, #0a1628 100%)',
    cardBg: 'linear-gradient(145deg, rgba(46,212,199,0.08), rgba(255,255,255,0.03))',
    cardOverlay: '',
    wordmarkColor: '#2ED4C7', headlineColor: '#FFFFFF', subColor: 'rgba(255,255,255,0.65)',
    labelColor: 'rgba(255,255,255,0.4)', disclaimerColor: 'rgba(255,255,255,0.25)',
    sourcePillBg: 'rgba(46,212,199,0.1)', sourcePillColor: 'rgba(255,255,255,0.5)', sourceDotColor: '#2ED4C7',
    topBarBg: 'linear-gradient(90deg, #2ED4C7, #FF7A4A)',
    accentBarBg: 'linear-gradient(90deg, #2ED4C7, #FF7A4A)',
  },
  {
    id: 'bulletin-v2-img-light', name: 'V2 Imagen Light', description: 'Diseño mejorado con imagen de fondo — claro',
    storyBg: '#F5F3F0',
    meshBg: 'radial-gradient(ellipse 800px 600px at 90% 10%, rgba(255,120,70,0.12) 0%, transparent 60%), radial-gradient(ellipse 900px 700px at 5% 95%, rgba(46,212,199,0.15) 0%, transparent 60%), linear-gradient(180deg, #F8F5F1 0%, #EEEBE5 100%)',
    cardBg: 'transparent',
    cardOverlay: 'rgba(255,255,255,0.78)',
    wordmarkColor: '#1a1a1a', headlineColor: '#0F1419', subColor: '#444',
    labelColor: '#666', disclaimerColor: '#999',
    sourcePillBg: 'rgba(46,212,199,0.1)', sourcePillColor: '#2ED4C7', sourceDotColor: '#2ED4C7',
    topBarBg: 'linear-gradient(90deg, #FF7A4A, #2ED4C7)',
    accentBarBg: 'linear-gradient(90deg, #FF7A4A, #2ED4C7)',
  },
  {
    id: 'bulletin-v2-img-dark', name: 'V2 Imagen Dark', description: 'Diseño mejorado con imagen de fondo — oscuro',
    storyBg: '#0F1419',
    meshBg: 'radial-gradient(ellipse 800px 600px at 80% 20%, rgba(255,120,70,0.08) 0%, transparent 60%), radial-gradient(ellipse 900px 700px at 10% 80%, rgba(46,212,199,0.1) 0%, transparent 60%)',
    cardBg: 'transparent',
    cardOverlay: 'rgba(15,20,25,0.75)',
    wordmarkColor: '#fff', headlineColor: '#FFFFFF', subColor: 'rgba(255,255,255,0.8)',
    labelColor: 'rgba(255,255,255,0.5)', disclaimerColor: 'rgba(255,255,255,0.25)',
    sourcePillBg: 'rgba(46,212,199,0.12)', sourcePillColor: 'rgba(255,255,255,0.6)', sourceDotColor: '#2ED4C7',
    topBarBg: 'linear-gradient(90deg, #FF7A4A, #2ED4C7)',
    accentBarBg: 'linear-gradient(90deg, #FF7A4A, #2ED4C7)',
  },
];

function buildV2Bulletin(s: V2ColorScheme): string {
  const hasOverlay = s.cardOverlay !== '';
  const needsImage = hasOverlay;
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <link href="${FONTS}" rel="stylesheet">
  <style>
    ${V2_LAYOUT}
    .story { background: ${s.storyBg}; }
    .bg-mesh { background: ${s.meshBg}; }
    .card { background: ${s.cardBg};${needsImage ? ' background-size: cover; background-position: center;' : ''} box-shadow: 0 2px 4px rgba(0,0,0,0.02), 0 30px 70px rgba(0,0,0,0.08); ${needsImage ? `border: 1px solid rgba(255,255,255,0.08);` : ''} }
    ${hasOverlay ? `.card-overlay { background: ${s.cardOverlay}; }` : `.card-overlay { display: none; }`}
    .wordmark { color: ${s.wordmarkColor}; }
    .headline { color: ${s.headlineColor}; }
    .subcopy { color: ${s.subColor}; }
    .bulletin-data-label { color: ${s.labelColor}; }
    .top-bar { background: ${s.topBarBg}; }
    .accent-bar { background: ${s.accentBarBg}; }
    .source-pill { background: ${s.sourcePillBg}; color: ${s.sourcePillColor};
      border: 1px solid ${s.sourcePillColor}22; }
    .source-dot { background: ${s.sourceDotColor}; box-shadow: 0 0 10px ${s.sourceDotColor}80; }
    .disclaimer { color: ${s.disclaimerColor}; }
    .footer .disclaimer { color: ${s.disclaimerColor}; }
  </style>
</head>
<body>
  <div class="story">
    <div class="bg-mesh"></div>
    <div class="grain"></div>
    <div class="card"${needsImage ? ` style="background-image: url('{{imageUrl}}');"` : ''}>
      <div class="card-overlay"></div>
      <div class="logo-row">
        <div class="logo-left">
          <img class="logo" src="${LOGO_URL}" />
          <span class="wordmark">xending</span>
        </div>
        <div class="bulletin-category">
          <span class="cat-dot"></span>
          <span>{{category}}</span>
        </div>
      </div>
      <div class="top-bar"></div>
      <div class="bulletin-content">
        <div class="bulletin-data" style="{{dataDisplay}}">
          <div class="bulletin-data-label">{{dataLabel}}</div>
          <div class="bulletin-data-value">{{dataValue}}</div>
        </div>
        <div class="accent-bar"></div>
        <h1 class="headline">{{headline}}</h1>
        <p class="subcopy">{{subcopy}}</p>
      </div>
      <div class="source-pill">
        <span class="source-dot"></span>
        <span>{{source}}</span>
      </div>
    </div>
    <div class="footer">
      <p class="disclaimer">{{disclaimer}}</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Export ───

const cleanTemplates: DesignTemplate[] = SCHEMES.map((s) => ({
  id: s.id,
  name: s.name,
  emoji: '📰',
  description: s.description,
  needsImage: false,
  html: buildBulletin(s),
}));

const heroTemplates: DesignTemplate[] = HERO_SCHEMES.map((s) => ({
  id: s.id,
  name: s.name,
  emoji: '🖼️',
  description: s.description,
  needsImage: true,
  html: buildHeroBulletin(s),
}));

const v2Templates: DesignTemplate[] = V2_SCHEMES.map((s) => ({
  id: s.id,
  name: s.name,
  emoji: s.cardOverlay !== '' ? '🖼️' : '✨',
  description: s.description,
  needsImage: s.cardOverlay !== '',
  html: buildV2Bulletin(s),
}));

export const BULLETIN_TEMPLATES: DesignTemplate[] = [...cleanTemplates, ...heroTemplates, ...v2Templates];

export function getBulletinTemplateById(id: string): DesignTemplate | undefined {
  return BULLETIN_TEMPLATES.find((t) => t.id === id);
}
