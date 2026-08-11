/**
 * Presentation Templates V2 — Xending Global Pitch Deck (Navy Split Cover)
 *
 * Variante con portada "Split Navy/Cream":
 * - Lado izquierdo: fondo navy #0F1419, texto blanco, acentos turquesa/coral
 * - Lado derecho: cream con imagen placeholder
 * - Tipografía: Montserrat (headlines), Poppins (body), JetBrains Mono (números),
 *   Fraunces solo para notas legales
 * - Format: 1920x1080 (16:9 presentation)
 */

const LOGO_URL = 'https://gdfhytvjnzdovjfovqfv.supabase.co/storage/v1/object/sign/Brand/Xending%20bola%20logoabril26.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8zNDdhNjgwZi1hZGU3LTQ3OGYtYjdkNy1kMGY5YzJjMDc4NDEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJCcmFuZC9YZW5kaW5nIGJvbGEgbG9nb2FicmlsMjYucG5nIiwiaWF0IjoxNzc3MTU1Nzg2LCJleHAiOjE4MDg2OTE3ODZ9.8ZrGD1_TGdtzJn5lSP3X3pvlqvFV-mfgwxLySRQUO3U';

const FONTS = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Poppins:wght@400;500;600;700&family=Fraunces:wght@400;600&family=JetBrains+Mono:wght@400;500;600&display=swap';

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

// ─── Portada "Aliado Mapa" (slide01_cover_v13) ──────────────────────────────
// URL pública del mapa mundial subido al bucket de Supabase (Opción B).
// TODO: reemplazar con la URL real del PNG hosteado.
const MAP_COVER_URL = 'https://gdfhytvjnzdovjfovqfv.supabase.co/storage/v1/object/public/design-images/presentations/xending_mapa_extraido_transparente_fuerte.png';

// Tipografía de la portada del mapa. Para cambiar el tipo de letra, edita SOLO
// estas dos líneas (familia de Google Fonts + nombres CSS).
const MAP_COVER_FONTS = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Poppins:wght@400;500;600;700&family=Fraunces:wght@400;600&family=JetBrains+Mono:wght@400;500;600&display=swap';
const MAP_COVER_FONT_TITLE = "'Montserrat', sans-serif";
const MAP_COVER_FONT_BODY = "'Poppins', sans-serif";

// ─── SLIDE 1 V2: Cover — Navy Split ─────────────────────────────────────────

export const slide01_cover_v2: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${FONTS}');

    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #0F1419; }

    .slide {
      width: 1920px;
      height: 1080px;
      position: relative;
      overflow: hidden;
      font-family: 'Poppins', sans-serif;
      display: flex;
      transform-origin: top left;
    }

    /* Left panel — Aurora Mesh (Navy Xending + glows de marca) */
    .panel-left {
      flex: 1.15;
      background:
        radial-gradient(ellipse 1100px 900px at 15% 20%, rgba(46,212,199,0.28) 0%, rgba(46,212,199,0.08) 35%, transparent 65%),
        radial-gradient(ellipse 1000px 800px at 85% 85%, rgba(255,122,74,0.22) 0%, rgba(255,122,74,0.06) 35%, transparent 65%),
        radial-gradient(ellipse 700px 500px at 60% 40%, rgba(46,212,199,0.10) 0%, transparent 60%),
        linear-gradient(135deg, #0F1419 0%, #141b24 50%, #0F1419 100%);
      position: relative;
      padding: 72px 80px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 36px;
      overflow: hidden;
    }

    /* Soft noise overlay for premium feel */
    .panel-left::before {
      content: '';
      position: absolute;
      inset: 0;
      background-image: ${GRAIN};
      opacity: 0.06;
      mix-blend-mode: overlay;
      pointer-events: none;
    }

    /* Right panel — Cream */
    .panel-right {
      flex: 0.85;
      background: #F5F3F0;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px;
      overflow: hidden;
    }

    .panel-right::before {
      content: '';
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse 600px 500px at 80% 20%, rgba(255,120,70,0.15) 0%, transparent 60%),
        radial-gradient(ellipse 500px 400px at 20% 80%, rgba(46,212,199,0.12) 0%, transparent 60%);
      pointer-events: none;
    }

    /* Grain overlay */
    .grain {
      position: absolute;
      inset: 0;
      opacity: 0.05;
      mix-blend-mode: overlay;
      pointer-events: none;
      background-image: ${GRAIN};
    }

    /* Typography — white on navy */
    .logo-row {
      display: flex;
      align-items: center;
      gap: 16px;
      position: relative;
      z-index: 1;
    }

    .logo-row img {
      width: 52px;
      height: 52px;
      object-fit: contain;
    }

    .wordmark {
      font-family: 'Montserrat', sans-serif;
      font-weight: 700;
      font-size: 30px;
      color: #ffffff;
    }

    h1 {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-size: 72px;
      line-height: 1.08;
      color: #ffffff;
      position: relative;
      z-index: 1;
    }

    .accent-coral {
      font-style: italic;
      background: linear-gradient(135deg, #FF7A4A, #FFa070);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .accent-tq {
      font-style: italic;
      background: linear-gradient(135deg, #2ED4C7, #5EEADF);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .subtitle {
      font-family: 'Poppins', sans-serif;
      font-size: 24px;
      font-weight: 400;
      color: rgba(255,255,255,0.75);
      line-height: 1.5;
      max-width: 580px;
      position: relative;
      z-index: 1;
    }

    /* Stats */
    .stats-row {
      display: flex;
      gap: 48px;
      position: relative;
      z-index: 1;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .stat-number {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      font-size: 44px;
      color: #2ED4C7;
    }

    .stat-label {
      font-size: 15px;
      color: rgba(255,255,255,0.55);
    }

    /* Divider line between panels */
    .divider-accent {
      position: absolute;
      top: 10%;
      bottom: 10%;
      right: 0;
      width: 4px;
      background: linear-gradient(180deg, #2ED4C7, #FF7A4A);
      border-radius: 2px;
      z-index: 2;
    }

    /* Right panel image area */
    .img-placeholder {
      width: 100%;
      height: 85%;
      background: #fff;
      border-radius: 24px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #999;
      font-size: 18px;
      font-style: italic;
      position: relative;
      z-index: 1;
      border: 1px solid rgba(0,0,0,0.05);
    }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        slide.style.transform = 'scale(' + scale + ')';
        slide.style.transformOrigin = 'top left';
      }
      window.addEventListener('resize', resize);
      resize();
      setTimeout(resize, 50);
      setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#0F1419;width:100%;height:100vh;">
  <div class="slide">
    <!-- Left: Navy panel -->
    <div class="panel-left">
      <div class="logo-row">
        <img src="${LOGO_URL}" alt="Xending" />
        <span class="wordmark">xending</span>
      </div>

      <h1>
        ¿Cuánto le está costando el tipo de cambio a tu empresa
        <span class="accent-coral">cada mes?</span>
      </h1>

      <p class="subtitle">
        La mayoría de los CFOs no lo saben con exactitud.
        Xending Global te lo muestra — y te ayuda a reducirlo.
      </p>

      <div class="stats-row">
        <div class="stat-item">
          <span class="stat-number">15+</span>
          <span class="stat-label">Años en FX</span>
        </div>
        <div class="stat-item">
          <span class="stat-number">130+</span>
          <span class="stat-label">Divisas</span>
        </div>
        <div class="stat-item">
          <span class="stat-number">1 día</span>
          <span class="stat-label">Pagos a Asia</span>
        </div>
      </div>

      <!-- Accent divider -->
      <div class="divider-accent"></div>
    </div>

    <!-- Right: Cream panel -->
    <div class="panel-right">
      <div class="grain"></div>
      <!-- IMAGE: Dashboard financiero o mockup de plataforma -->
      <div class="img-placeholder">
        📊 Imagen: Dashboard / Plataforma
      </div>
    </div>
  </div>
</body>
</html>`;

// ─── SLIDE 1 V3: Cover — Orb gigante (logo marca de agua) ───────────────────

export const slide01_cover_v3: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${FONTS}');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #0F1419; }

    .slide {
      width: 1920px;
      height: 1080px;
      position: relative;
      overflow: hidden;
      font-family: 'Poppins', sans-serif;
      background:
        radial-gradient(ellipse 800px 700px at 90% 10%, rgba(46,212,199,0.10) 0%, transparent 60%),
        radial-gradient(ellipse 800px 700px at 10% 95%, rgba(255,122,74,0.08) 0%, transparent 60%),
        linear-gradient(180deg, #0F1419 0%, #141b24 100%);
      transform-origin: top left;
    }

    /* Giant orb watermark (background brand mark) */
    .orb-watermark {
      position: absolute;
      right: -300px;
      top: 50%;
      transform: translateY(-50%);
      width: 1400px;
      height: 1400px;
      opacity: 0.08;
      filter: blur(2px);
      pointer-events: none;
    }

    .orb-watermark img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .grain {
      position: absolute;
      inset: 0;
      opacity: 0.05;
      mix-blend-mode: overlay;
      pointer-events: none;
      background-image: ${GRAIN};
    }

    .slide-content {
      position: relative;
      z-index: 2;
      width: 100%;
      height: 100%;
      padding: 96px 120px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 40px;
      max-width: 1200px;
    }

    .logo-row {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .logo-row img { width: 56px; height: 56px; object-fit: contain; }

    .wordmark {
      font-family: 'Montserrat', sans-serif;
      font-weight: 700;
      font-size: 32px;
      color: #ffffff;
    }

    h1 {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-size: 84px;
      line-height: 1.05;
      color: #ffffff;
      max-width: 1050px;
    }

    .accent-coral {
      font-style: italic;
      background: linear-gradient(135deg, #FF7A4A, #FFa070);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .subtitle {
      font-size: 26px;
      font-weight: 400;
      color: rgba(255,255,255,0.72);
      line-height: 1.5;
      max-width: 680px;
    }

    .stats-row { display: flex; gap: 56px; margin-top: 16px; }

    .stat-number {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      font-size: 52px;
      color: #2ED4C7;
    }

    .stat-label {
      font-size: 16px;
      color: rgba(255,255,255,0.5);
      margin-top: 4px;
    }

    .divider-line {
      width: 72px;
      height: 4px;
      background: linear-gradient(90deg, #2ED4C7, #FF7A4A);
      border-radius: 2px;
    }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        slide.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', resize);
      resize(); setTimeout(resize, 50); setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#0F1419;width:100%;height:100vh;">
  <div class="slide">
    <div class="orb-watermark">
      <img src="${LOGO_URL}" alt="" />
    </div>
    <div class="grain"></div>
    <div class="slide-content">
      <div class="logo-row">
        <img src="${LOGO_URL}" alt="Xending" />
        <span class="wordmark">xending</span>
      </div>
      <div class="divider-line"></div>
      <h1>
        ¿Cuánto le está costando el tipo de cambio a tu empresa
        <span class="accent-coral">cada mes?</span>
      </h1>
      <p class="subtitle">
        La mayoría de los CFOs no lo saben con exactitud.
        Xending Global te lo muestra — y te ayuda a reducirlo.
      </p>
      <div class="stats-row">
        <div>
          <div class="stat-number">15+</div>
          <div class="stat-label">Años en FX</div>
        </div>
        <div>
          <div class="stat-number">130+</div>
          <div class="stat-label">Divisas</div>
        </div>
        <div>
          <div class="stat-number">1 día</div>
          <div class="stat-label">Pagos a Asia</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

// ─── SLIDE 1 V4: Cover — Gradiente diagonal con rayo de luz ─────────────────

export const slide01_cover_v4: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${FONTS}');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #0F1419; }

    .slide {
      width: 1920px;
      height: 1080px;
      position: relative;
      overflow: hidden;
      font-family: 'Poppins', sans-serif;
      background: linear-gradient(135deg, #0F1419 0%, #1a2838 50%, #0F1419 100%);
      transform-origin: top left;
    }

    /* Diagonal light ray */
    .slide::before {
      content: '';
      position: absolute;
      top: -20%;
      left: -20%;
      right: -20%;
      bottom: -20%;
      background: linear-gradient(115deg,
        transparent 30%,
        rgba(46,212,199,0.08) 45%,
        rgba(46,212,199,0.12) 50%,
        rgba(255,122,74,0.08) 55%,
        transparent 70%
      );
      pointer-events: none;
    }

    /* Subtle ambient glow bottom-right */
    .slide::after {
      content: '';
      position: absolute;
      bottom: -15%;
      right: -10%;
      width: 70%;
      height: 70%;
      background: radial-gradient(ellipse, rgba(255,122,74,0.12) 0%, transparent 60%);
      pointer-events: none;
    }

    .grain {
      position: absolute;
      inset: 0;
      opacity: 0.05;
      mix-blend-mode: overlay;
      pointer-events: none;
      background-image: ${GRAIN};
      z-index: 1;
    }

    .slide-content {
      position: relative;
      z-index: 2;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      padding: 96px 120px;
      gap: 80px;
    }

    .content-left {
      flex: 1.2;
      display: flex;
      flex-direction: column;
      gap: 32px;
    }

    .logo-row {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .logo-row img { width: 52px; height: 52px; object-fit: contain; }

    .wordmark {
      font-weight: 700;
      font-size: 30px;
      color: #ffffff;
    }

    h1 {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-size: 78px;
      line-height: 1.05;
      color: #ffffff;
    }

    .accent-coral {
      font-style: italic;
      background: linear-gradient(135deg, #FF7A4A, #FFa070);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .subtitle {
      font-size: 24px;
      color: rgba(255,255,255,0.72);
      line-height: 1.5;
      max-width: 600px;
    }

    .stats-row { display: flex; gap: 48px; margin-top: 12px; }

    .stat-number {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      font-size: 48px;
      color: #2ED4C7;
    }

    .stat-label {
      font-size: 15px;
      color: rgba(255,255,255,0.5);
      margin-top: 4px;
    }

    .content-right {
      flex: 0.8;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .img-placeholder {
      width: 100%;
      height: 70%;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(46,212,199,0.15);
      border-radius: 24px;
      backdrop-filter: blur(10px);
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.4);
      font-size: 18px;
      font-style: italic;
      overflow: hidden;
    }

    .img-placeholder img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        slide.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', resize);
      resize(); setTimeout(resize, 50); setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#0F1419;width:100%;height:100vh;">
  <div class="slide">
    <div class="grain"></div>
    <div class="slide-content">
      <div class="content-left">
        <div class="logo-row">
          <img src="${LOGO_URL}" alt="Xending" />
          <span class="wordmark">xending</span>
        </div>
        <h1>
          ¿Cuánto le está costando el tipo de cambio a tu empresa
          <span class="accent-coral">cada mes?</span>
        </h1>
        <p class="subtitle">
          La mayoría de los CFOs no lo saben con exactitud.
          Xending Global te lo muestra — y te ayuda a reducirlo.
        </p>
        <div class="stats-row">
          <div>
            <div class="stat-number">15+</div>
            <div class="stat-label">Años en FX</div>
          </div>
          <div>
            <div class="stat-number">130+</div>
            <div class="stat-label">Divisas</div>
          </div>
          <div>
            <div class="stat-number">1 día</div>
            <div class="stat-label">Pagos a Asia</div>
          </div>
        </div>
      </div>
      <div class="content-right">
        <div class="img-placeholder">📊 Imagen: Dashboard / Plataforma</div>
      </div>
    </div>
  </div>
</body>
</html>`;

// ─── SLIDE 1 V5: Cover — Glass card sobre navy ──────────────────────────────

export const slide01_cover_v5: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${FONTS}');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #0F1419; }

    .slide {
      width: 1920px;
      height: 1080px;
      position: relative;
      overflow: hidden;
      font-family: 'Poppins', sans-serif;
      background:
        radial-gradient(ellipse 900px 700px at 20% 20%, rgba(46,212,199,0.22) 0%, transparent 55%),
        radial-gradient(ellipse 900px 700px at 80% 80%, rgba(255,122,74,0.18) 0%, transparent 55%),
        radial-gradient(ellipse 600px 500px at 60% 40%, rgba(46,212,199,0.08) 0%, transparent 60%),
        linear-gradient(135deg, #0F1419 0%, #141b24 50%, #0F1419 100%);
      transform-origin: top left;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 80px;
    }

    .grain {
      position: absolute;
      inset: 0;
      opacity: 0.05;
      mix-blend-mode: overlay;
      pointer-events: none;
      background-image: ${GRAIN};
      z-index: 1;
    }

    /* Glass card container */
    .glass-card {
      position: relative;
      z-index: 2;
      width: 100%;
      max-width: 1560px;
      background: rgba(255,255,255,0.04);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.10);
      border-radius: 40px;
      padding: 80px 96px;
      box-shadow:
        0 20px 60px rgba(0,0,0,0.30),
        inset 0 1px 0 rgba(255,255,255,0.10);
      display: flex;
      gap: 64px;
      align-items: center;
    }

    .content-left {
      flex: 1.2;
      display: flex;
      flex-direction: column;
      gap: 28px;
    }

    .logo-row {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .logo-row img { width: 52px; height: 52px; object-fit: contain; }

    .wordmark {
      font-weight: 700;
      font-size: 30px;
      color: #ffffff;
    }

    h1 {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-size: 72px;
      line-height: 1.06;
      color: #ffffff;
    }

    .accent-coral {
      font-style: italic;
      background: linear-gradient(135deg, #FF7A4A, #FFa070);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .subtitle {
      font-size: 22px;
      color: rgba(255,255,255,0.72);
      line-height: 1.5;
      max-width: 540px;
    }

    .stats-row { display: flex; gap: 40px; margin-top: 8px; }

    .stat-pill {
      background: rgba(46,212,199,0.08);
      border: 1px solid rgba(46,212,199,0.20);
      border-radius: 16px;
      padding: 16px 24px;
    }

    .stat-number {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      font-size: 36px;
      color: #2ED4C7;
    }

    .stat-label {
      font-size: 13px;
      color: rgba(255,255,255,0.55);
      margin-top: 2px;
    }

    .content-right {
      flex: 0.8;
    }

    .img-placeholder {
      width: 100%;
      aspect-ratio: 4/5;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.4);
      font-size: 17px;
      font-style: italic;
      overflow: hidden;
    }

    .img-placeholder img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        slide.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', resize);
      resize(); setTimeout(resize, 50); setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#0F1419;width:100%;height:100vh;">
  <div class="slide">
    <div class="grain"></div>
    <div class="glass-card">
      <div class="content-left">
        <div class="logo-row">
          <img src="${LOGO_URL}" alt="Xending" />
          <span class="wordmark">xending</span>
        </div>
        <h1>
          ¿Cuánto le está costando el tipo de cambio a tu empresa
          <span class="accent-coral">cada mes?</span>
        </h1>
        <p class="subtitle">
          La mayoría de los CFOs no lo saben con exactitud.
          Xending Global te lo muestra — y te ayuda a reducirlo.
        </p>
        <div class="stats-row">
          <div class="stat-pill">
            <div class="stat-number">15+</div>
            <div class="stat-label">Años en FX</div>
          </div>
          <div class="stat-pill">
            <div class="stat-number">130+</div>
            <div class="stat-label">Divisas</div>
          </div>
          <div class="stat-pill">
            <div class="stat-number">1 día</div>
            <div class="stat-label">Pagos a Asia</div>
          </div>
        </div>
      </div>
      <div class="content-right">
        <div class="img-placeholder">📊 Imagen: Dashboard / Plataforma</div>
      </div>
    </div>
  </div>
</body>
</html>`;

// ─── SLIDE 1 V6: Cover — Orb Halo (Oscura, editorial premium) ───────────────

export const slide01_cover_v6: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${FONTS}');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #0A0E14; }

    .slide {
      width: 1920px;
      height: 1080px;
      position: relative;
      overflow: hidden;
      font-family: 'Poppins', sans-serif;
      background:
        radial-gradient(ellipse 1200px 1000px at 75% 50%, rgba(46,212,199,0.22) 0%, rgba(46,212,199,0.05) 40%, transparent 70%),
        radial-gradient(ellipse 900px 700px at 85% 60%, rgba(255,122,74,0.10) 0%, transparent 55%),
        linear-gradient(135deg, #0A0E14 0%, #141C28 50%, #0A0E14 100%);
      transform-origin: top left;
    }

    /* Luminous orb — right side, partially off-canvas */
    .orb-halo {
      position: absolute;
      right: -280px;
      top: 50%;
      transform: translateY(-50%);
      width: 1300px;
      height: 1300px;
      pointer-events: none;
      z-index: 1;
    }

    .orb-halo img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      opacity: 0.18;
      filter: drop-shadow(0 0 80px rgba(46,212,199,0.35));
    }

    .grain {
      position: absolute;
      inset: 0;
      opacity: 0.06;
      mix-blend-mode: overlay;
      pointer-events: none;
      background-image: ${GRAIN};
      z-index: 2;
    }

    .slide-content {
      position: relative;
      z-index: 3;
      width: 100%;
      height: 100%;
      padding: 96px 120px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .top-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo-row {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .logo-row img { width: 52px; height: 52px; object-fit: contain; }

    .wordmark {
      font-weight: 700;
      font-size: 28px;
      color: #ffffff;
    }

    .eyebrow-text {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 500;
      color: #2ED4C7;
      letter-spacing: 4px;
      text-transform: uppercase;
    }

    .main-block {
      display: flex;
      flex-direction: column;
      gap: 36px;
      max-width: 1150px;
    }

    .eyebrow-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 500;
      color: #2ED4C7;
      letter-spacing: 5px;
      text-transform: uppercase;
    }

    h1 {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-size: 92px;
      line-height: 1.02;
      color: #ffffff;
      letter-spacing: -1px;
    }

    .accent-coral {
      font-style: italic;
      background: linear-gradient(135deg, #FF7A4A, #FFa070);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .subtitle {
      font-size: 24px;
      font-weight: 400;
      color: rgba(255,255,255,0.65);
      line-height: 1.5;
      max-width: 640px;
    }

    /* Minimal stats row */
    .stats-row {
      display: flex;
      align-items: flex-start;
      gap: 0;
      margin-top: 8px;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 0 48px;
      border-left: 1px solid rgba(255,255,255,0.12);
    }

    .stat-item:first-child {
      padding-left: 0;
      border-left: none;
    }

    .stat-number {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      font-size: 48px;
      color: #2ED4C7;
      line-height: 1;
    }

    .stat-label {
      font-family: 'Poppins', sans-serif;
      font-size: 12px;
      color: rgba(255,255,255,0.5);
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    .footer-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 24px;
    }

    .signature-line {
      flex: 1;
      height: 2px;
      background: linear-gradient(90deg, #FF7A4A 0%, #2ED4C7 100%);
      border-radius: 1px;
      margin-right: 32px;
      max-width: 520px;
    }

    .slide-meta {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: rgba(255,255,255,0.4);
      letter-spacing: 2px;
      text-transform: uppercase;
    }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        slide.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', resize);
      resize(); setTimeout(resize, 50); setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#0A0E14;width:100%;height:100vh;">
  <div class="slide">
    <div class="orb-halo">
      <img src="${LOGO_URL}" alt="" />
    </div>
    <div class="grain"></div>
    <div class="slide-content">
      <div class="top-row">
        <div class="logo-row">
          <img src="${LOGO_URL}" alt="Xending" />
          <span class="wordmark">xending</span>
        </div>
        <span class="eyebrow-text">Global FX · 2026</span>
      </div>

      <div class="main-block">
        <span class="eyebrow-tag">Pitch · Executive Deck</span>
        <h1>
          ¿Cuánto le está costando el tipo de cambio a tu empresa
          <span class="accent-coral">cada mes?</span>
        </h1>
        <p class="subtitle">
          La mayoría de los CFOs no lo saben con exactitud.
          Xending Global te lo muestra — y te ayuda a reducirlo.
        </p>
        <div class="stats-row">
          <div class="stat-item">
            <span class="stat-number">15+</span>
            <span class="stat-label">Años en FX</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">130+</span>
            <span class="stat-label">Divisas</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">1 día</span>
            <span class="stat-label">Pagos a Asia</span>
          </div>
        </div>
      </div>

      <div class="footer-row">
        <div class="signature-line"></div>
        <span class="slide-meta">01 · Cover · Xending Global</span>
      </div>
    </div>
  </div>
</body>
</html>`;

// ─── SLIDE 1 V7: Cover — Orb Halo Light (Clara, editorial premium) ──────────

export const slide01_cover_v7: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${FONTS}');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #F8F5F1; }

    .slide {
      width: 1920px;
      height: 1080px;
      position: relative;
      overflow: hidden;
      font-family: 'Poppins', sans-serif;
      background:
        radial-gradient(ellipse 1200px 1000px at 75% 50%, rgba(46,212,199,0.25) 0%, rgba(46,212,199,0.06) 40%, transparent 70%),
        radial-gradient(ellipse 900px 700px at 85% 60%, rgba(255,122,74,0.18) 0%, transparent 55%),
        radial-gradient(ellipse 700px 600px at 10% 90%, rgba(255,122,74,0.08) 0%, transparent 60%),
        linear-gradient(135deg, #F8F5F1 0%, #F0EBE3 50%, #F8F5F1 100%);
      transform-origin: top left;
    }

    /* Luminous orb — right side, partially off-canvas */
    .orb-halo {
      position: absolute;
      right: -280px;
      top: 50%;
      transform: translateY(-50%);
      width: 1300px;
      height: 1300px;
      pointer-events: none;
      z-index: 1;
    }

    .orb-halo img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      opacity: 0.28;
      filter: drop-shadow(0 0 80px rgba(46,212,199,0.30));
    }

    .grain {
      position: absolute;
      inset: 0;
      opacity: 0.08;
      mix-blend-mode: multiply;
      pointer-events: none;
      background-image: ${GRAIN};
      z-index: 2;
    }

    .slide-content {
      position: relative;
      z-index: 3;
      width: 100%;
      height: 100%;
      padding: 96px 120px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .top-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo-row {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .logo-row img { width: 52px; height: 52px; object-fit: contain; }

    .wordmark {
      font-weight: 700;
      font-size: 28px;
      color: #0F1419;
    }

    .eyebrow-text {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 500;
      color: #1FB8AC;
      letter-spacing: 4px;
      text-transform: uppercase;
    }

    .main-block {
      display: flex;
      flex-direction: column;
      gap: 36px;
      max-width: 1150px;
    }

    .eyebrow-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 500;
      color: #1FB8AC;
      letter-spacing: 5px;
      text-transform: uppercase;
    }

    h1 {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-size: 92px;
      line-height: 1.02;
      color: #0F1419;
      letter-spacing: -1px;
    }

    .accent-coral {
      font-style: italic;
      background: linear-gradient(135deg, #FF7A4A, #E85A2C);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .subtitle {
      font-size: 24px;
      font-weight: 400;
      color: rgba(15,20,25,0.65);
      line-height: 1.5;
      max-width: 640px;
    }

    /* Minimal stats row */
    .stats-row {
      display: flex;
      align-items: flex-start;
      gap: 0;
      margin-top: 8px;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 0 48px;
      border-left: 1px solid rgba(15,20,25,0.15);
    }

    .stat-item:first-child {
      padding-left: 0;
      border-left: none;
    }

    .stat-number {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      font-size: 48px;
      color: #1FB8AC;
      line-height: 1;
    }

    .stat-label {
      font-family: 'Poppins', sans-serif;
      font-size: 12px;
      color: rgba(15,20,25,0.5);
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    .footer-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 24px;
    }

    .signature-line {
      flex: 1;
      height: 2px;
      background: linear-gradient(90deg, #FF7A4A 0%, #2ED4C7 100%);
      border-radius: 1px;
      margin-right: 32px;
      max-width: 520px;
    }

    .slide-meta {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: rgba(15,20,25,0.4);
      letter-spacing: 2px;
      text-transform: uppercase;
    }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        slide.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', resize);
      resize(); setTimeout(resize, 50); setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#F8F5F1;width:100%;height:100vh;">
  <div class="slide">
    <div class="orb-halo">
      <img src="${LOGO_URL}" alt="" />
    </div>
    <div class="grain"></div>
    <div class="slide-content">
      <div class="top-row">
        <div class="logo-row">
          <img src="${LOGO_URL}" alt="Xending" />
          <span class="wordmark">xending</span>
        </div>
        <span class="eyebrow-text">Global FX · 2026</span>
      </div>

      <div class="main-block">
        <span class="eyebrow-tag">Pitch · Executive Deck</span>
        <h1>
          ¿Cuánto le está costando el tipo de cambio a tu empresa
          <span class="accent-coral">cada mes?</span>
        </h1>
        <p class="subtitle">
          La mayoría de los CFOs no lo saben con exactitud.
          Xending Global te lo muestra — y te ayuda a reducirlo.
        </p>
        <div class="stats-row">
          <div class="stat-item">
            <span class="stat-number">15+</span>
            <span class="stat-label">Años en FX</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">130+</span>
            <span class="stat-label">Divisas</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">1 día</span>
            <span class="stat-label">Pagos a Asia</span>
          </div>
        </div>
      </div>

      <div class="footer-row">
        <div class="signature-line"></div>
        <span class="slide-meta">01 · Cover · Xending Global</span>
      </div>
    </div>
  </div>
</body>
</html>`;

// ─── SLIDE 1 V8: Cover — Aliado Internacional (Orb Halo + split layout) ─────

export const slide01_cover_v8: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${FONTS}');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #0A0E14; }

    .slide {
      width: 1920px;
      height: 1080px;
      position: relative;
      overflow: hidden;
      font-family: 'Poppins', sans-serif;
      background:
        radial-gradient(ellipse 1200px 1000px at 75% 50%, rgba(46,212,199,0.22) 0%, rgba(46,212,199,0.05) 40%, transparent 70%),
        radial-gradient(ellipse 900px 700px at 85% 60%, rgba(255,122,74,0.10) 0%, transparent 55%),
        linear-gradient(135deg, #0A0E14 0%, #141C28 50%, #0A0E14 100%);
      transform-origin: top left;
    }

    /* Luminous orb — brand mark wrapping the photo, POR DELANTE de la imagen */
    .orb-halo {
      position: absolute;
      right: -240px;
      top: 50%;
      transform: translateY(-50%);
      width: 1400px;
      height: 1400px;
      pointer-events: none;
      z-index: 4;
    }

    .orb-halo img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      opacity: 0.28;
      filter: drop-shadow(0 0 100px rgba(46,212,199,0.40));
    }

    .grain {
      position: absolute;
      inset: 0;
      opacity: 0.06;
      mix-blend-mode: overlay;
      pointer-events: none;
      background-image: ${GRAIN};
      z-index: 2;
    }

    .slide-content {
      position: relative;
      z-index: 3;
      width: 100%;
      height: 100%;
      padding: 80px 100px;
      display: flex;
      gap: 64px;
      align-items: center;
    }

    /* Left text column — por encima del halo */
    .col-left {
      flex: 1.15;
      display: flex;
      flex-direction: column;
      gap: 28px;
      position: relative;
      z-index: 5;
    }

    .logo-row {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .logo-row img { width: 48px; height: 48px; object-fit: contain; }

    .wordmark {
      font-weight: 700;
      font-size: 28px;
      color: #ffffff;
    }

    .eyebrow-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 500;
      color: #2ED4C7;
      letter-spacing: 5px;
      text-transform: uppercase;
      margin-top: 8px;
    }

    h1 {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-size: 84px;
      line-height: 1.02;
      color: #ffffff;
      letter-spacing: -1px;
    }

    .accent-coral {
      font-style: italic;
      background: linear-gradient(135deg, #FF7A4A, #FFa070);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .headline-underline {
      width: 120px;
      height: 3px;
      background: linear-gradient(90deg, #FF7A4A 0%, #2ED4C7 100%);
      border-radius: 2px;
      margin-top: 4px;
    }

    .subtitle {
      font-size: 22px;
      font-weight: 400;
      color: rgba(255,255,255,0.72);
      line-height: 1.55;
      max-width: 640px;
    }

    .subtitle .hl-tq { color: #2ED4C7; font-weight: 500; }
    .subtitle .hl-cr { color: #FF7A4A; font-weight: 500; }

    /* Stats con iconos */
    .stats-row {
      display: flex;
      gap: 48px;
      margin-top: 12px;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .stat-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: rgba(46,212,199,0.10);
      border: 1px solid rgba(46,212,199,0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #2ED4C7;
    }

    .stat-icon svg { width: 24px; height: 24px; }

    .stat-number {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      font-size: 40px;
      color: #2ED4C7;
      line-height: 1;
    }

    .stat-number.same-day {
      font-family: 'Montserrat', sans-serif;
      font-style: italic;
      font-weight: 500;
      font-size: 36px;
    }

    .stat-label {
      font-family: 'Poppins', sans-serif;
      font-size: 12px;
      color: rgba(255,255,255,0.55);
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    /* Right image column — DETRÁS del halo */
    .col-right {
      flex: 0.85;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      z-index: 2;
    }

    /* Contenedor circular — sin overflow hidden para que blend mode funcione contra el fondo */
    .img-placeholder {
      position: relative;
      width: 680px !important;
      height: 680px !important;
      border-radius: 50% !important;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.35);
      font-size: 16px;
      font-style: italic;
      background: transparent;
      box-shadow:
        0 0 60px 10px rgba(46,212,199,0.25),
        0 0 140px 40px rgba(46,212,199,0.12);
      /* Aislamiento desactivado para que blend mode funcione con el fondo real */
      isolation: auto;
    }

    .img-placeholder img {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
      border-radius: 50% !important;
      /* lighten: pixeles oscuros se funden con lo que hay detrás (halo + navy) */
      mix-blend-mode: lighten;
      filter: brightness(1.15) contrast(1.2) saturate(1.25);
    }

    /* Inner color grading ring: une visualmente la foto con los anillos del orb halo */
    .img-placeholder::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: radial-gradient(circle, transparent 60%, rgba(46,212,199,0.20) 85%, rgba(46,212,199,0.35) 100%);
      mix-blend-mode: color;
      pointer-events: none;
    }

    /* Outer feathered glow — suaviza la transición con los anillos del halo */
    .img-placeholder::before {
      content: '';
      position: absolute;
      inset: -15%;
      border-radius: 50%;
      background: radial-gradient(circle, transparent 50%, rgba(46,212,199,0.15) 65%, rgba(46,212,199,0.05) 80%, transparent 100%);
      filter: blur(30px);
      pointer-events: none;
      z-index: -1;
    }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        slide.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', resize);
      resize(); setTimeout(resize, 50); setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#0A0E14;width:100%;height:100vh;">
  <div class="slide">
    <div class="orb-halo">
      <img src="${LOGO_URL}" alt="" />
    </div>
    <div class="grain"></div>
    <div class="slide-content">
      <!-- Left: text -->
      <div class="col-left">
        <div class="logo-row">
          <img src="${LOGO_URL}" alt="Xending" />
          <span class="wordmark">xending</span>
        </div>

        <span class="eyebrow-tag">Global FX · Payments · Treasury</span>

        <h1>
          Tu aliado<br/>
          financiero<br/>
          <span class="accent-coral">internacional</span>
        </h1>

        <div class="headline-underline"></div>

        <p class="subtitle">
          Especialistas en <span class="hl-tq">pagos internacionales</span>,
          <span class="hl-tq">operaciones cambiarias</span> y <span class="hl-cr">coberturas FX</span>
          para empresas que operan globalmente.
        </p>

        <div class="stats-row">
          <div class="stat-item">
            <div class="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div class="stat-number">30+</div>
            <div class="stat-label">Años en FX</div>
          </div>

          <div class="stat-item">
            <div class="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </div>
            <div class="stat-number">130+</div>
            <div class="stat-label">Divisas</div>
          </div>

          <div class="stat-item">
            <div class="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
            <div class="stat-number same-day">Same Day</div>
            <div class="stat-label">Pagos Asia</div>
          </div>
        </div>
      </div>

      <!-- Imagen removida — el orb halo queda solo como elemento visual del lado derecho -->
    </div>
  </div>
</body>
</html>`;

// ─── SLIDE 1 V9: Cover — Halo Portal (foto dentro del orb) ──────────────────

export const slide01_cover_v9: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${FONTS}');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #0A0E14; }

    .slide {
      width: 1920px;
      height: 1080px;
      position: relative;
      overflow: hidden;
      font-family: 'Poppins', sans-serif;
      background:
        radial-gradient(ellipse 1000px 800px at 75% 50%, rgba(46,212,199,0.18) 0%, rgba(46,212,199,0.04) 40%, transparent 70%),
        radial-gradient(ellipse 800px 600px at 85% 70%, rgba(255,122,74,0.10) 0%, transparent 55%),
        linear-gradient(135deg, #0A0E14 0%, #141C28 50%, #0A0E14 100%);
      transform-origin: top left;
    }

    .grain {
      position: absolute;
      inset: 0;
      opacity: 0.06;
      mix-blend-mode: overlay;
      pointer-events: none;
      background-image: ${GRAIN};
      z-index: 2;
    }

    .slide-content {
      position: relative;
      z-index: 3;
      width: 100%;
      height: 100%;
      padding: 80px 100px;
      display: flex;
      gap: 64px;
      align-items: center;
    }

    /* Left text column */
    .col-left {
      flex: 1.05;
      display: flex;
      flex-direction: column;
      gap: 28px;
    }

    .logo-row {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .logo-row img { width: 48px; height: 48px; object-fit: contain; }

    .wordmark {
      font-weight: 700;
      font-size: 28px;
      color: #ffffff;
    }

    .eyebrow-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 500;
      color: #2ED4C7;
      letter-spacing: 5px;
      text-transform: uppercase;
      margin-top: 8px;
    }

    h1 {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-size: 84px;
      line-height: 1.02;
      color: #ffffff;
      letter-spacing: -1px;
    }

    .accent-coral {
      font-style: italic;
      background: linear-gradient(135deg, #FF7A4A, #FFa070);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .headline-underline {
      width: 120px;
      height: 3px;
      background: linear-gradient(90deg, #FF7A4A 0%, #2ED4C7 100%);
      border-radius: 2px;
      margin-top: 4px;
    }

    .subtitle {
      font-size: 22px;
      font-weight: 400;
      color: rgba(255,255,255,0.72);
      line-height: 1.55;
      max-width: 620px;
    }

    .subtitle .hl-tq { color: #2ED4C7; font-weight: 500; }
    .subtitle .hl-cr { color: #FF7A4A; font-weight: 500; }

    .stats-row {
      display: flex;
      gap: 48px;
      margin-top: 12px;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .stat-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: rgba(46,212,199,0.10);
      border: 1px solid rgba(46,212,199,0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #2ED4C7;
    }

    .stat-icon svg { width: 24px; height: 24px; }

    .stat-number {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      font-size: 40px;
      color: #2ED4C7;
      line-height: 1;
    }

    .stat-number.same-day {
      font-family: 'Montserrat', sans-serif;
      font-style: italic;
      font-weight: 500;
      font-size: 36px;
    }

    .stat-label {
      font-family: 'Poppins', sans-serif;
      font-size: 12px;
      color: rgba(255,255,255,0.55);
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    /* Right: Halo Portal — circular photo frame with orb halo */
    .col-right {
      flex: 0.95;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    .halo-portal {
      position: relative;
      width: 720px;
      height: 720px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Outer glow ring — radial turquoise */
    .halo-portal::before {
      content: '';
      position: absolute;
      width: 140%;
      height: 140%;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(46,212,199,0.35) 30%, rgba(46,212,199,0.15) 50%, transparent 72%);
      filter: blur(40px);
      z-index: 0;
    }

    /* Middle glow — coral accent */
    .halo-portal::after {
      content: '';
      position: absolute;
      width: 115%;
      height: 115%;
      border-radius: 50%;
      background: radial-gradient(circle at 70% 70%, rgba(255,122,74,0.30) 0%, rgba(255,122,74,0.08) 40%, transparent 65%);
      filter: blur(30px);
      z-index: 0;
    }

    /* Decorative rings (concentric outlines like orb layers) */
    .ring {
      position: absolute;
      border-radius: 50%;
      border: 1px solid rgba(46,212,199,0.15);
      z-index: 1;
      pointer-events: none;
    }
    .ring-1 { width: 108%; height: 108%; border-color: rgba(46,212,199,0.25); }
    .ring-2 { width: 120%; height: 120%; border-color: rgba(46,212,199,0.12); border-style: dashed; }
    .ring-3 { width: 132%; height: 132%; border-color: rgba(255,122,74,0.10); }

    /* The circular photo container */
    .img-placeholder {
      position: relative;
      z-index: 2;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background:
        radial-gradient(ellipse at center, rgba(46,212,199,0.08) 0%, rgba(15,20,25,0.6) 100%),
        #0F1419;
      border: 2px solid rgba(46,212,199,0.30);
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.5);
      font-size: 16px;
      font-style: italic;
      overflow: hidden;
      box-shadow:
        0 20px 80px rgba(46,212,199,0.20),
        inset 0 0 60px rgba(46,212,199,0.10);
    }

    .img-placeholder img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    /* Corner accent: small floating orb marker */
    .orb-marker {
      position: absolute;
      top: 6%;
      right: 2%;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, #5EEADF 0%, #2ED4C7 40%, #FF7A4A 100%);
      box-shadow: 0 0 30px rgba(46,212,199,0.5);
      z-index: 3;
    }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        slide.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', resize);
      resize(); setTimeout(resize, 50); setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#0A0E14;width:100%;height:100vh;">
  <div class="slide">
    <div class="grain"></div>
    <div class="slide-content">
      <!-- Left: text -->
      <div class="col-left">
        <div class="logo-row">
          <img src="${LOGO_URL}" alt="Xending" />
          <span class="wordmark">xending</span>
        </div>

        <span class="eyebrow-tag">Global FX · Payments · Treasury</span>

        <h1>
          Tu aliado<br/>
          financiero<br/>
          <span class="accent-coral">internacional</span>
        </h1>

        <div class="headline-underline"></div>

        <p class="subtitle">
          Especialistas en <span class="hl-tq">pagos internacionales</span>,
          <span class="hl-tq">operaciones cambiarias</span> y <span class="hl-cr">coberturas FX</span>
          para empresas que operan globalmente.
        </p>

        <div class="stats-row">
          <div class="stat-item">
            <div class="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div class="stat-number">30+</div>
            <div class="stat-label">Años en FX</div>
          </div>

          <div class="stat-item">
            <div class="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </div>
            <div class="stat-number">130+</div>
            <div class="stat-label">Divisas</div>
          </div>

          <div class="stat-item">
            <div class="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
            <div class="stat-number same-day">Same Day</div>
            <div class="stat-label">Pagos Asia</div>
          </div>
        </div>
      </div>

      <!-- Right: Halo Portal -->
      <div class="col-right">
        <div class="halo-portal">
          <div class="ring ring-3"></div>
          <div class="ring ring-2"></div>
          <div class="ring ring-1"></div>
          <div class="img-placeholder">
            🌐 Imagen: Foto editorial global
          </div>
          <div class="orb-marker"></div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

// ─── SLIDE 1 V10: Cover — Navy Split con foto embebida + halo ──────────────

export const slide01_cover_v10: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${FONTS}');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #3d5a75; }

    .slide {
      width: 1920px;
      height: 1080px;
      position: relative;
      overflow: hidden;
      font-family: 'Poppins', sans-serif;
      display: flex;
      transform-origin: top left;
    }

    /* Left: Navy tenue (mismo estilo Portada Navy) */
    .panel-left {
      flex: 1.15;
      background: linear-gradient(160deg, #3d5a75 0%, #4a6a88 30%, #506f8c 50%, #456580 80%, #3d5a75 100%);
      position: relative;
      padding: 72px 80px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 36px;
      overflow: hidden;
    }

    .panel-left::before {
      content: '';
      position: absolute;
      top: -10%;
      left: -5%;
      width: 80%;
      height: 80%;
      background: radial-gradient(ellipse, rgba(46,212,199,0.12) 0%, transparent 55%);
      pointer-events: none;
    }

    .panel-left::after {
      content: '';
      position: absolute;
      bottom: -5%;
      right: -5%;
      width: 70%;
      height: 70%;
      background: radial-gradient(ellipse, rgba(255,120,70,0.10) 0%, transparent 55%);
      pointer-events: none;
    }

    /* Right: cream con foto embebida + halo */
    .panel-right {
      flex: 0.85;
      background: linear-gradient(135deg, #F8F5F1 0%, #F0EBE3 100%);
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px;
      overflow: hidden;
    }

    /* Halo glows detrás de la foto */
    .panel-right::before {
      content: '';
      position: absolute;
      top: 10%;
      left: 10%;
      width: 80%;
      height: 80%;
      background: radial-gradient(circle, rgba(46,212,199,0.22) 0%, rgba(46,212,199,0.06) 40%, transparent 70%);
      filter: blur(30px);
      pointer-events: none;
    }

    .panel-right::after {
      content: '';
      position: absolute;
      bottom: 10%;
      right: 10%;
      width: 70%;
      height: 70%;
      background: radial-gradient(circle, rgba(255,120,70,0.20) 0%, rgba(255,120,70,0.05) 40%, transparent 70%);
      filter: blur(30px);
      pointer-events: none;
    }

    /* Foto — rounded rectangle grande que llena el panel */
    .img-placeholder {
      position: relative;
      z-index: 2;
      width: 100%;
      height: 88%;
      border-radius: 32px;
      overflow: hidden;
      background:
        radial-gradient(ellipse at center, rgba(46,212,199,0.10) 0%, rgba(255,120,70,0.06) 100%),
        #1a2838;
      box-shadow:
        0 30px 80px rgba(15,20,25,0.25),
        0 10px 30px rgba(46,212,199,0.15),
        inset 0 0 0 1px rgba(255,255,255,0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.5);
      font-size: 17px;
      font-style: italic;
    }

    .img-placeholder img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    /* Decorative ring around the photo (subtle) */
    .photo-ring {
      position: absolute;
      inset: 24px;
      border-radius: 40px;
      border: 1px dashed rgba(46,212,199,0.25);
      pointer-events: none;
      z-index: 1;
    }

    /* Small floating orb accent on the photo corner */
    .orb-accent {
      position: absolute;
      top: -18px;
      right: -18px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, #5EEADF 0%, #2ED4C7 40%, #FF7A4A 100%);
      box-shadow: 0 0 30px rgba(46,212,199,0.6);
      z-index: 3;
    }

    .grain {
      position: absolute;
      inset: 0;
      opacity: 0.05;
      mix-blend-mode: overlay;
      pointer-events: none;
      background-image: ${GRAIN};
    }

    /* Typography */
    .logo-row {
      display: flex;
      align-items: center;
      gap: 16px;
      position: relative;
      z-index: 1;
    }

    .logo-row img { width: 52px; height: 52px; object-fit: contain; }

    .wordmark {
      font-weight: 700;
      font-size: 30px;
      color: #ffffff;
    }

    h1 {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-size: 72px;
      line-height: 1.08;
      color: #ffffff;
      position: relative;
      z-index: 1;
    }

    .accent-coral {
      font-style: italic;
      background: linear-gradient(135deg, #FF7A4A, #FFa070);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .subtitle {
      font-size: 24px;
      color: rgba(255,255,255,0.75);
      line-height: 1.5;
      max-width: 580px;
      position: relative;
      z-index: 1;
    }

    .stats-row {
      display: flex;
      gap: 48px;
      position: relative;
      z-index: 1;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .stat-number {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      font-size: 44px;
      color: #2ED4C7;
    }

    .stat-label {
      font-size: 15px;
      color: rgba(255,255,255,0.55);
    }

    .divider-accent {
      position: absolute;
      top: 10%;
      bottom: 10%;
      right: 0;
      width: 4px;
      background: linear-gradient(180deg, #2ED4C7, #FF7A4A);
      border-radius: 2px;
      z-index: 2;
    }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        slide.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', resize);
      resize(); setTimeout(resize, 50); setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#3d5a75;width:100%;height:100vh;">
  <div class="slide">
    <!-- Left: Navy tenue panel -->
    <div class="panel-left">
      <div class="logo-row">
        <img src="${LOGO_URL}" alt="Xending" />
        <span class="wordmark">xending</span>
      </div>

      <h1>
        ¿Cuánto le está costando el tipo de cambio a tu empresa
        <span class="accent-coral">cada mes?</span>
      </h1>

      <p class="subtitle">
        La mayoría de los CFOs no lo saben con exactitud.
        Xending Global te lo muestra — y te ayuda a reducirlo.
      </p>

      <div class="stats-row">
        <div class="stat-item">
          <span class="stat-number">15+</span>
          <span class="stat-label">Años en FX</span>
        </div>
        <div class="stat-item">
          <span class="stat-number">130+</span>
          <span class="stat-label">Divisas</span>
        </div>
        <div class="stat-item">
          <span class="stat-number">1 día</span>
          <span class="stat-label">Pagos a Asia</span>
        </div>
      </div>

      <div class="divider-accent"></div>
    </div>

    <!-- Right: foto embebida con halo -->
    <div class="panel-right">
      <div class="photo-ring"></div>
      <div class="img-placeholder">
        🌐 Imagen: Reemplázame
        <!-- Cuando tengas la imagen, reemplaza la línea de arriba por:
             <img src="URL_DE_TU_IMAGEN" alt="" /> -->
      </div>
      <div class="orb-accent"></div>
    </div>
  </div>
</body>
</html>`;

// ─── SLIDE 1 V11: Cover — Aliado Fusion (foto integrada al navy) ────────────

export const slide01_cover_v11: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${FONTS}');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #0A0E14; }

    .slide {
      width: 1920px;
      height: 1080px;
      position: relative;
      overflow: hidden;
      font-family: 'Poppins', sans-serif;
      background:
        radial-gradient(ellipse 900px 700px at 15% 20%, rgba(46,212,199,0.08) 0%, transparent 55%),
        linear-gradient(135deg, #0A0E14 0%, #141C28 50%, #0A0E14 100%);
      transform-origin: top left;
    }

    /* Ambient turquoise halo that spills from the right image into the left panel */
    .ambient-halo {
      position: absolute;
      top: 50%;
      right: -100px;
      width: 1400px;
      height: 1400px;
      transform: translateY(-50%);
      background:
        radial-gradient(circle, rgba(46,212,199,0.22) 0%, rgba(46,212,199,0.08) 25%, transparent 50%),
        radial-gradient(circle at 60% 60%, rgba(255,122,74,0.14) 0%, transparent 40%);
      filter: blur(60px);
      pointer-events: none;
      z-index: 1;
    }

    .grain {
      position: absolute;
      inset: 0;
      opacity: 0.06;
      mix-blend-mode: overlay;
      pointer-events: none;
      background-image: ${GRAIN};
      z-index: 3;
    }

    .slide-content {
      position: relative;
      z-index: 2;
      width: 100%;
      height: 100%;
      padding: 80px 100px;
      display: flex;
      gap: 40px;
      align-items: center;
    }

    /* Left text column */
    .col-left {
      flex: 1.05;
      display: flex;
      flex-direction: column;
      gap: 28px;
      z-index: 4;
    }

    .logo-row {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .logo-row img { width: 48px; height: 48px; object-fit: contain; }

    .wordmark {
      font-weight: 700;
      font-size: 28px;
      color: #ffffff;
    }

    .eyebrow-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 500;
      color: #2ED4C7;
      letter-spacing: 5px;
      text-transform: uppercase;
      margin-top: 8px;
    }

    h1 {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-size: 84px;
      line-height: 1.02;
      color: #ffffff;
      letter-spacing: -1px;
    }

    .accent-coral {
      font-style: italic;
      background: linear-gradient(135deg, #FF7A4A, #FFa070);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .headline-underline {
      width: 120px;
      height: 3px;
      background: linear-gradient(90deg, #FF7A4A 0%, #2ED4C7 100%);
      border-radius: 2px;
      margin-top: 4px;
    }

    .subtitle {
      font-size: 22px;
      color: rgba(255,255,255,0.72);
      line-height: 1.55;
      max-width: 620px;
    }

    .subtitle .hl-tq { color: #2ED4C7; font-weight: 500; }
    .subtitle .hl-cr { color: #FF7A4A; font-weight: 500; }

    .stats-row { display: flex; gap: 48px; margin-top: 12px; }

    .stat-item { display: flex; flex-direction: column; gap: 10px; }

    .stat-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: rgba(46,212,199,0.10);
      border: 1px solid rgba(46,212,199,0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #2ED4C7;
    }

    .stat-icon svg { width: 24px; height: 24px; }

    .stat-number {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      font-size: 40px;
      color: #2ED4C7;
      line-height: 1;
    }

    .stat-number.same-day {
      font-family: 'Montserrat', sans-serif;
      font-style: italic;
      font-weight: 500;
      font-size: 36px;
    }

    .stat-label {
      font-family: 'Poppins', sans-serif;
      font-size: 12px;
      color: rgba(255,255,255,0.55);
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    /* Right: fused image — no border, masked edges, blend modes */
    .col-right {
      flex: 0.95;
      height: 100%;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
    }

    /* The image container — imagen limpia (sin fundido/blend automático).
       El difuminado es OPCIONAL: aplícalo desde el control "Difuminar" del editor. */
    .img-placeholder {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.35);
      font-size: 16px;
      font-style: italic;
      overflow: hidden;
      border-radius: 16px;
    }

    .img-placeholder img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 16px;
    }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        slide.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', resize);
      resize(); setTimeout(resize, 50); setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#0A0E14;width:100%;height:100vh;">
  <div class="slide">
    <div class="ambient-halo"></div>
    <div class="grain"></div>
    <div class="slide-content">
      <!-- Left: text -->
      <div class="col-left">
        <div class="logo-row">
          <img src="${LOGO_URL}" alt="Xending" />
          <span class="wordmark">xending</span>
        </div>

        <span class="eyebrow-tag">Global FX · Payments · Treasury</span>

        <h1>
          Tu aliado<br/>
          financiero<br/>
          <span class="accent-coral">internacional</span>
        </h1>

        <div class="headline-underline"></div>

        <p class="subtitle">
          Especialistas en <span class="hl-tq">pagos internacionales</span>,
          <span class="hl-tq">operaciones cambiarias</span> y <span class="hl-cr">coberturas FX</span>
          para empresas que operan globalmente.
        </p>

        <div class="stats-row">
          <div class="stat-item">
            <div class="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div class="stat-number">30+</div>
            <div class="stat-label">Años en FX</div>
          </div>

          <div class="stat-item">
            <div class="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </div>
            <div class="stat-number">130+</div>
            <div class="stat-label">Divisas</div>
          </div>

          <div class="stat-item">
            <div class="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
            <div class="stat-number same-day">Same Day</div>
            <div class="stat-label">Pagos Asia</div>
          </div>
        </div>
      </div>

      <!-- Right: fused image -->
      <div class="col-right">
        <div class="img-placeholder">
          🌐 Imagen: reemplázame con foto editorial
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

// ─── SLIDE 1 V12: Cover — Aliado + Orb Envolvente (foto dentro del halo) ────

export const slide01_cover_v12: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${FONTS}');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #0A0E14; }

    .slide {
      width: 1920px;
      height: 1080px;
      position: relative;
      overflow: hidden;
      font-family: 'Poppins', sans-serif;
      background:
        radial-gradient(ellipse 1200px 1000px at 75% 50%, rgba(46,212,199,0.22) 0%, rgba(46,212,199,0.05) 40%, transparent 70%),
        radial-gradient(ellipse 900px 700px at 85% 60%, rgba(255,122,74,0.10) 0%, transparent 55%),
        linear-gradient(135deg, #0A0E14 0%, #141C28 50%, #0A0E14 100%);
      transform-origin: top left;
    }

    /* Orb del logo gigante envolviendo el lado derecho */
    .orb-halo {
      position: absolute;
      right: -280px;
      top: 50%;
      transform: translateY(-50%);
      width: 1300px;
      height: 1300px;
      pointer-events: none;
      z-index: 1;
    }

    .orb-halo img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      opacity: 0.22;
      filter: drop-shadow(0 0 80px rgba(46,212,199,0.35));
    }

    .grain {
      position: absolute;
      inset: 0;
      opacity: 0.06;
      mix-blend-mode: overlay;
      pointer-events: none;
      background-image: ${GRAIN};
      z-index: 3;
    }

    .slide-content {
      position: relative;
      z-index: 2;
      width: 100%;
      height: 100%;
      padding: 80px 100px;
      display: flex;
      gap: 40px;
      align-items: center;
    }

    /* Left text column */
    .col-left {
      flex: 1.05;
      display: flex;
      flex-direction: column;
      gap: 28px;
      z-index: 4;
    }

    .logo-row { display: flex; align-items: center; gap: 14px; }
    .logo-row img { width: 48px; height: 48px; object-fit: contain; }

    .wordmark { font-weight: 700; font-size: 28px; color: #ffffff; }

    .eyebrow-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 500;
      color: #2ED4C7;
      letter-spacing: 5px;
      text-transform: uppercase;
      margin-top: 8px;
    }

    h1 {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-size: 84px;
      line-height: 1.02;
      color: #ffffff;
      letter-spacing: -1px;
    }

    .accent-coral {
      font-style: italic;
      background: linear-gradient(135deg, #FF7A4A, #FFa070);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .headline-underline {
      width: 120px;
      height: 3px;
      background: linear-gradient(90deg, #FF7A4A 0%, #2ED4C7 100%);
      border-radius: 2px;
      margin-top: 4px;
    }

    .subtitle {
      font-size: 22px;
      color: rgba(255,255,255,0.72);
      line-height: 1.55;
      max-width: 620px;
    }

    .subtitle .hl-tq { color: #2ED4C7; font-weight: 500; }
    .subtitle .hl-cr { color: #FF7A4A; font-weight: 500; }

    .stats-row { display: flex; gap: 48px; margin-top: 12px; }
    .stat-item { display: flex; flex-direction: column; gap: 10px; }

    .stat-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: rgba(46,212,199,0.10);
      border: 1px solid rgba(46,212,199,0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #2ED4C7;
    }

    .stat-icon svg { width: 24px; height: 24px; }

    .stat-number {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      font-size: 40px;
      color: #2ED4C7;
      line-height: 1;
    }

    .stat-number.same-day {
      font-family: 'Montserrat', sans-serif;
      font-style: italic;
      font-weight: 500;
      font-size: 36px;
    }

    .stat-label {
      font-family: 'Poppins', sans-serif;
      font-size: 12px;
      color: rgba(255,255,255,0.55);
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    /* Right: imagen circular integrada al halo del orb */
    .col-right {
      flex: 0.95;
      height: 100%;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
    }

    /* Foto circular fusionada con el halo */
    .img-placeholder {
      position: relative;
      width: 680px;
      height: 680px;
      border-radius: 50%;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.4);
      font-size: 16px;
      font-style: italic;
      /* Glow que se expande hacia los anillos del orb */
      box-shadow:
        0 0 0 2px rgba(46,212,199,0.25),
        0 0 80px 20px rgba(46,212,199,0.20),
        0 0 150px 40px rgba(46,212,199,0.10);
      background: #0A0E14;
      /* Máscara radial — la foto se funde suavemente con el halo en los bordes */
      -webkit-mask-image: radial-gradient(circle at center, #000 55%, rgba(0,0,0,0.85) 75%, rgba(0,0,0,0.4) 92%, transparent 100%);
      mask-image: radial-gradient(circle at center, #000 55%, rgba(0,0,0,0.85) 75%, rgba(0,0,0,0.4) 92%, transparent 100%);
    }

    .img-placeholder img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      /* Si la imagen tiene navy oscuro, se mezcla con el fondo */
      mix-blend-mode: screen;
      filter: brightness(1.05) contrast(1.08) saturate(1.12);
    }

    /* Color unify layer — iguala temperatura con el halo */
    .img-placeholder::after {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(circle, transparent 50%, rgba(46,212,199,0.15) 90%);
      mix-blend-mode: color;
      pointer-events: none;
    }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        slide.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', resize);
      resize(); setTimeout(resize, 50); setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#0A0E14;width:100%;height:100vh;">
  <div class="slide">
    <!-- Orb halo envolvente que queda detrás de la imagen -->
    <div class="orb-halo">
      <img src="${LOGO_URL}" alt="" />
    </div>
    <div class="grain"></div>
    <div class="slide-content">
      <!-- Left: text -->
      <div class="col-left">
        <div class="logo-row">
          <img src="${LOGO_URL}" alt="Xending" />
          <span class="wordmark">xending</span>
        </div>

        <span class="eyebrow-tag">Global FX · Payments · Treasury</span>

        <h1>
          Tu aliado<br/>
          financiero<br/>
          <span class="accent-coral">internacional</span>
        </h1>

        <div class="headline-underline"></div>

        <p class="subtitle">
          Especialistas en <span class="hl-tq">pagos internacionales</span>,
          <span class="hl-tq">operaciones cambiarias</span> y <span class="hl-cr">coberturas FX</span>
          para empresas que operan globalmente.
        </p>

        <div class="stats-row">
          <div class="stat-item">
            <div class="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div class="stat-number">30+</div>
            <div class="stat-label">Años en FX</div>
          </div>

          <div class="stat-item">
            <div class="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </div>
            <div class="stat-number">130+</div>
            <div class="stat-label">Divisas</div>
          </div>

          <div class="stat-item">
            <div class="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
            <div class="stat-number same-day">Same Day</div>
            <div class="stat-label">Pagos Asia</div>
          </div>
        </div>
      </div>

      <!-- Right: imagen circular envuelta por el orb halo -->
      <div class="col-right">
        <div class="img-placeholder">
          🌐 Imagen editorial
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

// ─── SLIDE 2 V1: Servicios — Orb central con conexiones ─────────────────────

export const slide02_services_v1: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${FONTS}');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #0A0E14; }

    .slide {
      width: 1920px;
      height: 1080px;
      position: relative;
      overflow: hidden;
      font-family: 'Poppins', sans-serif;
      background:
        radial-gradient(ellipse 1000px 800px at 50% 50%, rgba(46,212,199,0.18) 0%, rgba(46,212,199,0.04) 45%, transparent 70%),
        radial-gradient(ellipse 700px 500px at 50% 50%, rgba(255,122,74,0.08) 0%, transparent 55%),
        linear-gradient(135deg, #0A0E14 0%, #141C28 50%, #0A0E14 100%);
      transform-origin: top left;
    }

    .grain {
      position: absolute;
      inset: 0;
      opacity: 0.06;
      mix-blend-mode: overlay;
      pointer-events: none;
      background-image: ${GRAIN};
      z-index: 2;
    }

    /* Header title block */
    .header-block {
      position: absolute;
      top: 90px;
      left: 50%;
      transform: translateX(-50%);
      text-align: center;
      z-index: 5;
    }

    .eyebrow-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 500;
      color: #2ED4C7;
      letter-spacing: 5px;
      text-transform: uppercase;
      margin-bottom: 12px;
    }

    h1 {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-size: 46px;
      line-height: 1.1;
      color: #ffffff;
      letter-spacing: -0.5px;
    }

    h1 .accent-coral {
      font-style: italic;
      background: linear-gradient(135deg, #FF7A4A, #FFa070);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    /* Connection lines — gradient flow */
    .connections {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 1;
    }

    /* Central orb — sólido, sin competir con anillos */
    .orb-center {
      position: absolute;
      top: 52%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 200px;
      height: 200px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 3;
    }

    .orb-ring-1,
    .orb-ring-2,
    .orb-ring-3 {
      position: absolute;
      border-radius: 50%;
      pointer-events: none;
    }

    .orb-ring-1 {
      width: 260px;
      height: 260px;
      border: 1.5px solid rgba(46,212,199,0.50);
      box-shadow:
        0 0 40px rgba(46,212,199,0.25),
        inset 0 0 30px rgba(46,212,199,0.10);
    }

    .orb-ring-2 {
      width: 340px;
      height: 340px;
      border: 1px solid rgba(46,212,199,0.25);
      border-style: dashed;
    }

    .orb-ring-3 {
      width: 430px;
      height: 430px;
      border: 1px solid rgba(46,212,199,0.12);
    }

    .orb-center img {
      width: 180px;
      height: 180px;
      object-fit: contain;
      filter: drop-shadow(0 0 50px rgba(46,212,199,0.55));
      position: relative;
      z-index: 2;
    }

    /* Service nodes — posicionados radialmente */
    .service-node {
      position: absolute;
      display: flex;
      align-items: flex-start;
      gap: 20px;
      max-width: 340px;
      z-index: 4;
    }

    .service-node.align-right {
      flex-direction: row-reverse;
      text-align: right;
    }

    /* Icon con doble ring como en la referencia */
    .service-icon {
      flex-shrink: 0;
      width: 84px;
      height: 84px;
      border-radius: 50%;
      background: radial-gradient(circle at 50% 50%, rgba(46,212,199,0.25) 0%, rgba(46,212,199,0.06) 70%, transparent 100%);
      border: 2px solid rgba(46,212,199,0.60);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #2ED4C7;
      position: relative;
      box-shadow:
        inset 0 0 28px rgba(46,212,199,0.22),
        0 0 48px rgba(46,212,199,0.28);
    }

    /* Dashed outer ring around icon */
    .service-icon::after {
      content: '';
      position: absolute;
      inset: -10px;
      border-radius: 50%;
      border: 1px dashed rgba(46,212,199,0.35);
      pointer-events: none;
    }

    .service-icon svg { width: 38px; height: 38px; }

    .service-text { flex: 1; }

    /* Títulos de servicio: primera palabra coral, segunda blanca */
    h3 {
      font-family: 'Poppins', sans-serif;
      font-weight: 700;
      font-size: 20px;
      letter-spacing: 2px;
      text-transform: uppercase;
      line-height: 1.2;
      margin-bottom: 10px;
      color: #ffffff;
    }

    h3 .kw {
      color: #FF7A4A;
    }

    .subtitle {
      font-family: 'Poppins', sans-serif;
      font-weight: 500;
      font-size: 17px;
      color: #2ED4C7;
      line-height: 1.3;
      margin-bottom: 12px;
      text-shadow: 0 0 20px rgba(46,212,199,0.3);
    }

    .body {
      font-family: 'Poppins', sans-serif;
      font-weight: 400;
      font-size: 15px;
      color: rgba(255,255,255,0.82);
      line-height: 1.55;
    }

    .body .hl-tq { color: #2ED4C7; font-weight: 500; }
    .body .hl-cr { color: #FF7A4A; font-weight: 600; }

    .body ul {
      list-style: none;
      padding: 0;
    }

    .body li {
      padding-left: 16px;
      position: relative;
      margin-bottom: 6px;
      color: rgba(255,255,255,0.82);
    }

    .body li::before {
      content: '▸';
      color: #FF7A4A;
      position: absolute;
      left: 0;
      font-size: 13px;
    }

    /* Positions — distribución radial simétrica (satélites más grandes) */
    .node-fx           { top: 260px; left: 50%; transform: translateX(-50%); text-align: center; }
    .node-fx           { flex-direction: column; align-items: center; max-width: 320px; }
    .node-pagos        { top: 400px; left: 50px; }
    .node-coberturas   { top: 400px; right: 50px; }
    .node-multidivisa  { top: 670px; left: 50px; }
    .node-financiamiento { top: 670px; right: 50px; }

    /* Bottom feature bar — limpio, sin caja */
    .feature-bar {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      bottom: 40px;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 64px;
      z-index: 5;
    }

    .feature-item {
      display: flex;
      align-items: center;
      gap: 14px;
      position: relative;
    }

    .feature-item:not(:last-child)::after {
      content: '';
      position: absolute;
      right: -32px;
      top: 50%;
      transform: translateY(-50%);
      width: 1px;
      height: 32px;
      background: rgba(46,212,199,0.25);
    }

    .feature-icon {
      width: 36px;
      height: 36px;
      color: #2ED4C7;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .feature-icon svg { width: 26px; height: 26px; }

    .feature-label {
      font-family: 'Poppins', sans-serif;
      font-weight: 600;
      font-size: 12px;
      color: rgba(255,255,255,0.85);
      letter-spacing: 1.5px;
      text-transform: uppercase;
      line-height: 1.25;
    }

    /* Top brand row */
    .brand-row {
      position: absolute;
      top: 40px;
      left: 50px;
      display: flex;
      align-items: center;
      gap: 14px;
      z-index: 5;
    }

    .brand-row img { width: 38px; height: 38px; object-fit: contain; }

    .wordmark {
      font-weight: 700;
      font-size: 22px;
      color: #ffffff;
    }

    .slide-meta {
      position: absolute;
      top: 48px;
      right: 50px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: #2ED4C7;
      letter-spacing: 4px;
      text-transform: uppercase;
      z-index: 5;
    }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        slide.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', resize);
      resize(); setTimeout(resize, 50); setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#0A0E14;width:100%;height:100vh;">
  <div class="slide">
    <div class="grain"></div>

    <!-- Brand lockup -->
    <div class="brand-row logo-row">
      <img src="${LOGO_URL}" alt="Xending" />
      <span class="wordmark">xending</span>
    </div>

    <span class="slide-meta">02 · Ecosistema</span>

    <!-- Header title -->
    <div class="header-block">
      <span class="eyebrow-tag">Nuestro Ecosistema</span>
      <h1>Todo tu ecosistema financiero <span class="accent-coral">internacional</span><br/>En una sola plataforma</h1>
    </div>

    <!-- Connection lines with gradient flow -->
    <svg class="connections" viewBox="0 0 1920 1080" preserveAspectRatio="none">
      <defs>
        <linearGradient id="flow" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stop-color="#2ED4C7" stop-opacity="0.70"/>
          <stop offset="50%"  stop-color="#2ED4C7" stop-opacity="0.30"/>
          <stop offset="100%" stop-color="#2ED4C7" stop-opacity="0.10"/>
        </linearGradient>
        <radialGradient id="flowRadial" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stop-color="#2ED4C7" stop-opacity="0.60"/>
          <stop offset="100%" stop-color="#2ED4C7" stop-opacity="0.08"/>
        </radialGradient>
      </defs>
      <!-- lines from center (960, 600) to each node -->
      <line x1="960" y1="600" x2="960"  y2="320" stroke="url(#flowRadial)" stroke-width="1.8" stroke-dasharray="3 5"/>
      <line x1="960" y1="600" x2="260"  y2="470" stroke="url(#flowRadial)" stroke-width="1.8" stroke-dasharray="3 5"/>
      <line x1="960" y1="600" x2="1660" y2="470" stroke="url(#flowRadial)" stroke-width="1.8" stroke-dasharray="3 5"/>
      <line x1="960" y1="600" x2="260"  y2="730" stroke="url(#flowRadial)" stroke-width="1.8" stroke-dasharray="3 5"/>
      <line x1="960" y1="600" x2="1660" y2="730" stroke="url(#flowRadial)" stroke-width="1.8" stroke-dasharray="3 5"/>
    </svg>

    <!-- Central orb with rings -->
    <div class="orb-center logo-row">
      <div class="orb-ring-3"></div>
      <div class="orb-ring-2"></div>
      <div class="orb-ring-1"></div>
      <img src="${LOGO_URL}" alt="Xending Orb" />
    </div>

    <!-- Service nodes -->

    <!-- FX Competitivo (top center) -->
    <div class="service-node node-fx">
      <div class="service-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.4 2.6"/>
          <polyline points="21 3 21 9 15 9"/>
          <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.4-2.6"/>
          <polyline points="3 21 3 15 9 15"/>
        </svg>
      </div>
      <div class="service-text">
        <h3><span class="kw">FX</span> Competitivo</h3>
        <p class="subtitle">+130 divisas</p>
        <p class="body">Ejecución inmediata, <span class="hl-tq">sin spreads ocultos</span> y transparencia total.</p>
      </div>
    </div>

    <!-- Pagos Internacionales (mid-left) -->
    <div class="service-node node-pagos">
      <div class="service-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      </div>
      <div class="service-text">
        <h3><span class="kw">Pagos</span> Internacionales</h3>
        <p class="subtitle">En el mismo día</p>
        <p class="body">Centraliza dispersiones masivas y programa operaciones futuras desde una <span class="hl-tq">sola plataforma global</span>.</p>
      </div>
    </div>

    <!-- Coberturas Cambiarias (mid-right) -->
    <div class="service-node node-coberturas align-right">
      <div class="service-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <rect x="9" y="10" width="6" height="6" rx="1"/>
          <path d="M11 10V8a1 1 0 0 1 2 0v2"/>
        </svg>
      </div>
      <div class="service-text">
        <h3><span class="kw">Coberturas</span> Cambiarias</h3>
        <p class="subtitle">Protección para tus márgenes</p>
        <p class="body"><span class="hl-cr">Forwards</span> y estrategias FX diseñadas para reducir la exposición al riesgo cambiario.</p>
      </div>
    </div>

    <!-- Cuenta Multidivisa (bottom-left) -->
    <div class="service-node node-multidivisa">
      <div class="service-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v12M8 10h6a2 2 0 0 1 0 4H8h6a2 2 0 0 1 0 4H8"/>
        </svg>
      </div>
      <div class="service-text">
        <h3><span class="kw">Cuenta</span> Multidivisa</h3>
        <div class="body">
          <ul>
            <li><span class="hl-tq">Gratuita</span></li>
            <li>Apertura desde <span class="hl-cr">48 horas</span></li>
            <li>Más de <span class="hl-cr">30 divisas</span> en una sola cuenta</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Financiamiento (bottom-right) -->
    <div class="service-node node-financiamiento align-right">
      <div class="service-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 17 9 11 13 15 21 7"/>
          <polyline points="15 7 21 7 21 13"/>
          <line x1="3" y1="21" x2="21" y2="21"/>
        </svg>
      </div>
      <div class="service-text">
        <h3><span class="kw">Financia</span>miento</h3>
        <p class="subtitle">Capital de trabajo flexible</p>
        <p class="body"><span class="hl-tq">Liquidez</span> y soluciones de crecimiento diseñadas a la medida de tu empresa.</p>
      </div>
    </div>

    <!-- Bottom feature bar -->
    <div class="feature-bar">
      <div class="feature-item">
        <div class="feature-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <polyline points="9 12 11 14 15 10"/>
          </svg>
        </div>
        <span class="feature-label">Seguridad<br/>de Nivel Global</span>
      </div>
      <div class="feature-item">
        <div class="feature-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="10" width="16" height="12" rx="2"/>
            <path d="M8 10V7a4 4 0 0 1 8 0v3"/>
          </svg>
        </div>
        <span class="feature-label">Cumplimiento<br/>Regulatorio</span>
      </div>
      <div class="feature-item">
        <div class="feature-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="5" cy="12" r="2"/>
            <circle cx="19" cy="5" r="2"/>
            <circle cx="19" cy="19" r="2"/>
            <line x1="7" y1="12" x2="17" y2="5"/>
            <line x1="7" y1="12" x2="17" y2="19"/>
          </svg>
        </div>
        <span class="feature-label">Tecnología<br/>de Clase Mundial</span>
      </div>
      <div class="feature-item">
        <div class="feature-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="14" width="4" height="7" rx="1"/>
            <rect x="10" y="9"  width="4" height="12" rx="1"/>
            <rect x="17" y="4"  width="4" height="17" rx="1"/>
          </svg>
        </div>
        <span class="feature-label">Visibilidad<br/>en Tiempo Real</span>
      </div>
    </div>
  </div>
</body>
</html>`;

// ─── SLIDE 3 V1: Servicios — Grid Hero (2 destacados + 3 soporte) ──────────

export const slide03_services_v2: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${FONTS}');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #0A0E14; }

    .slide {
      width: 1920px;
      height: 1080px;
      position: relative;
      overflow: hidden;
      font-family: 'Poppins', sans-serif;
      background:
        radial-gradient(ellipse 1100px 900px at 50% 55%, rgba(46,212,199,0.15) 0%, rgba(46,212,199,0.03) 45%, transparent 72%),
        radial-gradient(ellipse 800px 600px at 50% 55%, rgba(255,122,74,0.07) 0%, transparent 60%),
        linear-gradient(135deg, #0A0E14 0%, #141C28 50%, #0A0E14 100%);
      transform-origin: top left;
    }

    /* Orb watermark — gigante al fondo, como sol corporativo */
    .orb-watermark {
      position: absolute;
      right: -300px;
      top: 50%;
      transform: translateY(-50%);
      width: 1400px;
      height: 1400px;
      pointer-events: none;
      z-index: 0;
    }

    .orb-watermark img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      opacity: 0.05;
      filter: drop-shadow(0 0 80px rgba(46,212,199,0.20));
    }

    .grain {
      position: absolute;
      inset: 0;
      opacity: 0.06;
      mix-blend-mode: overlay;
      pointer-events: none;
      background-image: ${GRAIN};
      z-index: 1;
    }

    /* Top brand row */
    .brand-row {
      position: absolute;
      top: 48px;
      left: 64px;
      display: flex;
      align-items: center;
      gap: 14px;
      z-index: 10;
    }

    .brand-row img { width: 42px; height: 42px; object-fit: contain; }

    .wordmark {
      font-weight: 700;
      font-size: 24px;
      color: #ffffff;
    }

    .slide-meta {
      position: absolute;
      top: 56px;
      right: 64px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: #2ED4C7;
      letter-spacing: 4px;
      text-transform: uppercase;
      z-index: 10;
    }

    /* Header block */
    .header-block {
      position: absolute;
      top: 130px;
      left: 64px;
      right: 64px;
      text-align: center;
      z-index: 5;
    }

    .eyebrow-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 500;
      color: #2ED4C7;
      letter-spacing: 6px;
      text-transform: uppercase;
      margin-bottom: 16px;
      display: inline-block;
    }

    h1 {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-size: 62px;
      line-height: 1.05;
      color: #ffffff;
      letter-spacing: -1px;
    }

    h1 .accent-coral {
      font-style: italic;
      background: linear-gradient(135deg, #FF7A4A, #FFa070);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    /* Service grid container */
    .services-container {
      position: absolute;
      top: 320px;
      left: 64px;
      right: 64px;
      bottom: 64px;
      z-index: 5;
      display: flex;
      flex-direction: column;
      gap: 36px;
    }

    /* Hero row — 2 servicios grandes */
    .hero-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      flex: 1.2;
    }

    /* Support row — 3 servicios medianos */
    .support-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 24px;
      flex: 1;
    }

    /* Service card (base) */
    .service-card {
      position: relative;
      background:
        linear-gradient(135deg, rgba(46,212,199,0.06) 0%, rgba(46,212,199,0.02) 100%);
      border: 1px solid rgba(46,212,199,0.25);
      border-radius: 24px;
      padding: 36px 40px;
      display: flex;
      flex-direction: column;
      gap: 18px;
      backdrop-filter: blur(6px);
      transition: all 0.3s ease;
      overflow: hidden;
    }

    /* Glow accent behind card */
    .service-card::before {
      content: '';
      position: absolute;
      top: -40%;
      right: -20%;
      width: 60%;
      height: 80%;
      background: radial-gradient(ellipse, rgba(46,212,199,0.15) 0%, transparent 60%);
      pointer-events: none;
      filter: blur(40px);
    }

    .service-card.is-hero {
      border: 1.5px solid rgba(46,212,199,0.40);
      background:
        linear-gradient(135deg, rgba(46,212,199,0.10) 0%, rgba(255,122,74,0.04) 100%);
      box-shadow:
        0 12px 40px rgba(46,212,199,0.15),
        inset 0 1px 0 rgba(255,255,255,0.06);
    }

    .service-card.is-hero::before {
      background: radial-gradient(ellipse, rgba(46,212,199,0.22) 0%, rgba(255,122,74,0.06) 50%, transparent 80%);
    }

    /* Card header */
    .card-header {
      display: flex;
      align-items: center;
      gap: 20px;
      position: relative;
      z-index: 2;
    }

    .service-icon {
      flex-shrink: 0;
      width: 72px;
      height: 72px;
      border-radius: 16px;
      background: linear-gradient(135deg, rgba(46,212,199,0.22) 0%, rgba(46,212,199,0.06) 100%);
      border: 1.5px solid rgba(46,212,199,0.50);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #2ED4C7;
      box-shadow:
        inset 0 0 20px rgba(46,212,199,0.12),
        0 0 30px rgba(46,212,199,0.15);
    }

    .service-icon svg { width: 36px; height: 36px; }

    .is-hero .service-icon {
      width: 88px;
      height: 88px;
      border-radius: 20px;
      background: linear-gradient(135deg, rgba(46,212,199,0.30) 0%, rgba(255,122,74,0.08) 100%);
      border-color: rgba(46,212,199,0.60);
    }

    .is-hero .service-icon svg { width: 42px; height: 42px; }

    h3 {
      font-family: 'Poppins', sans-serif;
      font-weight: 700;
      font-size: 24px;
      letter-spacing: 1px;
      line-height: 1.1;
      color: #ffffff;
    }

    h3 .kw {
      color: #FF7A4A;
    }

    .is-hero h3 {
      font-size: 32px;
      letter-spacing: 0.5px;
    }

    .subtitle {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
      font-size: 15px;
      color: #2ED4C7;
      letter-spacing: 3px;
      text-transform: uppercase;
      text-shadow: 0 0 15px rgba(46,212,199,0.25);
      margin-top: 4px;
    }

    .is-hero .subtitle {
      font-size: 17px;
    }

    .body {
      font-family: 'Poppins', sans-serif;
      font-weight: 400;
      font-size: 17px;
      color: rgba(255,255,255,0.78);
      line-height: 1.55;
      position: relative;
      z-index: 2;
    }

    .is-hero .body {
      font-size: 19px;
    }

    .body .hl-tq { color: #2ED4C7; font-weight: 500; }
    .body .hl-cr { color: #FF7A4A; font-weight: 600; }

    /* Support card tweaks */
    .support-row .service-card {
      padding: 28px 32px;
      gap: 14px;
    }

    .support-row h3 {
      font-size: 20px;
    }

    .support-row .body {
      font-size: 15px;
    }

    .support-row .subtitle {
      font-family: 'Poppins', sans-serif;
      font-weight: 500;
      font-size: 14px;
      color: #2ED4C7;
      letter-spacing: 0.5px;
      text-transform: none;
      text-shadow: 0 0 12px rgba(46,212,199,0.20);
      margin-top: -4px;
      margin-bottom: 2px;
    }

    .support-row .service-icon {
      width: 60px;
      height: 60px;
      border-radius: 14px;
    }

    .support-row .service-icon svg {
      width: 30px;
      height: 30px;
    }

    /* Disclaimer (small print) */
    .disclaimer {
      font-family: 'Poppins', sans-serif;
      font-weight: 400;
      font-size: 11px;
      color: rgba(255,255,255,0.40);
      font-style: italic;
      margin-top: 4px;
      position: relative;
      z-index: 2;
    }

    /* Big number in hero card */
    .hero-metric {
      position: absolute;
      bottom: 28px;
      right: 36px;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      font-size: 72px;
      line-height: 1;
      color: rgba(46,212,199,0.12);
      letter-spacing: -2px;
      z-index: 1;
    }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        slide.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', resize);
      resize(); setTimeout(resize, 50); setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#0A0E14;width:100%;height:100vh;">
  <div class="slide">
    <!-- Orb watermark al fondo -->
    <div class="orb-watermark">
      <img src="${LOGO_URL}" alt="" />
    </div>
    <div class="grain"></div>

    <!-- Brand lockup -->
    <div class="brand-row logo-row">
      <img src="${LOGO_URL}" alt="Xending" />
      <span class="wordmark">xending</span>
    </div>

    <span class="slide-meta">03 · Ecosistema</span>

    <!-- Header title -->
    <div class="header-block">
      <span class="eyebrow-tag">Nuestro Ecosistema</span>
      <h1>Tu operación financiera <span class="accent-coral">internacional</span><br/>en una sola plataforma</h1>
    </div>

    <!-- Services container -->
    <div class="services-container">

      <!-- HERO ROW: 2 servicios grandes -->
      <div class="hero-row">

        <!-- Hero 1: FX para Tesorería -->
        <div class="service-card is-hero">
          <div class="card-header">
            <div class="service-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.4 2.6"/>
                <polyline points="21 3 21 9 15 9"/>
                <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.4-2.6"/>
                <polyline points="3 21 3 15 9 15"/>
              </svg>
            </div>
            <div>
              <h3><span class="kw">FX</span> para Tesorería</h3>
              <div class="subtitle">+130 divisas disponibles</div>
            </div>
          </div>
          <p class="body">
            <span class="hl-tq">Cotiza, ejecuta y controla</span> tus operaciones cambiarias con visibilidad y soporte experto.
          </p>
          <div class="hero-metric">130+</div>
        </div>

        <!-- Hero 2: Pagos Internacionales -->
        <div class="service-card is-hero">
          <div class="card-header">
            <div class="service-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </div>
            <div>
              <h3><span class="kw">Pagos</span> Internacionales</h3>
              <div class="subtitle">Rápidos, trazables y programables</div>
            </div>
          </div>
          <p class="body">
            Envía pagos a <span class="hl-tq">proveedores, filiales y socios comerciales</span> con control operativo desde una sola plataforma.
          </p>
          <div class="hero-metric">1d</div>
        </div>
      </div>

      <!-- SUPPORT ROW: 3 servicios medianos -->
      <div class="support-row">

        <!-- Support 1: Coberturas -->
        <div class="service-card">
          <div class="card-header">
            <div class="service-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <rect x="9" y="10" width="6" height="6" rx="1"/>
                <path d="M11 10V8a1 1 0 0 1 2 0v2"/>
              </svg>
            </div>
            <h3><span class="kw">Coberturas</span> Cambiarias</h3>
          </div>
          <div class="subtitle">Protege margen y presupuesto</div>
          <p class="body">
            <span class="hl-cr">Forwards</span> y estrategias FX para reducir volatilidad, fijar costos futuros y planear con mayor certidumbre.
          </p>
        </div>

        <!-- Support 2: Multidivisa -->
        <div class="service-card">
          <div class="card-header">
            <div class="service-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v12M8 10h6a2 2 0 0 1 0 4H8h6a2 2 0 0 1 0 4H8"/>
              </svg>
            </div>
            <h3><span class="kw">Cuenta</span> Multidivisa</h3>
          </div>
          <div class="subtitle">Una cuenta para operar globalmente</div>
          <p class="body">
            Administra saldos en <span class="hl-tq">USD y +30 divisas</span>, reduce cuentas bancarias y centraliza tu operación internacional. <span class="hl-cr">Sin costos de apertura</span>.
          </p>
        </div>

        <!-- Support 3: Financiamiento -->
        <div class="service-card">
          <div class="card-header">
            <div class="service-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 17 9 11 13 15 21 7"/>
                <polyline points="15 7 21 7 21 13"/>
                <line x1="3" y1="21" x2="21" y2="21"/>
              </svg>
            </div>
            <h3><span class="kw">Financia</span>miento</h3>
          </div>
          <div class="subtitle">Capital para comercio internacional</div>
          <p class="body">
            <span class="hl-tq">Liquidez</span> para pagar proveedores, anticipar inventario o financiar crecimiento operativo.
          </p>
          <p class="disclaimer">Sujeto a aprobación.</p>
        </div>

      </div>
    </div>
  </div>
</body>
</html>`;

// ─── SLIDE 4 V1: Diferenciadores — 4 features + KYC hero + pills strip ─────

export const slide04_differentiators_v1: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${FONTS}');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #0A0E14; }

    .slide {
      width: 1920px;
      height: 1080px;
      position: relative;
      overflow: hidden;
      font-family: 'Poppins', sans-serif;
      background:
        radial-gradient(ellipse 1100px 900px at 50% 55%, rgba(46,212,199,0.15) 0%, rgba(46,212,199,0.03) 45%, transparent 72%),
        radial-gradient(ellipse 800px 600px at 50% 55%, rgba(255,122,74,0.07) 0%, transparent 60%),
        linear-gradient(135deg, #0A0E14 0%, #141C28 50%, #0A0E14 100%);
      transform-origin: top left;
    }

    /* Orb watermark — igual que slide 3 */
    .orb-watermark {
      position: absolute;
      right: -300px;
      top: 50%;
      transform: translateY(-50%);
      width: 1400px;
      height: 1400px;
      pointer-events: none;
      z-index: 0;
    }

    .orb-watermark img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      opacity: 0.05;
      filter: drop-shadow(0 0 80px rgba(46,212,199,0.20));
    }

    .grain {
      position: absolute;
      inset: 0;
      opacity: 0.06;
      mix-blend-mode: overlay;
      pointer-events: none;
      background-image: ${GRAIN};
      z-index: 1;
    }

    /* Top brand row */
    .brand-row {
      position: absolute;
      top: 48px;
      left: 64px;
      display: flex;
      align-items: center;
      gap: 14px;
      z-index: 10;
    }

    .brand-row img { width: 42px; height: 42px; object-fit: contain; }

    .wordmark {
      font-weight: 700;
      font-size: 24px;
      color: #ffffff;
    }

    .slide-meta {
      position: absolute;
      top: 56px;
      right: 64px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: #2ED4C7;
      letter-spacing: 4px;
      text-transform: uppercase;
      z-index: 10;
    }

    /* Header block */
    .header-block {
      position: absolute;
      top: 130px;
      left: 64px;
      right: 64px;
      text-align: center;
      z-index: 5;
    }

    .eyebrow-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 500;
      color: #2ED4C7;
      letter-spacing: 6px;
      text-transform: uppercase;
      margin-bottom: 16px;
      display: inline-block;
    }

    h1 {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-size: 58px;
      line-height: 1.05;
      color: #ffffff;
      letter-spacing: -1px;
    }

    h1 .accent-coral {
      font-style: italic;
      background: linear-gradient(135deg, #FF7A4A, #FFa070);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .header-subtitle {
      font-family: 'Poppins', sans-serif;
      font-weight: 400;
      font-size: 20px;
      color: rgba(255,255,255,0.65);
      line-height: 1.5;
      max-width: 1060px;
      margin: 20px auto 0 auto;
    }

    /* Features container */
    .features-container {
      position: absolute;
      top: 440px;
      left: 64px;
      right: 64px;
      bottom: 240px;
      z-index: 5;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1.15fr;
      gap: 24px;
    }

    /* Inline pill inside card (e.g. "Rápido, seguro y trazable") */
    .card-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      align-self: flex-start;
      background: rgba(46,212,199,0.12);
      border: 1px solid rgba(46,212,199,0.35);
      color: #2ED4C7;
      font-family: 'Poppins', sans-serif;
      font-weight: 500;
      font-size: 13px;
      padding: 7px 14px;
      border-radius: 999px;
      margin-top: auto;
    }

    .card-pill svg {
      width: 14px;
      height: 14px;
    }

    /* Slide-level footnote (nota legal del asterisco) */
    .slide-footnote {
      position: absolute;
      left: 64px;
      right: 64px;
      bottom: 200px;
      text-align: center;
      z-index: 5;
      font-family: 'Poppins', sans-serif;
      font-weight: 400;
      font-size: 12px;
      font-style: italic;
      color: rgba(255,255,255,0.40);
      letter-spacing: 0.2px;
    }

    /* Feature card base */
    .feature-card {
      position: relative;
      background:
        linear-gradient(135deg, rgba(46,212,199,0.06) 0%, rgba(46,212,199,0.02) 100%);
      border: 1px solid rgba(46,212,199,0.25);
      border-radius: 24px;
      padding: 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      backdrop-filter: blur(6px);
      overflow: hidden;
    }

    .feature-card::before {
      content: '';
      position: absolute;
      top: -40%;
      right: -20%;
      width: 60%;
      height: 80%;
      background: radial-gradient(ellipse, rgba(46,212,199,0.15) 0%, transparent 60%);
      pointer-events: none;
      filter: blur(40px);
    }

    /* Hero card (KYC) — coral theme */
    .feature-card.is-hero {
      border: 1.5px solid rgba(255,122,74,0.50);
      background:
        linear-gradient(135deg, rgba(255,122,74,0.10) 0%, rgba(46,212,199,0.04) 100%);
      box-shadow:
        0 12px 40px rgba(255,122,74,0.15),
        inset 0 1px 0 rgba(255,255,255,0.06);
    }

    .feature-card.is-hero::before {
      background: radial-gradient(ellipse, rgba(255,122,74,0.22) 0%, rgba(46,212,199,0.06) 50%, transparent 80%);
    }

    /* Icon */
    .feature-icon {
      width: 60px;
      height: 60px;
      border-radius: 14px;
      background: linear-gradient(135deg, rgba(46,212,199,0.22) 0%, rgba(46,212,199,0.06) 100%);
      border: 1.5px solid rgba(46,212,199,0.50);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #2ED4C7;
      box-shadow:
        inset 0 0 20px rgba(46,212,199,0.12),
        0 0 30px rgba(46,212,199,0.15);
    }

    .feature-icon svg { width: 30px; height: 30px; }

    .is-hero .feature-icon {
      background: linear-gradient(135deg, rgba(255,122,74,0.25) 0%, rgba(255,122,74,0.06) 100%);
      border-color: rgba(255,122,74,0.55);
      color: #FF7A4A;
      box-shadow:
        inset 0 0 20px rgba(255,122,74,0.12),
        0 0 30px rgba(255,122,74,0.15);
    }

    .feature-card h3 {
      font-family: 'Poppins', sans-serif;
      font-weight: 700;
      font-size: 22px;
      line-height: 1.15;
      color: #ffffff;
    }

    .feature-card h3 .kw {
      color: #2ED4C7;
    }

    .is-hero h3 .kw {
      color: #FF7A4A;
    }

    .feature-card .lead {
      font-family: 'Poppins', sans-serif;
      font-weight: 500;
      font-size: 15px;
      color: rgba(255,255,255,0.88);
      line-height: 1.4;
    }

    .feature-card .body {
      font-family: 'Poppins', sans-serif;
      font-weight: 400;
      font-size: 14px;
      color: rgba(255,255,255,0.65);
      line-height: 1.55;
    }

    .feature-card .body .hl {
      color: #2ED4C7;
      font-weight: 500;
    }

    .is-hero .body .hl {
      color: #FF7A4A;
      font-weight: 500;
    }

    /* Hero bullet list */
    .hero-bullets {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 4px;
    }

    .hero-bullet {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-family: 'Poppins', sans-serif;
      font-weight: 400;
      font-size: 13px;
      color: rgba(255,255,255,0.75);
      line-height: 1.45;
    }

    .hero-bullet svg {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      color: #FF7A4A;
      margin-top: 1px;
    }

    /* Pills strip */
    .pills-strip {
      position: absolute;
      bottom: 64px;
      left: 64px;
      right: 64px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
      z-index: 5;
    }

    .pill {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 20px 22px;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .pill-icon {
      flex-shrink: 0;
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: rgba(46,212,199,0.10);
      border: 1px solid rgba(46,212,199,0.30);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #2ED4C7;
    }

    .pill-icon svg { width: 22px; height: 22px; }

    .pill-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .pill-title {
      font-family: 'Poppins', sans-serif;
      font-weight: 700;
      font-size: 15px;
      color: #ffffff;
      line-height: 1.2;
    }

    .pill-desc {
      font-family: 'Poppins', sans-serif;
      font-weight: 400;
      font-size: 12px;
      color: rgba(255,255,255,0.55);
      line-height: 1.35;
    }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        slide.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', resize);
      resize(); setTimeout(resize, 50); setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#0A0E14;width:100%;height:100vh;">
  <div class="slide">
    <!-- Orb watermark -->
    <div class="orb-watermark">
      <img src="${LOGO_URL}" alt="" />
    </div>
    <div class="grain"></div>

    <!-- Brand lockup -->
    <div class="brand-row">
      <img src="${LOGO_URL}" alt="Xending" />
      <span class="wordmark">xending</span>
    </div>

    <span class="slide-meta">04 · Diferenciadores</span>

    <!-- Header -->
    <div class="header-block">
      <span class="eyebrow-tag">Por qué Xending</span>
      <h1>Tu mejor opción para <span class="accent-coral">operar globalmente</span></h1>
      <p class="header-subtitle">
        Centraliza tus pagos, divisas y onboarding empresarial en una plataforma diseñada para empresas que operan globalmente con velocidad, cumplimiento y atención experta.
      </p>
    </div>

    <!-- 4 feature cards -->
    <div class="features-container">

      <!-- Card 1: Velocidad operativa -->
      <div class="feature-card">
        <div class="feature-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10"/>
            <polyline points="12 6 12 12 16 14"/>
            <path d="M22 2L12 12"/>
          </svg>
        </div>
        <h3><span class="kw">Velocidad</span> operativa</h3>
        <p class="lead">Sin fricciones, rápido y sencillo.</p>
        <p class="body">
          Procesos digitales para <span class="hl">cotizar, validar y ejecutar</span> operaciones con mayor agilidad.
        </p>
      </div>

      <!-- Card 2: Pagos a China -->
      <div class="feature-card">
        <div class="feature-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"/>
            <polyline points="12 7 12 12 15 14"/>
            <circle cx="18" cy="7" r="3" fill="currentColor" stroke="none" opacity="0.3"/>
            <path d="M18 7l-1.5 1.5"/>
          </svg>
        </div>
        <h3><span class="kw">Pagos a China</span><br/>el mismo día<span style="font-size:0.6em;color:#FF7A4A;vertical-align:super;margin-left:2px;">*</span></h3>
        <p class="lead">Conexión directa para pagos internacionales.</p>
        <p class="body">
          Pagos a proveedores con <span class="hl">seguimiento operativo</span>, soporte especializado y mayor visibilidad en cada transferencia.
        </p>
        <span class="card-pill">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Rápido, seguro y trazable
        </span>
      </div>

      <!-- Card 3: Atención Personalizada -->
      <div class="feature-card">
        <div class="feature-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
            <polyline points="17 3 18.5 4.5 21 2" opacity="0.8"/>
          </svg>
        </div>
        <h3><span class="kw">Atención</span><br/>personalizada</h3>
        <p class="lead">Expertos que entienden tu negocio.</p>
        <p class="body">
          Un equipo especializado que acompaña a tu empresa en <span class="hl">pagos, divisas y decisiones financieras internacionales</span>.
        </p>
      </div>

      <!-- Card 4: Onboarding empresarial con IA — HERO coral -->
      <div class="feature-card is-hero">
        <div class="feature-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <polyline points="9 12 11 14 15 10"/>
          </svg>
        </div>
        <h3><span class="kw">Onboarding</span> empresarial con IA</h3>
        <p class="body">
          Alta digital, validación documental y cumplimiento operativo para empezar a operar con <span class="hl">mayor rapidez</span>. Cumpliendo con las regulaciones de FinCEN, OFAC y organismos internacionales.
        </p>
        <div class="hero-bullets">
          <div class="hero-bullet">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>
            <span>Validación digital de empresa y representantes.</span>
          </div>
          <div class="hero-bullet">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>
            <span>Procesos seguros, auditables y alineados a estándares globales.</span>
          </div>
          <div class="hero-bullet">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>
            <span>Monitoreo preventivo de riesgos operativos.</span>
          </div>
          <div class="hero-bullet">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>
            <span>Menos fricción, más velocidad de activación.</span>
          </div>
        </div>
      </div>

    </div>

    <!-- Bottom pills strip -->
    <div class="pills-strip">

      <div class="pill">
        <div class="pill-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <rect x="9" y="10" width="6" height="6" rx="1"/>
            <path d="M11 10V8a1 1 0 0 1 2 0v2"/>
          </svg>
        </div>
        <div class="pill-text">
          <div class="pill-title">Seguridad institucional</div>
          <div class="pill-desc">Protección avanzada para tus operaciones y datos.</div>
        </div>
      </div>

      <div class="pill">
        <div class="pill-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 17 9 11 13 15 21 7"/>
            <polyline points="15 7 21 7 21 13"/>
            <line x1="3" y1="21" x2="21" y2="21"/>
          </svg>
        </div>
        <div class="pill-text">
          <div class="pill-title">Eficiencia operativa</div>
          <div class="pill-desc">Menos procesos manuales, más tiempo para crecer.</div>
        </div>
      </div>

      <div class="pill">
        <div class="pill-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
        </div>
        <div class="pill-text">
          <div class="pill-title">Tecnología global</div>
          <div class="pill-desc">Infraestructura robusta, escalable y segura.</div>
        </div>
      </div>

      <div class="pill">
        <div class="pill-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="9 12 11 14 15 10"/>
          </svg>
        </div>
        <div class="pill-text">
          <div class="pill-title">Cumplimiento inteligente</div>
          <div class="pill-desc">Procesos claros, auditables y sin complicaciones.</div>
        </div>
      </div>

    </div>

    <!-- Nota legal del asterisco -->
    <p class="slide-footnote">
      *Sujeto a horario, divisa, banco destino y validación operativa.
    </p>
  </div>
</body>
</html>`;

// ─── SLIDE 5 V1: Coberturas Cambiarias — Forward + Opciones + Beneficios ────

export const slide05_hedging_v1: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${FONTS}');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #0A0E14; }

    .slide {
      width: 1920px;
      height: 1080px;
      position: relative;
      overflow: hidden;
      font-family: 'Poppins', sans-serif;
      background:
        radial-gradient(ellipse 1100px 900px at 50% 55%, rgba(46,212,199,0.15) 0%, rgba(46,212,199,0.03) 45%, transparent 72%),
        radial-gradient(ellipse 800px 600px at 50% 55%, rgba(255,122,74,0.07) 0%, transparent 60%),
        linear-gradient(135deg, #0A0E14 0%, #141C28 50%, #0A0E14 100%);
      transform-origin: top left;
    }

    /* Orb watermark */
    .orb-watermark {
      position: absolute;
      right: -300px;
      top: 50%;
      transform: translateY(-50%);
      width: 1400px;
      height: 1400px;
      pointer-events: none;
      z-index: 0;
    }

    .orb-watermark img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      opacity: 0.05;
      filter: drop-shadow(0 0 80px rgba(46,212,199,0.20));
    }

    .grain {
      position: absolute;
      inset: 0;
      opacity: 0.06;
      mix-blend-mode: overlay;
      pointer-events: none;
      background-image: ${GRAIN};
      z-index: 1;
    }

    /* Brand row */
    .brand-row {
      position: absolute;
      top: 48px;
      left: 64px;
      display: flex;
      align-items: center;
      gap: 14px;
      z-index: 10;
    }

    .brand-row img { width: 42px; height: 42px; object-fit: contain; }

    .wordmark {
      font-weight: 700;
      font-size: 24px;
      color: #ffffff;
    }

    .slide-meta {
      position: absolute;
      top: 56px;
      right: 64px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: #2ED4C7;
      letter-spacing: 4px;
      text-transform: uppercase;
      z-index: 10;
    }

    /* Header zone: 2 columns */
    .header-zone {
      position: absolute;
      top: 120px;
      left: 64px;
      right: 64px;
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      gap: 56px;
      z-index: 5;
    }

    .header-left {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .eyebrow-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 500;
      color: #2ED4C7;
      letter-spacing: 6px;
      text-transform: uppercase;
    }

    h1 {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-size: 68px;
      line-height: 1.0;
      color: #ffffff;
      letter-spacing: -1px;
    }

    h1 .accent-coral {
      font-style: italic;
      background: linear-gradient(135deg, #FF7A4A, #FFa070);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .header-subtitle {
      font-family: 'Poppins', sans-serif;
      font-weight: 400;
      font-size: 19px;
      color: rgba(255,255,255,0.65);
      line-height: 1.5;
      max-width: 620px;
    }

    /* "Ideal para empresas que:" — right column */
    .ideal-panel {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .ideal-panel-title {
      font-family: 'Poppins', sans-serif;
      font-weight: 600;
      font-size: 14px;
      color: #2ED4C7;
      letter-spacing: 3px;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .ideal-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .ideal-item {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(46,212,199,0.18);
      border-radius: 14px;
      padding: 14px 16px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .ideal-icon {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: rgba(46,212,199,0.12);
      border: 1px solid rgba(46,212,199,0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #2ED4C7;
    }

    .ideal-icon svg { width: 18px; height: 18px; }

    .ideal-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .ideal-title {
      font-family: 'Poppins', sans-serif;
      font-weight: 600;
      font-size: 14px;
      color: #ffffff;
      line-height: 1.25;
    }

    .ideal-desc {
      font-family: 'Poppins', sans-serif;
      font-weight: 400;
      font-size: 12px;
      color: rgba(255,255,255,0.55);
      line-height: 1.35;
    }

    /* Strategy cards zone */
    .strategies-zone {
      position: absolute;
      top: 440px;
      left: 64px;
      right: 64px;
      height: 320px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 28px;
      z-index: 5;
    }

    .strategy-card {
      position: relative;
      border-radius: 24px;
      padding: 32px 36px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      backdrop-filter: blur(6px);
      overflow: hidden;
    }

    .strategy-card.is-tq {
      background: linear-gradient(135deg, rgba(46,212,199,0.10) 0%, rgba(46,212,199,0.03) 100%);
      border: 1.5px solid rgba(46,212,199,0.45);
      box-shadow: 0 12px 40px rgba(46,212,199,0.12), inset 0 1px 0 rgba(255,255,255,0.06);
    }

    .strategy-card.is-cr {
      background: linear-gradient(135deg, rgba(255,122,74,0.10) 0%, rgba(255,122,74,0.03) 100%);
      border: 1.5px solid rgba(255,122,74,0.50);
      box-shadow: 0 12px 40px rgba(255,122,74,0.15), inset 0 1px 0 rgba(255,255,255,0.06);
    }

    .strategy-card::before {
      content: '';
      position: absolute;
      top: -40%;
      right: -20%;
      width: 60%;
      height: 80%;
      pointer-events: none;
      filter: blur(40px);
    }

    .strategy-card.is-tq::before {
      background: radial-gradient(ellipse, rgba(46,212,199,0.22) 0%, transparent 60%);
    }

    .strategy-card.is-cr::before {
      background: radial-gradient(ellipse, rgba(255,122,74,0.22) 0%, transparent 60%);
    }

    .strategy-header {
      display: flex;
      align-items: center;
      gap: 18px;
      position: relative;
      z-index: 2;
    }

    .strategy-icon {
      flex-shrink: 0;
      width: 64px;
      height: 64px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .is-tq .strategy-icon {
      background: linear-gradient(135deg, rgba(46,212,199,0.25) 0%, rgba(46,212,199,0.06) 100%);
      border: 1.5px solid rgba(46,212,199,0.55);
      color: #2ED4C7;
      box-shadow: inset 0 0 20px rgba(46,212,199,0.14), 0 0 30px rgba(46,212,199,0.18);
    }

    .is-cr .strategy-icon {
      background: linear-gradient(135deg, rgba(255,122,74,0.25) 0%, rgba(255,122,74,0.06) 100%);
      border: 1.5px solid rgba(255,122,74,0.55);
      color: #FF7A4A;
      box-shadow: inset 0 0 20px rgba(255,122,74,0.14), 0 0 30px rgba(255,122,74,0.18);
    }

    .strategy-icon svg { width: 32px; height: 32px; }

    .strategy-title-block h3 {
      font-family: 'Poppins', sans-serif;
      font-weight: 800;
      font-size: 28px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #ffffff;
      line-height: 1.1;
    }

    .strategy-tagline {
      font-family: 'Poppins', sans-serif;
      font-weight: 500;
      font-size: 15px;
      margin-top: 4px;
      line-height: 1.3;
    }

    .is-tq .strategy-tagline { color: #2ED4C7; }
    .is-cr .strategy-tagline { color: #FF7A4A; }

    .strategy-body {
      font-family: 'Poppins', sans-serif;
      font-weight: 400;
      font-size: 15px;
      color: rgba(255,255,255,0.70);
      line-height: 1.5;
      position: relative;
      z-index: 2;
    }

    .strategy-list-label {
      font-family: 'Poppins', sans-serif;
      font-weight: 600;
      font-size: 11px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: rgba(255,255,255,0.50);
      margin-top: 4px;
      position: relative;
      z-index: 2;
    }

    .strategy-list {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 18px;
      position: relative;
      z-index: 2;
    }

    .strategy-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: 'Poppins', sans-serif;
      font-weight: 500;
      font-size: 13px;
      color: rgba(255,255,255,0.85);
      line-height: 1.35;
    }

    .is-tq .strategy-item::before {
      content: '›';
      color: #2ED4C7;
      font-weight: 700;
      font-size: 16px;
      line-height: 1;
    }

    .is-cr .strategy-item::before {
      content: '›';
      color: #FF7A4A;
      font-weight: 700;
      font-size: 16px;
      line-height: 1;
    }

    /* Benefits strip */
    .benefits-strip {
      position: absolute;
      top: 790px;
      left: 64px;
      right: 64px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
      z-index: 5;
    }

    .benefit {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 18px 20px;
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .benefit-icon {
      flex-shrink: 0;
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: rgba(46,212,199,0.10);
      border: 1px solid rgba(46,212,199,0.30);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #2ED4C7;
    }

    .benefit-icon svg { width: 20px; height: 20px; }

    .benefit-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .benefit-title {
      font-family: 'Poppins', sans-serif;
      font-weight: 700;
      font-size: 14px;
      color: #ffffff;
      line-height: 1.2;
    }

    .benefit-desc {
      font-family: 'Poppins', sans-serif;
      font-weight: 400;
      font-size: 12px;
      color: rgba(255,255,255,0.55);
      line-height: 1.35;
    }

    /* Closing band */
    .closing-band {
      position: absolute;
      bottom: 72px;
      left: 64px;
      right: 64px;
      background: linear-gradient(90deg, rgba(46,212,199,0.12) 0%, rgba(255,122,74,0.12) 100%);
      border: 1px solid rgba(255,255,255,0.10);
      border-radius: 20px;
      padding: 20px 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      z-index: 5;
      overflow: hidden;
    }

    .closing-band::before {
      content: '';
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse 400px 200px at 10% 50%, rgba(46,212,199,0.18) 0%, transparent 70%),
        radial-gradient(ellipse 400px 200px at 90% 50%, rgba(255,122,74,0.18) 0%, transparent 70%);
      pointer-events: none;
    }

    .closing-text {
      font-family: 'Montserrat', sans-serif;
      font-weight: 500;
      font-size: 26px;
      color: #ffffff;
      letter-spacing: -0.3px;
      line-height: 1.1;
      text-align: center;
      position: relative;
      z-index: 2;
    }

    .closing-text .dot-tq { color: #2ED4C7; font-weight: 600; font-style: italic; }
    .closing-text .dot-cr { color: #FF7A4A; font-weight: 600; font-style: italic; }

    /* Footnote */
    .slide-footnote {
      position: absolute;
      bottom: 32px;
      left: 64px;
      right: 64px;
      text-align: center;
      font-family: 'Poppins', sans-serif;
      font-weight: 400;
      font-size: 11px;
      font-style: italic;
      color: rgba(255,255,255,0.38);
      letter-spacing: 0.2px;
      z-index: 5;
    }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        slide.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', resize);
      resize(); setTimeout(resize, 50); setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#0A0E14;width:100%;height:100vh;">
  <div class="slide">
    <!-- Orb watermark -->
    <div class="orb-watermark">
      <img src="${LOGO_URL}" alt="" />
    </div>
    <div class="grain"></div>

    <!-- Brand lockup -->
    <div class="brand-row">
      <img src="${LOGO_URL}" alt="Xending" />
      <span class="wordmark">xending</span>
    </div>

    <span class="slide-meta">05 · Coberturas</span>

    <!-- Header zone: 2 columns -->
    <div class="header-zone">
      <div class="header-left">
        <span class="eyebrow-tag">Coberturas FX</span>
        <h1>Coberturas <span class="accent-coral">cambiarias</span></h1>
        <p class="header-subtitle">
          Asegura hoy el tipo de cambio que necesitas para proteger tus márgenes, presupuestos y pagos futuros.
        </p>
      </div>

      <div class="ideal-panel">
        <span class="ideal-panel-title">Ideal para empresas que:</span>
        <div class="ideal-grid">
          <div class="ideal-item">
            <div class="ideal-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="1" y="6" width="15" height="12" rx="2"/>
                <path d="M16 10h4l3 3v5h-7"/>
                <circle cx="6" cy="19" r="2"/>
                <circle cx="19" cy="19" r="2"/>
              </svg>
            </div>
            <div class="ideal-text">
              <span class="ideal-title">Importan o exportan</span>
              <span class="ideal-desc">Tienen pagos internacionales recurrentes.</span>
            </div>
          </div>

          <div class="ideal-item">
            <div class="ideal-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
              </svg>
            </div>
            <div class="ideal-text">
              <span class="ideal-title">Tienen pagos futuros</span>
              <span class="ideal-desc">Necesitan planear costos en moneda extranjera.</span>
            </div>
          </div>

          <div class="ideal-item">
            <div class="ideal-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="9" cy="21" r="1"/>
                <circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>
              </svg>
            </div>
            <div class="ideal-text">
              <span class="ideal-title">Compran insumos del exterior</span>
              <span class="ideal-desc">Buscan proteger márgenes ante movimientos del mercado.</span>
            </div>
          </div>

          <div class="ideal-item">
            <div class="ideal-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </div>
            <div class="ideal-text">
              <span class="ideal-title">Operan globalmente</span>
              <span class="ideal-desc">Requieren certidumbre cambiaria y visibilidad financiera.</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Strategy cards -->
    <div class="strategies-zone">

      <!-- FORWARD — turquesa -->
      <div class="strategy-card is-tq">
        <div class="strategy-header">
          <div class="strategy-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="4" y="10" width="16" height="10" rx="2"/>
              <path d="M8 10V6a4 4 0 0 1 8 0v4"/>
              <circle cx="12" cy="15" r="1.5" fill="currentColor"/>
            </svg>
          </div>
          <div class="strategy-title-block">
            <h3>Forward</h3>
            <div class="strategy-tagline">Asegura hoy tu tipo de cambio futuro</div>
          </div>
        </div>
        <p class="strategy-body">
          Protege tus pagos internacionales fijando un tipo de cambio para una fecha determinada.
        </p>
        <span class="strategy-list-label">Estrategias disponibles</span>
        <div class="strategy-list">
          <div class="strategy-item">Forward tradicional</div>
          <div class="strategy-item">Window Forward</div>
          <div class="strategy-item">Forward participativo</div>
          <div class="strategy-item">Collar</div>
          <div class="strategy-item">Forward Knock-In Americano</div>
          <div class="strategy-item">Bonus Forward</div>
          <div class="strategy-item">Estructuras IRS</div>
        </div>
      </div>

      <!-- OPCIONES — coral -->
      <div class="strategy-card is-cr">
        <div class="strategy-header">
          <div class="strategy-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/>
              <line x1="4" y1="12" x2="20" y2="12"/>
              <line x1="4" y1="18" x2="20" y2="18"/>
              <circle cx="9" cy="6" r="2" fill="currentColor"/>
              <circle cx="15" cy="12" r="2" fill="currentColor"/>
              <circle cx="7" cy="18" r="2" fill="currentColor"/>
            </svg>
          </div>
          <div class="strategy-title-block">
            <h3>Estrategias con Opciones</h3>
            <div class="strategy-tagline">Flexibilidad para distintos escenarios de mercado</div>
          </div>
        </div>
        <p class="strategy-body">
          Diseñamos estrategias para protegerte ante movimientos adversos sin perder flexibilidad operativa.
        </p>
        <span class="strategy-list-label">Estrategias disponibles</span>
        <div class="strategy-list">
          <div class="strategy-item">Call / Put Spread</div>
          <div class="strategy-item">Seagull</div>
          <div class="strategy-item">Seagull Knock-In Americano</div>
          <div class="strategy-item">Forward Knock-Out Americano</div>
          <div class="strategy-item">Forward Bonificado</div>
        </div>
      </div>

    </div>

    <!-- Benefits strip -->
    <div class="benefits-strip">

      <div class="benefit">
        <div class="benefit-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <div class="benefit-text">
          <div class="benefit-title">Protege tus márgenes</div>
          <div class="benefit-desc">Reduce el impacto de movimientos inesperados del mercado.</div>
        </div>
      </div>

      <div class="benefit">
        <div class="benefit-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 17 9 11 13 15 21 7"/>
            <polyline points="15 7 21 7 21 13"/>
            <line x1="3" y1="21" x2="21" y2="21"/>
          </svg>
        </div>
        <div class="benefit-text">
          <div class="benefit-title">Planea con confianza</div>
          <div class="benefit-desc">Conoce hoy el costo real de tus pagos internacionales futuros.</div>
        </div>
      </div>

      <div class="benefit">
        <div class="benefit-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 15 14"/>
          </svg>
        </div>
        <div class="benefit-text">
          <div class="benefit-title">Flexibilidad total</div>
          <div class="benefit-desc">Coberturas alineadas a tus flujos, fechas, monedas y objetivos.</div>
        </div>
      </div>

      <div class="benefit">
        <div class="benefit-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
            <polyline points="17 3 18.5 4.5 21 2"/>
          </svg>
        </div>
        <div class="benefit-text">
          <div class="benefit-title">Respaldo experto</div>
          <div class="benefit-desc">Te ayudamos a elegir la estrategia adecuada para tu operación.</div>
        </div>
      </div>

    </div>

    <!-- Closing band -->
    <div class="closing-band">
      <span class="closing-text">
        Menos incertidumbre. <span class="dot-tq">Más control.</span> <span class="dot-cr">Mejores decisiones.</span>
      </span>
    </div>

    <!-- Footnote -->
    <p class="slide-footnote">
      Las coberturas están sujetas a perfil del cliente, condiciones de mercado, documentación y aprobación operativa.
    </p>
  </div>
</body>
</html>`;

// ─── SLIDE 6 V1: Xending Capital — Tasa 0% + hero SVG + Lemad disclosure ───

export const slide06_capital_v1: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${FONTS}');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #0A0E14; }

    .slide {
      width: 1920px;
      height: 1080px;
      position: relative;
      overflow: hidden;
      font-family: 'Poppins', sans-serif;
      background:
        radial-gradient(ellipse 1100px 900px at 30% 50%, rgba(46,212,199,0.12) 0%, rgba(46,212,199,0.02) 45%, transparent 72%),
        radial-gradient(ellipse 900px 700px at 80% 60%, rgba(255,122,74,0.10) 0%, transparent 60%),
        linear-gradient(135deg, #0A0E14 0%, #141C28 50%, #0A0E14 100%);
      transform-origin: top left;
    }

    /* Orb watermark */
    .orb-watermark {
      position: absolute;
      right: -300px;
      top: 50%;
      transform: translateY(-50%);
      width: 1400px;
      height: 1400px;
      pointer-events: none;
      z-index: 0;
    }

    .orb-watermark img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      opacity: 0.04;
      filter: drop-shadow(0 0 80px rgba(46,212,199,0.20));
    }

    .grain {
      position: absolute;
      inset: 0;
      opacity: 0.06;
      mix-blend-mode: overlay;
      pointer-events: none;
      background-image: ${GRAIN};
      z-index: 1;
    }

    /* Brand row */
    .brand-row {
      position: absolute;
      top: 48px;
      left: 64px;
      display: flex;
      align-items: center;
      gap: 14px;
      z-index: 10;
    }

    .brand-row img { width: 42px; height: 42px; object-fit: contain; }

    .wordmark {
      font-weight: 700;
      font-size: 24px;
      color: #ffffff;
    }

    .slide-meta {
      position: absolute;
      top: 56px;
      right: 64px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: #FF7A4A;
      letter-spacing: 4px;
      text-transform: uppercase;
      z-index: 10;
    }

    /* Top zone: split 55/45 */
    .top-zone {
      position: absolute;
      top: 120px;
      left: 64px;
      right: 64px;
      height: 520px;
      display: grid;
      grid-template-columns: 1.15fr 1fr;
      gap: 60px;
      z-index: 5;
    }

    .top-left {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 22px;
    }

    .eyebrow-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 500;
      color: #FF7A4A;
      letter-spacing: 6px;
      text-transform: uppercase;
    }

    .product-title {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-size: 64px;
      line-height: 1.0;
      color: #ffffff;
      letter-spacing: -1px;
    }

    .product-title .capital {
      font-style: italic;
      background: linear-gradient(135deg, #FF7A4A, #FFa070);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    h1 {
      font-family: 'Montserrat', sans-serif;
      font-weight: 500;
      font-size: 44px;
      line-height: 1.15;
      color: rgba(255,255,255,0.92);
      letter-spacing: -0.5px;
    }

    h1 .accent-tq {
      font-style: italic;
      background: linear-gradient(135deg, #2ED4C7, #5EEADF);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .subheadline {
      font-family: 'Poppins', sans-serif;
      font-weight: 400;
      font-size: 19px;
      color: rgba(255,255,255,0.65);
      line-height: 1.55;
      max-width: 620px;
    }

    /* Hero visual (right) */
    .hero-visual {
      position: relative;
      width: 100%;
      height: 100%;
      background:
        radial-gradient(ellipse 400px 400px at 50% 50%, rgba(46,212,199,0.18) 0%, transparent 65%),
        linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%);
      border: 1px solid rgba(46,212,199,0.20);
      border-radius: 28px;
      overflow: hidden;
      box-shadow:
        0 24px 60px rgba(0,0,0,0.35),
        inset 0 1px 0 rgba(255,255,255,0.06);
    }

    .hero-visual::before {
      content: '';
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse 300px 200px at 20% 10%, rgba(46,212,199,0.22) 0%, transparent 60%),
        radial-gradient(ellipse 300px 200px at 85% 90%, rgba(255,122,74,0.20) 0%, transparent 60%);
      pointer-events: none;
    }

    /* Chart panel (glass inner) */
    .chart-panel {
      position: absolute;
      left: 40px;
      right: 40px;
      top: 40px;
      bottom: 120px;
      background: rgba(10,14,20,0.55);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 18px;
      padding: 20px 24px;
      backdrop-filter: blur(8px);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* Hero photo — user-uploaded image displayed on top of the mock chart.
       Edges fade into the container via mask-image so the turquoise/coral halo
       from .hero-visual can breathe around the photo, matching the editorial
       style of the deck. */
    .hero-photo {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 28px;
      z-index: 10;
      background: transparent;
      opacity: 0.92;
      /* Radial fade: fully opaque in the center, soft fade to edges */
      -webkit-mask-image: radial-gradient(ellipse 85% 90% at 50% 50%, #000 55%, rgba(0,0,0,0.85) 75%, rgba(0,0,0,0.25) 95%, transparent 100%);
              mask-image: radial-gradient(ellipse 85% 90% at 50% 50%, #000 55%, rgba(0,0,0,0.85) 75%, rgba(0,0,0,0.25) 95%, transparent 100%);
      transition: opacity 0.2s ease;
    }

    /* Empty state (transparent data URL): hide and let the mock show through */
    .hero-photo[src^="data:"] {
      opacity: 0;
      pointer-events: none;
      -webkit-mask-image: none;
              mask-image: none;
    }

    /* When a real photo is present:
       — hide the zero-rate badge (photo already communicates the message)
       — reinforce the inner halo of the container to frame the faded edges */
    .hero-visual:has(.hero-photo:not([src^="data:"])) .zero-rate {
      display: none;
    }

    .hero-visual:has(.hero-photo:not([src^="data:"])) {
      box-shadow:
        0 24px 60px rgba(0,0,0,0.35),
        inset 0 0 80px rgba(46,212,199,0.18),
        inset 0 0 40px rgba(255,122,74,0.10),
        inset 0 1px 0 rgba(255,255,255,0.06);
    }

    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .chart-title-block .chart-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: rgba(255,255,255,0.45);
      letter-spacing: 2px;
      text-transform: uppercase;
    }

    .chart-title-block .chart-pair {
      font-family: 'Poppins', sans-serif;
      font-weight: 700;
      font-size: 16px;
      color: #ffffff;
      margin-top: 2px;
    }

    .chart-price-block {
      text-align: right;
    }

    .chart-price-block .chart-price {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      font-size: 24px;
      color: #2ED4C7;
      line-height: 1;
    }

    .chart-price-block .chart-delta {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: #2ED4C7;
      margin-top: 4px;
    }

    .chart-svg-wrap {
      flex: 1;
      position: relative;
      width: 100%;
    }

    .chart-svg-wrap svg {
      width: 100%;
      height: 100%;
      display: block;
    }

    /* Currency icons floating */
    .currency-icon {
      position: absolute;
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: linear-gradient(135deg, rgba(46,212,199,0.18) 0%, rgba(46,212,199,0.04) 100%);
      border: 1.5px solid rgba(46,212,199,0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow:
        0 0 32px rgba(46,212,199,0.30),
        inset 0 0 20px rgba(46,212,199,0.10);
      z-index: 3;
    }

    .currency-icon span {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-size: 34px;
      color: #2ED4C7;
      line-height: 1;
    }

    .currency-icon.is-coral {
      background: linear-gradient(135deg, rgba(255,122,74,0.20) 0%, rgba(255,122,74,0.04) 100%);
      border-color: rgba(255,122,74,0.55);
      box-shadow:
        0 0 32px rgba(255,122,74,0.32),
        inset 0 0 20px rgba(255,122,74,0.12);
    }

    .currency-icon.is-coral span { color: #FF7A4A; }

    .cur-usd { top: 44px; right: -28px; }
    .cur-eur { bottom: 56px; right: 36px; transform: scale(0.85); }
    .cur-jpy { bottom: -24px; left: 70px; transform: scale(0.80); }

    /* Zero-rate badge */
    .zero-rate {
      position: absolute;
      bottom: 30px;
      left: 40px;
      right: 40px;
      height: 70px;
      background: linear-gradient(135deg, rgba(255,122,74,0.18) 0%, rgba(255,122,74,0.06) 100%);
      border: 1.5px solid rgba(255,122,74,0.50);
      border-radius: 16px;
      padding: 0 24px;
      display: flex;
      align-items: center;
      gap: 18px;
      box-shadow: 0 8px 24px rgba(255,122,74,0.18), inset 0 1px 0 rgba(255,255,255,0.06);
    }

    .zero-rate-number {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      font-size: 42px;
      color: #FF7A4A;
      line-height: 1;
      letter-spacing: -1px;
    }

    .zero-rate-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .zero-rate-label {
      font-family: 'Poppins', sans-serif;
      font-weight: 700;
      font-size: 15px;
      color: #ffffff;
      letter-spacing: 0.3px;
    }

    .zero-rate-sub {
      font-family: 'Poppins', sans-serif;
      font-weight: 400;
      font-size: 12px;
      color: rgba(255,255,255,0.60);
    }

    /* Benefits row */
    .benefits-row {
      position: absolute;
      top: 680px;
      left: 64px;
      right: 64px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
      z-index: 5;
    }

    .benefit-card {
      background:
        linear-gradient(135deg, rgba(46,212,199,0.06) 0%, rgba(46,212,199,0.02) 100%);
      border: 1px solid rgba(46,212,199,0.22);
      border-radius: 18px;
      padding: 20px 22px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      backdrop-filter: blur(4px);
    }

    .benefit-card.is-hero {
      background: linear-gradient(135deg, rgba(255,122,74,0.10) 0%, rgba(255,122,74,0.02) 100%);
      border: 1.5px solid rgba(255,122,74,0.45);
      box-shadow: 0 8px 24px rgba(255,122,74,0.12);
    }

    .benefit-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: rgba(46,212,199,0.10);
      border: 1px solid rgba(46,212,199,0.30);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #2ED4C7;
    }

    .is-hero .benefit-icon {
      background: rgba(255,122,74,0.12);
      border-color: rgba(255,122,74,0.40);
      color: #FF7A4A;
    }

    .benefit-icon svg { width: 20px; height: 20px; }

    .benefit-title {
      font-family: 'Poppins', sans-serif;
      font-weight: 700;
      font-size: 17px;
      color: #ffffff;
      line-height: 1.2;
    }

    .benefit-title .asterisk {
      color: #FF7A4A;
      font-weight: 600;
    }

    .benefit-desc {
      font-family: 'Poppins', sans-serif;
      font-weight: 400;
      font-size: 13px;
      color: rgba(255,255,255,0.62);
      line-height: 1.45;
    }

    /* Pre-approval highlight + claim */
    .highlight-band {
      position: absolute;
      top: 870px;
      left: 64px;
      right: 64px;
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      gap: 24px;
      z-index: 5;
    }

    .preapproval {
      background: linear-gradient(90deg, rgba(255,122,74,0.14) 0%, rgba(255,122,74,0.04) 100%);
      border: 1px solid rgba(255,122,74,0.40);
      border-radius: 18px;
      padding: 18px 24px;
      display: flex;
      align-items: center;
      gap: 18px;
      overflow: hidden;
      position: relative;
    }

    .preapproval-icon {
      flex-shrink: 0;
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: rgba(255,122,74,0.18);
      border: 1px solid rgba(255,122,74,0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #FF7A4A;
    }

    .preapproval-icon svg { width: 24px; height: 24px; }

    .preapproval-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .preapproval-title {
      font-family: 'Poppins', sans-serif;
      font-weight: 700;
      font-size: 17px;
      color: #ffffff;
      letter-spacing: 0.2px;
    }

    .preapproval-title .asterisk { color: #FF7A4A; }

    .preapproval-desc {
      font-family: 'Poppins', sans-serif;
      font-weight: 400;
      font-size: 13px;
      color: rgba(255,255,255,0.62);
      line-height: 1.4;
    }

    .claim {
      background: linear-gradient(90deg, rgba(46,212,199,0.12) 0%, rgba(255,122,74,0.12) 100%);
      border: 1px solid rgba(255,255,255,0.10);
      border-radius: 18px;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    }

    .claim-text {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-style: italic;
      font-size: 22px;
      color: #ffffff;
      line-height: 1.25;
    }

    .claim-text .dot-tq { color: #2ED4C7; }
    .claim-text .dot-cr { color: #FF7A4A; }

    /* Legal footer */
    .legal-block {
      position: absolute;
      bottom: 24px;
      left: 64px;
      right: 64px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      z-index: 5;
    }

    .legal-note {
      font-family: 'Poppins', sans-serif;
      font-weight: 400;
      font-size: 10px;
      font-style: italic;
      color: rgba(255,255,255,0.42);
      line-height: 1.4;
      letter-spacing: 0.1px;
    }

    .legal-disclosure {
      font-family: 'Poppins', sans-serif;
      font-weight: 400;
      font-size: 9.5px;
      color: rgba(255,255,255,0.35);
      line-height: 1.4;
      letter-spacing: 0.1px;
      border-top: 1px solid rgba(255,255,255,0.08);
      padding-top: 6px;
    }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        slide.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', resize);
      resize(); setTimeout(resize, 50); setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#0A0E14;width:100%;height:100vh;">
  <div class="slide">
    <!-- Orb watermark -->
    <div class="orb-watermark">
      <img src="${LOGO_URL}" alt="" />
    </div>
    <div class="grain"></div>

    <!-- Brand lockup -->
    <div class="brand-row">
      <img src="${LOGO_URL}" alt="Xending" />
      <span class="wordmark">xending</span>
    </div>

    <span class="slide-meta">06 · Capital</span>

    <!-- Top zone: header + hero visual -->
    <div class="top-zone">

      <!-- Left: Copy -->
      <div class="top-left">
        <span class="eyebrow-tag">Producto Financiero</span>
        <div class="product-title">Xending <span class="capital">Capital</span></div>
        <h1>Financia tus importaciones con <span class="accent-tq">tasa 0%</span><span style="color:#FF7A4A;font-size:0.7em;vertical-align:super;font-style:normal;">*</span></h1>
        <p class="subheadline">
          Paga hoy a tus proveedores internacionales y liquida hasta en 30 días, sin descapitalizar tu operación.
        </p>
      </div>

      <!-- Right: Hero visual -->
      <div class="hero-visual">

        <!-- Hero photo — ya subida al bucket design-images/presentations/.
             Para cambiarla: Editor Visual → "Foto hero (slide 6)" → subir nueva. -->
        <img class="hero-photo" src="https://gdfhytvjnzdovjfovqfv.supabase.co/storage/v1/object/public/design-images/presentations/1778624303503-gfs6rmdfx8s.png" alt="Xending Capital hero" />

        <!-- Chart panel -->
        <div class="chart-panel">
          <div class="chart-header">
            <div class="chart-title-block">
              <div class="chart-label">Cotización</div>
              <div class="chart-pair">USD/MXN</div>
            </div>
            <div class="chart-price-block">
              <div class="chart-price">17.85</div>
              <div class="chart-delta">▲ 0.12%</div>
            </div>
          </div>
          <div class="chart-svg-wrap">
            <svg viewBox="0 0 400 160" preserveAspectRatio="none">
              <defs>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stop-color="#2ED4C7" stop-opacity="0.9"/>
                  <stop offset="100%" stop-color="#5EEADF" stop-opacity="1"/>
                </linearGradient>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#2ED4C7" stop-opacity="0.30"/>
                  <stop offset="100%" stop-color="#2ED4C7" stop-opacity="0"/>
                </linearGradient>
              </defs>
              <!-- Grid lines -->
              <line x1="0" y1="40" x2="400" y2="40" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
              <line x1="0" y1="80" x2="400" y2="80" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
              <line x1="0" y1="120" x2="400" y2="120" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
              <!-- Area fill -->
              <path d="M0,110 L30,100 L60,115 L90,95 L120,80 L150,90 L180,70 L210,75 L240,55 L270,65 L300,45 L330,50 L360,30 L400,35 L400,160 L0,160 Z" fill="url(#areaGrad)"/>
              <!-- Line path -->
              <path d="M0,110 L30,100 L60,115 L90,95 L120,80 L150,90 L180,70 L210,75 L240,55 L270,65 L300,45 L330,50 L360,30 L400,35" fill="none" stroke="url(#lineGrad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              <!-- End dot -->
              <circle cx="400" cy="35" r="5" fill="#2ED4C7"/>
              <circle cx="400" cy="35" r="10" fill="#2ED4C7" fill-opacity="0.25"/>
              <!-- Candles (subtle) -->
              <g opacity="0.55">
                <rect x="56" y="100" width="6" height="18" fill="#2ED4C7" rx="1"/>
                <line x1="59" y1="92" x2="59" y2="100" stroke="#2ED4C7" stroke-width="1"/>
                <line x1="59" y1="118" x2="59" y2="126" stroke="#2ED4C7" stroke-width="1"/>

                <rect x="116" y="78" width="6" height="16" fill="#FF7A4A" rx="1"/>
                <line x1="119" y1="70" x2="119" y2="78" stroke="#FF7A4A" stroke-width="1"/>
                <line x1="119" y1="94" x2="119" y2="102" stroke="#FF7A4A" stroke-width="1"/>

                <rect x="176" y="62" width="6" height="20" fill="#2ED4C7" rx="1"/>
                <line x1="179" y1="54" x2="179" y2="62" stroke="#2ED4C7" stroke-width="1"/>
                <line x1="179" y1="82" x2="179" y2="90" stroke="#2ED4C7" stroke-width="1"/>

                <rect x="236" y="50" width="6" height="14" fill="#2ED4C7" rx="1"/>
                <line x1="239" y1="42" x2="239" y2="50" stroke="#2ED4C7" stroke-width="1"/>
                <line x1="239" y1="64" x2="239" y2="72" stroke="#2ED4C7" stroke-width="1"/>

                <rect x="296" y="38" width="6" height="18" fill="#2ED4C7" rx="1"/>
                <line x1="299" y1="30" x2="299" y2="38" stroke="#2ED4C7" stroke-width="1"/>
                <line x1="299" y1="56" x2="299" y2="64" stroke="#2ED4C7" stroke-width="1"/>

                <rect x="356" y="26" width="6" height="14" fill="#2ED4C7" rx="1"/>
                <line x1="359" y1="18" x2="359" y2="26" stroke="#2ED4C7" stroke-width="1"/>
                <line x1="359" y1="40" x2="359" y2="48" stroke="#2ED4C7" stroke-width="1"/>
              </g>
            </svg>
          </div>
        </div>

        <!-- Floating currency icons -->
        <div class="currency-icon cur-usd"><span>$</span></div>
        <div class="currency-icon cur-eur"><span>€</span></div>
        <div class="currency-icon is-coral cur-jpy"><span>¥</span></div>

        <!-- Zero-rate badge -->
        <div class="zero-rate">
          <div class="zero-rate-number">0%</div>
          <div class="zero-rate-text">
            <div class="zero-rate-label">Tasa cero sobre el financiamiento</div>
            <div class="zero-rate-sub">Sin intereses sobre tu operación internacional.</div>
          </div>
        </div>

      </div>
    </div>

    <!-- Benefits row: 4 -->
    <div class="benefits-row">

      <div class="benefit-card">
        <div class="benefit-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v12M8 10h6a2 2 0 0 1 0 4H8h6a2 2 0 0 1 0 4H8"/>
          </svg>
        </div>
        <div class="benefit-title">Liquidez hoy</div>
        <div class="benefit-desc">Conserva tu capital de trabajo para mantener activa tu operación.</div>
      </div>

      <div class="benefit-card">
        <div class="benefit-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
          </svg>
        </div>
        <div class="benefit-title">Paga hasta en 30 días<span class="asterisk">*</span></div>
        <div class="benefit-desc">Elige una fecha de liquidación alineada a tu flujo operativo.</div>
      </div>

      <div class="benefit-card is-hero">
        <div class="benefit-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M7 7l10 10M17 7L7 17"/>
          </svg>
        </div>
        <div class="benefit-title">Tasa 0%<span class="asterisk">*</span></div>
        <div class="benefit-desc">Sin intereses sobre el financiamiento de tu operación internacional.</div>
      </div>

      <div class="benefit-card">
        <div class="benefit-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <polyline points="9 12 11 14 15 10"/>
          </svg>
        </div>
        <div class="benefit-title">Seguro y confiable</div>
        <div class="benefit-desc">Pagos globales con validación operativa y respaldo especializado.</div>
      </div>

    </div>

    <!-- Highlight band: pre-approval + claim -->
    <div class="highlight-band">

      <div class="preapproval">
        <div class="preapproval-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="13 2 13 13 20 13 11 22 11 11 4 11"/>
          </svg>
        </div>
        <div class="preapproval-text">
          <div class="preapproval-title">Precalificación en 48 hrs.<span class="asterisk">*</span></div>
          <div class="preapproval-desc">Respuesta rápida para evaluar tu operación y avanzar con una solución de capital de trabajo.</div>
        </div>
      </div>

      <div class="claim">
        <div class="claim-text">
          <span class="dot-tq">Liquidez para importar.</span> <span class="dot-cr">Control para crecer.</span>
        </div>
      </div>

    </div>

    <!-- Legal footer -->
    <div class="legal-block">
      <p class="legal-note">
        *Sujeto a análisis, aprobación, documentación, perfil del cliente, condiciones operativas, divisa, monto y disponibilidad del producto. La tasa 0% se refiere a la ausencia de intereses sobre el financiamiento; pueden aplicar diferenciales cambiarios, costos operativos o condiciones comerciales según la operación.
      </p>
      <p class="legal-disclosure">
        Xending Capital es una marca comercial de Lemad, operada por Lemad Capital, S.A.P.I. de C.V., SOFOM, E.N.R., Sociedad Financiera de Objeto Múltiple, Entidad No Regulada, constituida conforme a las leyes mexicanas, cuyo objeto consiste en la realización habitual y profesional de operaciones de crédito, en términos de la Ley General de Organizaciones y Actividades Auxiliares del Crédito, particularmente su artículo 87-B, así como en cumplimiento de las disposiciones aplicables en materia de prevención de lavado de dinero.
      </p>
    </div>

  </div>
</body>
</html>`;

// ─── SLIDE 7 V1: Contacto / Cierre — Logo + tagline + contact footer ───────

export const slide07_closing_v1: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${FONTS}');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #0A0E14; }

    .slide {
      width: 1920px;
      height: 1080px;
      position: relative;
      overflow: hidden;
      font-family: 'Poppins', sans-serif;
      background:
        radial-gradient(ellipse 900px 700px at 20% 50%, rgba(46,212,199,0.08) 0%, transparent 60%),
        radial-gradient(ellipse 700px 600px at 50% 50%, rgba(255,255,255,0.02) 0%, transparent 65%),
        linear-gradient(135deg, #0A0E14 0%, #0F1722 50%, #0A0E14 100%);
      transform-origin: top left;
    }

    .grain {
      position: absolute;
      inset: 0;
      opacity: 0.06;
      mix-blend-mode: overlay;
      pointer-events: none;
      background-image: ${GRAIN};
      z-index: 1;
    }

    /* Giant orb "halo" — positioned center-right so roughly its right half is
       visible, with the left half fading into the navy background. */
    .orb-halo {
      position: absolute;
      top: 50%;
      right: -260px;
      transform: translateY(-50%);
      width: 1700px;
      height: 1700px;
      pointer-events: none;
      z-index: 2;
      /* Aggressive fade on the left half so the orb blends into the navy */
      -webkit-mask-image: linear-gradient(to right, transparent 0%, transparent 35%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.70) 62%, rgba(0,0,0,0.95) 75%, #000 85%);
              mask-image: linear-gradient(to right, transparent 0%, transparent 35%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.70) 62%, rgba(0,0,0,0.95) 75%, #000 85%);
    }

    .orb-halo img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      opacity: 0.55;
    }

    /* Central content */
    .center-block {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, calc(-50% - 40px));
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 28px;
      z-index: 5;
      text-align: center;
    }

    .logo-lockup {
      display: flex;
      align-items: center;
      gap: 24px;
    }

    .logo-lockup img {
      width: 120px;
      height: 120px;
      object-fit: contain;
      filter: drop-shadow(0 0 40px rgba(46,212,199,0.25));
    }

    .logo-wordmark {
      font-family: 'Poppins', sans-serif;
      font-weight: 700;
      font-size: 110px;
      color: #ffffff;
      letter-spacing: -3px;
      line-height: 1;
    }

    .tagline {
      font-family: 'Montserrat', sans-serif;
      font-weight: 400;
      font-style: italic;
      font-size: 30px;
      color: rgba(255,255,255,0.78);
      letter-spacing: 0.3px;
      line-height: 1.4;
    }

    /* Contact footer */
    .contact-row {
      position: absolute;
      bottom: 120px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 0;
      z-index: 5;
    }

    .contact-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 32px;
      position: relative;
    }

    .contact-item:not(:last-child)::after {
      content: '';
      position: absolute;
      right: 0;
      top: 20%;
      bottom: 20%;
      width: 1px;
      background: rgba(255,255,255,0.15);
    }

    .contact-icon {
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #2ED4C7;
    }

    .contact-icon svg { width: 18px; height: 18px; }

    .contact-text {
      font-family: 'Poppins', sans-serif;
      font-weight: 400;
      font-size: 18px;
      color: rgba(255,255,255,0.80);
      letter-spacing: 0.2px;
    }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        slide.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', resize);
      resize(); setTimeout(resize, 50); setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#0A0E14;width:100%;height:100vh;">
  <div class="slide">
    <div class="grain"></div>

    <!-- Giant orb halo anchored to the right edge (same asset as the center logo) -->
    <div class="orb-halo">
      <img src="${LOGO_URL}" alt="" />
    </div>

    <!-- Center: Logo + tagline -->
    <div class="center-block">
      <div class="logo-lockup">
        <img src="${LOGO_URL}" alt="Xending" />
        <span class="logo-wordmark">xending</span>
      </div>
      <p class="tagline">Más rápido. Más eficiente. Más inteligente.</p>
    </div>

    <!-- Contact footer -->
    <div class="contact-row">

      <div class="contact-item">
        <div class="contact-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
        </div>
        <span class="contact-text">www.xendinglobal.com</span>
      </div>

      <div class="contact-item">
        <div class="contact-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </div>
        <span class="contact-text">81 1244 1623</span>
      </div>

      <div class="contact-item">
        <div class="contact-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>
        <span class="contact-text">contacto@xendinglobal.com</span>
      </div>

    </div>
  </div>
</body>
</html>`;

// ─── SLIDE 1 V13: Cover — Aliado Mapa (mapa mundial + logo Xending) ─────────

export const slide01_cover_v13: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${MAP_COVER_FONTS}');

    :root {
      --mint: #2ED4C7;
      --coral: #FF7A4A;
      --navy: #0F1419;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #ffffff; }

    .slide {
      width: 1600px;
      height: 900px;
      position: relative;
      overflow: hidden;
      font-family: ${MAP_COVER_FONT_BODY};
      background: linear-gradient(180deg, #ffffff 0%, #fcfcfc 100%);
      transform-origin: top left;
    }

    /* Mapa mundial (lado derecho) */
    .map-panel {
      position: absolute; right: 0; top: 0; width: 880px; height: 100%;
      background-image: url('${MAP_COVER_URL}');
      background-repeat: no-repeat; background-position: center right; background-size: cover;
      z-index: 1; opacity: 1; filter: contrast(1.20) brightness(.99) saturate(1.06);
    }
    .map-panel::before {
      content: ''; position: absolute; inset: 0;
      background: linear-gradient(90deg, rgba(255,255,255,0.86) 0%, rgba(255,255,255,0.52) 18%, rgba(255,255,255,0.12) 42%, rgba(255,255,255,0.00) 72%, rgba(255,255,255,0.00) 100%);
    }
    .slide::before {
      content: ''; position: absolute; right: 110px; top: 120px; width: 560px; height: 560px; border-radius: 50%;
      background: radial-gradient(circle, rgba(46,212,199,.035) 0%, rgba(46,212,199,0) 72%); z-index: 0;
    }

    /* Logo Xending (orb hosteado + wordmark) */
    .logo-row {
      position: absolute; left: 76px; top: 60px; z-index: 5;
      display: flex; align-items: center; gap: 14px;
    }
    .logo-row img { width: 48px; height: 48px; object-fit: contain; }
    .logo-row .wordmark { font-family: ${MAP_COVER_FONT_TITLE}; font-weight: 700; font-size: 28px; color: #081b57; }

    .content { position: absolute; left: 76px; top: 200px; width: 710px; z-index: 3; }
    h1 {
      margin: 0; font-family: ${MAP_COVER_FONT_TITLE}; color: #081b57;
      font-size: 106px; line-height: .95; letter-spacing: -0.055em; font-weight: 700;
    }
    h1 .highlight {
      display: block; font-family: ${MAP_COVER_FONT_TITLE}; margin-top: 10px;
      color: var(--mint); font-weight: 600; letter-spacing: -0.05em;
    }
    .accent-line { width: 60px; height: 4px; margin: 38px 0 34px; background: var(--coral); border-radius: 999px; }
    .subtitle {
      margin: 0; font-family: ${MAP_COVER_FONT_BODY}; max-width: 630px;
      color: #1a2a62; font-size: 24px; line-height: 1.5; font-weight: 600;
    }
    .footer-nav {
      position: absolute; font-family: ${MAP_COVER_FONT_BODY}; left: 76px; bottom: 64px; z-index: 4;
      font-size: 18px; line-height: 1; letter-spacing: .28em; text-transform: uppercase;
      font-weight: 500; color: #11235a; white-space: nowrap;
    }
    .footer-nav .dot { color: var(--coral); padding: 0 18px; font-weight: 700; }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1600, h / 900);
        slide.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', resize);
      resize(); setTimeout(resize, 50); setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#ffffff;width:100%;height:100vh;">
  <div class="slide">
    <div class="map-panel"></div>

    <div class="logo-row">
      <img src="${LOGO_URL}" alt="Xending" />
      <span class="wordmark">xending</span>
    </div>

    <div class="content">
      <h1>Tu aliado financiero <span class="highlight">internacional</span></h1>
      <div class="accent-line"></div>
      <p class="subtitle">Tecnología, experiencia y soluciones financieras diseñadas para empresas globales.</p>
    </div>

    <div class="footer-nav">GLOBAL FX <span class="dot">•</span> PAYMENTS <span class="dot">•</span> TREASURY</div>
  </div>
</body>
</html>`;

// ─── SLIDE 2: Presencia global (3 stats con iconos reemplazables) ───────────

const PG_FONTS = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Poppins:wght@400;500;600;700&family=Fraunces:wght@400;600&family=JetBrains+Mono:wght@400;500;600&display=swap';
const PG_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='280' height='280'%3E%3Crect x='6' y='6' width='268' height='268' rx='28' fill='%23F5F7FA' stroke='%23CBD5E1' stroke-width='2' stroke-dasharray='9 7'/%3E%3Ctext x='50%25' y='50%25' font-family='Poppins,sans-serif' font-size='20' fill='%2394A3B8' text-anchor='middle' dominant-baseline='middle'%3Eicono%3C/text%3E%3C/svg%3E";

export const slide02_presencia_global: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${PG_FONTS}');
    :root { --mint: #2ED4C7; --coral: #FF7A4A; --navy: #0F1419; --navy-title: #081B57; --gray: #6B7280; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #ffffff; }

    .slide {
      width: 1920px; height: 1080px; position: relative; overflow: hidden;
      font-family: 'Poppins', sans-serif;
      background: linear-gradient(180deg, #ffffff 0%, #fbfcfd 100%);
      transform-origin: top left;
      display: flex; flex-direction: column; align-items: center;
      padding: 90px 120px 80px;
    }

    /* Header */
    .header { text-align: center; }
    h1 {
      font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 104px; line-height: 1;
      color: var(--navy-title); letter-spacing: -1px;
    }
    h1 .accent {
      font-style: italic; font-weight: 600;
      background: linear-gradient(135deg, #FF7A4A, #FF9468);
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .title-line { width: 72px; height: 4px; background: var(--coral); border-radius: 999px; margin: 28px auto 30px; }
    .subtitle {
      font-family: 'Poppins', sans-serif; font-weight: 500; font-size: 30px; line-height: 1.5;
      color: #1a2a62; max-width: 900px; margin: 0 auto;
    }

    /* Columns */
    .cols { display: flex; align-items: stretch; justify-content: center; gap: 0; width: 100%; margin-top: 70px; flex: 1; }
    .col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; text-align: center; padding: 0 40px; }
    .divider { width: 1px; background: rgba(8,27,87,0.12); align-self: center; height: 420px; }

    /* Icon slot — reemplaza la imagen desde el Editor Visual */
    .icon-slot { width: 300px; height: 300px; display: flex; align-items: center; justify-content: center; }
    .stat-icon { width: 100%; height: 100%; object-fit: contain; }

    .stat-line { width: 60px; height: 4px; background: var(--coral); border-radius: 999px; margin: 30px 0 22px; }
    .number {
      font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 88px; line-height: 1;
      color: var(--navy-title);
    }
    .number.same-day { font-style: italic; font-weight: 500; font-size: 72px; }
    .label {
      font-family: 'Poppins', sans-serif; font-weight: 500; font-size: 24px; line-height: 1.4;
      color: var(--gray); margin-top: 16px;
    }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        slide.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', resize);
      resize(); setTimeout(resize, 50); setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#ffffff;width:100%;height:100vh;">
  <div class="slide">
    <div class="header">
      <h1>Presencia <span class="accent">global</span></h1>
      <div class="title-line"></div>
      <p class="subtitle">Tecnología, experiencia y soluciones financieras diseñadas para empresas globales.</p>
    </div>

    <div class="cols">
      <div class="col">
        <div class="icon-slot"><img class="stat-icon" src="${PG_ICON}#i1" alt="" /></div>
        <div class="stat-line"></div>
        <div class="number">30+</div>
        <div class="label">años de experiencia<br/>en el mercado fx</div>
      </div>

      <div class="divider"></div>

      <div class="col">
        <div class="icon-slot"><img class="stat-icon" src="${PG_ICON}#i2" alt="" /></div>
        <div class="stat-line"></div>
        <div class="number">130+</div>
        <div class="label">divisas<br/>disponibles</div>
      </div>

      <div class="divider"></div>

      <div class="col">
        <div class="icon-slot"><img class="stat-icon" src="${PG_ICON}#i3" alt="" /></div>
        <div class="stat-line"></div>
        <div class="number same-day">Same Day</div>
        <div class="label">pagos a asia<br/>en el mismo día</div>
      </div>
    </div>
  </div>
</body>
</html>`;

// ─── SLIDE 3 2.0: Por qué Xending (hero + 3 cards con iconos) ───────────────

const PG_HERO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='760' height='380'%3E%3Crect x='4' y='4' width='752' height='372' rx='22' fill='%23F5F7FA' stroke='%23CBD5E1' stroke-width='2' stroke-dasharray='11 8'/%3E%3Ctext x='50%25' y='50%25' font-family='Poppins,sans-serif' font-size='24' fill='%2394A3B8' text-anchor='middle' dominant-baseline='middle'%3Eimagen%3C/text%3E%3C/svg%3E";

export const slide03_porque_xending: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${PG_FONTS}');
    :root { --mint: #2ED4C7; --coral: #FF7A4A; --navy: #0F1419; --navy-title: #081B57; --gray: #6B7280; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #ffffff; }

    .slide {
      width: 1920px; height: 1080px; position: relative; overflow: hidden;
      font-family: 'Poppins', sans-serif;
      background: linear-gradient(180deg, #ffffff 0%, #fbfcfd 100%);
      transform-origin: top left;
      display: flex; gap: 70px; padding: 80px 96px 96px;
    }

    /* Columna izquierda */
    .left { flex: 0.92; display: flex; flex-direction: column; position: relative; z-index: 2; }
    .eyebrow-row { display: flex; align-items: center; gap: 14px; }
    .eyebrow-line { width: 44px; height: 3px; background: var(--coral); border-radius: 999px; }
    .eyebrow { color: var(--coral); font-weight: 600; font-size: 15px; letter-spacing: 3px; text-transform: uppercase; }
    h1 { font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 76px; line-height: 1.05; color: var(--navy-title); margin-top: 24px; letter-spacing: -1px; }
    h1 .accent { font-style: italic; background: linear-gradient(135deg, #FF7A4A, #FF9468); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .subtitle { font-family: 'Poppins', sans-serif; font-weight: 500; font-size: 22px; line-height: 1.55; color: #1a2a62; margin-top: 26px; max-width: 560px; }
    .hero {
      position: absolute; left: 0; top: 0; width: 100%; height: 100%;
      background-size: 92% auto; background-position: left bottom; background-repeat: no-repeat;
      z-index: 0;
      pointer-events: none;
      /* foto fuerte abajo-izquierda, se funde hacia el centro/arriba/derecha */
      -webkit-mask-image: radial-gradient(ellipse 60% 60% at 22% 82%, #000 34%, rgba(0,0,0,0) 74%);
              mask-image: radial-gradient(ellipse 60% 60% at 22% 82%, #000 34%, rgba(0,0,0,0) 74%);
      -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
    }

    /* Columna derecha — 3 cards (altura fija, balanceadas) */
    .cards { flex: 1.18; display: flex; gap: 28px; align-items: flex-start; margin-top: 40px; position: relative; z-index: 2; }
    .card { flex: 1; height: 810px; background: #ffffff; border: 1px solid rgba(8,27,87,0.06); border-radius: 26px; padding: 40px 34px; box-shadow: 0 20px 55px rgba(15,20,25,0.06); display: flex; flex-direction: column; }
    .icon-slot { width: 190px; height: 190px; align-self: center; margin: 6px 0 10px; }
    .stat-icon { width: 100%; height: 100%; object-fit: contain; }
    .card-line { width: 52px; height: 3px; background: var(--coral); border-radius: 999px; margin: 30px 0 20px; }
    .card h3 { font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 30px; line-height: 1.18; color: var(--navy-title); }
    .card-sub { font-family: 'Poppins', sans-serif; font-weight: 600; font-size: 18px; line-height: 1.4; color: var(--navy-title); margin-top: 20px; }
    .card-body { font-family: 'Poppins', sans-serif; font-weight: 400; font-size: 16px; line-height: 1.6; color: var(--gray); margin-top: 12px; }
    .card-body .hl { color: var(--mint); font-weight: 600; }
    .pill { margin-top: auto; align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 999px; background: rgba(46,212,199,0.12); color: #1FB8AC; font-weight: 600; font-size: 13px; }

    .footer-note { position: absolute; left: 0; right: 0; bottom: 32px; text-align: center; font-family: 'Poppins', sans-serif; font-size: 14px; color: #9aa3af; z-index: 2; }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        slide.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', resize);
      resize(); setTimeout(resize, 50); setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#ffffff;width:100%;height:100vh;">
  <div class="slide">
    <!-- Foto de fondo (capa detrás de todo el contenido) -->
    <div class="hero" style="background-image:url('${PG_HERO}');"></div>

    <!-- Izquierda -->
    <div class="left">
      <div class="eyebrow-row">
        <span class="eyebrow-line"></span>
        <span class="eyebrow">Por qué Xending</span>
      </div>
      <h1>Tu mejor opción para operar <span class="accent">globalmente</span></h1>
      <p class="subtitle">Centraliza tus pagos, divisas y onboarding empresarial en una plataforma diseñada para empresas que operan globalmente con velocidad, cumplimiento y atención experta.</p>
    </div>

    <!-- Derecha: 3 cards -->
    <div class="cards">
      <div class="card">
        <div class="icon-slot"><img class="stat-icon" src="${PG_ICON}#c1" alt="" /></div>
        <div class="card-line"></div>
        <h3>Velocidad operativa</h3>
        <div class="card-sub">Sin fricciones, rápido y sencillo.</div>
        <div class="card-body">Procesos digitales para cotizar, validar y ejecutar operaciones con mayor agilidad.</div>
      </div>

      <div class="card">
        <div class="icon-slot"><img class="stat-icon" src="${PG_ICON}#c2" alt="" /></div>
        <div class="card-line"></div>
        <h3>Pagos a China el mismo día</h3>
        <div class="card-sub">Conexión directa para pagos internacionales.</div>
        <div class="card-body">Pagos a proveedores con seguimiento operativo, soporte especializado y mayor visibilidad en cada transferencia.</div>
        <div class="pill">✓ Rápido, seguro y trazable</div>
      </div>

      <div class="card">
        <div class="icon-slot"><img class="stat-icon" src="${PG_ICON}#c3" alt="" /></div>
        <div class="card-line"></div>
        <h3>Atención personalizada</h3>
        <div class="card-sub">Expertos que entienden tu negocio.</div>
        <div class="card-body">Un equipo especializado que acompaña a tu empresa en <span class="hl">pagos, divisas y decisiones financieras internacionales</span>.</div>
      </div>
    </div>

    <div class="footer-note">*Sujeto a horario, divisa, banco destino y validación operativa.</div>
  </div>
</body>
</html>`;

// ─── SLIDE 4 2.0: Onboarding empresarial con IA (panel + franja de features) ─

export const slide04_onboarding_ia: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${PG_FONTS}');
    :root { --mint: #2ED4C7; --coral: #FF7A4A; --navy: #0F1419; --navy-title: #081B57; --gray: #6B7280; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #ffffff; }

    .slide {
      width: 1920px; height: 1080px; position: relative; overflow: hidden;
      font-family: 'Poppins', sans-serif;
      background: linear-gradient(180deg, #ffffff 0%, #fbfcfd 100%);
      transform-origin: top left;
      display: flex; flex-direction: column; padding: 78px 90px 56px;
    }

    /* Barra superior fina */
    .topbar { position: absolute; left: 0; top: 0; width: 100%; height: 8px; background: var(--navy-title); }

    /* Bloque principal */
    .top { display: flex; gap: 70px; flex: 1; align-items: stretch; }

    /* Columna izquierda */
    .left { flex: 0.92; display: flex; flex-direction: column; justify-content: center; max-width: 720px; }
    .eyebrow-row { display: flex; align-items: center; gap: 14px; }
    .eyebrow-line { width: 44px; height: 3px; background: var(--coral); border-radius: 999px; }
    .eyebrow { color: var(--coral); font-weight: 600; font-size: 15px; letter-spacing: 3px; text-transform: uppercase; }
    h1 { font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 84px; line-height: 1.02; color: var(--navy-title); margin-top: 24px; letter-spacing: -1px; }
    h1 .accent { display: block; font-style: italic; background: linear-gradient(135deg, #FF7A4A, #FF9468); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .accent-line { width: 60px; height: 4px; background: var(--coral); border-radius: 999px; margin: 32px 0 28px; }
    .subtitle { font-family: 'Poppins', sans-serif; font-weight: 400; font-size: 22px; line-height: 1.6; color: #1a2a62; max-width: 540px; }

    /* Panel derecho con borde coral */
    .panel { flex: 1.22; align-self: center; background: #ffffff; border: 1.5px solid rgba(255,122,74,0.32); border-radius: 30px; box-shadow: 0 24px 60px rgba(15,20,25,0.06); padding: 50px 56px; display: flex; align-items: center; gap: 48px; }
    .hero-slot { width: 330px; height: 330px; flex: none; display: flex; align-items: center; justify-content: center; }
    .hero-slot img { width: 100%; height: 100%; object-fit: contain; }
    .checklist { flex: 1; display: flex; flex-direction: column; gap: 30px; }
    .check-item { display: flex; align-items: flex-start; gap: 16px; }
    .check-mark { flex: none; width: 30px; height: 30px; border-radius: 50%; border: 2px solid var(--coral); display: flex; align-items: center; justify-content: center; color: var(--coral); font-size: 15px; font-weight: 700; margin-top: 2px; }
    .check-text { font-family: 'Poppins', sans-serif; font-weight: 500; font-size: 21px; line-height: 1.4; color: var(--navy-title); }

    /* Franja inferior de features */
    .strip { display: flex; align-items: stretch; background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); border: 1px solid rgba(8,27,87,0.08); border-radius: 22px; padding: 30px 30px; margin-top: 44px; }
    .feat { flex: 1; display: flex; align-items: center; gap: 18px; padding: 0 30px; }
    .feat-icon { flex: none; width: 66px; height: 66px; }
    .feat-icon img { width: 100%; height: 100%; object-fit: contain; }
    .feat-title { font-family: 'Poppins', sans-serif; font-weight: 600; font-size: 19px; color: var(--navy-title); }
    .feat-body { font-family: 'Poppins', sans-serif; font-weight: 400; font-size: 14px; line-height: 1.45; color: var(--gray); margin-top: 5px; }
    .strip-divider { width: 1px; background: rgba(8,27,87,0.10); align-self: center; height: 78px; }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        slide.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', resize);
      resize(); setTimeout(resize, 50); setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#ffffff;width:100%;height:100vh;">
  <div class="slide">
    <div class="topbar"></div>

    <div class="top">
      <!-- Izquierda -->
      <div class="left">
        <div class="eyebrow-row">
          <span class="eyebrow-line"></span>
          <span class="eyebrow">Por qué Xending</span>
        </div>
        <h1>Onboarding <span class="accent">empresarial con IA</span></h1>
        <div class="accent-line"></div>
        <p class="subtitle">Alta digital, validación documental y cumplimiento operativo para empezar a operar con mayor rapidez. Cumpliendo con las regulaciones de FinCEN, OFAC y organismos internacionales.</p>
      </div>

      <!-- Panel derecho -->
      <div class="panel">
        <div class="hero-slot"><img src="${PG_ICON}#hero" alt="" /></div>
        <div class="checklist">
          <div class="check-item">
            <span class="check-mark">✓</span>
            <span class="check-text">Validación digital de empresa y representantes.</span>
          </div>
          <div class="check-item">
            <span class="check-mark">✓</span>
            <span class="check-text">Procesos seguros, auditables y alineados a estándares globales.</span>
          </div>
          <div class="check-item">
            <span class="check-mark">✓</span>
            <span class="check-text">Monitoreo preventivo de riesgos operativos.</span>
          </div>
          <div class="check-item">
            <span class="check-mark">✓</span>
            <span class="check-text">Menos fricción, más velocidad de activación.</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Franja de features -->
    <div class="strip">
      <div class="feat">
        <div class="feat-icon"><img src="${PG_ICON}#b1" alt="" /></div>
        <div>
          <div class="feat-title">Seguridad institucional</div>
          <div class="feat-body">Protección avanzada para tus operaciones y datos.</div>
        </div>
      </div>
      <div class="strip-divider"></div>
      <div class="feat">
        <div class="feat-icon"><img src="${PG_ICON}#b2" alt="" /></div>
        <div>
          <div class="feat-title">Eficiencia operativa</div>
          <div class="feat-body">Menos procesos manuales, más tiempo para crecer.</div>
        </div>
      </div>
      <div class="strip-divider"></div>
      <div class="feat">
        <div class="feat-icon"><img src="${PG_ICON}#b3" alt="" /></div>
        <div>
          <div class="feat-title">Tecnología global</div>
          <div class="feat-body">Infraestructura robusta, escalable y segura.</div>
        </div>
      </div>
      <div class="strip-divider"></div>
      <div class="feat">
        <div class="feat-icon"><img src="${PG_ICON}#b4" alt="" /></div>
        <div>
          <div class="feat-title">Cumplimiento inteligente</div>
          <div class="feat-body">Procesos claros, auditables y sin complicaciones.</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

// ─── PLANTILLA: 3 Cajas (cards reutilizables, sin color exterior) ───────────

export const slide_cards3_template: string = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${PG_FONTS}');
    :root { --mint: #2ED4C7; --coral: #FF7A4A; --navy: #0F1419; --navy-title: #081B57; --gray: #6B7280; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #ffffff; }

    .slide {
      width: 1920px; height: 1080px; position: relative; overflow: hidden;
      font-family: 'Poppins', sans-serif;
      background: linear-gradient(180deg, #ffffff 0%, #fbfcfd 100%);
      transform-origin: top left;
      display: flex; align-items: center; justify-content: center; padding: 90px 96px;
    }

    .cards { display: flex; gap: 28px; align-items: stretch; width: 100%; max-width: 1640px; }
    .card { flex: 1; height: 810px; background: #ffffff; border: 1px solid rgba(8,27,87,0.06); border-radius: 26px; padding: 40px 34px; box-shadow: 0 20px 55px rgba(15,20,25,0.06); display: flex; flex-direction: column; }
    .icon-slot { width: 190px; height: 190px; align-self: center; margin: 6px 0 10px; }
    .stat-icon { width: 100%; height: 100%; object-fit: contain; }
    .card-line { width: 52px; height: 3px; background: var(--coral); border-radius: 999px; margin: 30px 0 20px; }
    .card h3 { font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 30px; line-height: 1.18; color: var(--navy-title); }
    .card-sub { font-family: 'Poppins', sans-serif; font-weight: 600; font-size: 18px; line-height: 1.4; color: var(--navy-title); margin-top: 20px; }
    .card-body { font-family: 'Poppins', sans-serif; font-weight: 400; font-size: 16px; line-height: 1.6; color: var(--gray); margin-top: 12px; }
    .card-body .hl { color: var(--mint); font-weight: 600; }
    .pill { margin-top: auto; align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 999px; background: rgba(46,212,199,0.12); color: #1FB8AC; font-weight: 600; font-size: 13px; }
  </style>
  <script>
    (function() {
      function resize() {
        var slide = document.querySelector('.slide');
        if (!slide) return;
        var w = document.documentElement.clientWidth || window.innerWidth;
        var h = document.documentElement.clientHeight || window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        slide.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', resize);
      resize(); setTimeout(resize, 50); setTimeout(resize, 200);
    })();
  </script>
</head>
<body style="margin:0;overflow:hidden;background:#ffffff;width:100%;height:100vh;">
  <div class="slide">
    <div class="cards">
      <div class="card">
        <div class="icon-slot"><img class="stat-icon" src="${PG_ICON}#c1" alt="" /></div>
        <div class="card-line"></div>
        <h3>Título de la caja</h3>
        <div class="card-sub">Subtítulo breve y directo.</div>
        <div class="card-body">Texto descriptivo de apoyo para explicar el beneficio o la idea principal de esta caja.</div>
      </div>

      <div class="card">
        <div class="icon-slot"><img class="stat-icon" src="${PG_ICON}#c2" alt="" /></div>
        <div class="card-line"></div>
        <h3>Título de la caja</h3>
        <div class="card-sub">Subtítulo breve y directo.</div>
        <div class="card-body">Texto descriptivo de apoyo para explicar el beneficio o la idea principal de esta caja.</div>
        <div class="pill">✓ Etiqueta destacada</div>
      </div>

      <div class="card">
        <div class="icon-slot"><img class="stat-icon" src="${PG_ICON}#c3" alt="" /></div>
        <div class="card-line"></div>
        <h3>Título de la caja</h3>
        <div class="card-sub">Subtítulo breve y directo.</div>
        <div class="card-body">Texto descriptivo de apoyo con un <span class="hl">término resaltado</span> dentro del contenido.</div>
      </div>
    </div>
  </div>
</body>
</html>`;

// ─── EXPORT ──────────────────────────────────────────────────────────────────

export const PRESENTATION_TEMPLATES_V2 = [
  { title: 'Portada (Navy Split)', html: slide01_cover_v2 },
  { title: 'Portada (Orb Marca)', html: slide01_cover_v3 },
  { title: 'Portada (Rayo Diagonal)', html: slide01_cover_v4 },
  { title: 'Portada (Glass Card)', html: slide01_cover_v5 },
  { title: 'Portada (Orb Halo Dark)', html: slide01_cover_v6 },
  { title: 'Portada (Orb Halo Light)', html: slide01_cover_v7 },
  { title: 'Portada (Aliado Internacional)', html: slide01_cover_v8 },
  { title: 'Portada (Aliado Mapa)', html: slide01_cover_v13 },
  { title: 'Presencia Global', html: slide02_presencia_global },
  { title: 'Slide 3 2.0', html: slide03_porque_xending },
  { title: 'Slide 4 2.0 (Onboarding IA)', html: slide04_onboarding_ia },
  { title: 'Plantilla · 3 Cajas', html: slide_cards3_template },
  { title: 'Portada (Halo Portal)', html: slide01_cover_v9 },
  { title: 'Portada (Navy Foto Halo)', html: slide01_cover_v10 },
  { title: 'Portada (Aliado Fusion)', html: slide01_cover_v11 },
  { title: 'Portada (Aliado Orb Envolvente)', html: slide01_cover_v12 },
  { title: 'Slide 2 (Servicios Orb)', html: slide02_services_v1 },
  { title: 'Slide 3 (Servicios Grid Hero)', html: slide03_services_v2 },
  { title: 'Slide 4 (Diferenciadores)', html: slide04_differentiators_v1 },
  { title: 'Slide 5 (Coberturas)', html: slide05_hedging_v1 },
  { title: 'Slide 6 (Xending Capital)', html: slide06_capital_v1 },
  { title: 'Slide 7 (Contacto)', html: slide07_closing_v1 },
];
