/**
 * Presentation Templates — Xending Global Pitch Deck
 *
 * Uses the "Card Light" visual style from designTemplates.ts:
 * - Background: Cream #F5F3F0 with soft mesh gradient (coral top-right, turquoise bottom-left)
 * - Cards: White with soft shadows
 * - Typography: Fraunces (headlines, italic accents), Inter (body), JetBrains Mono (numbers)
 * - Colors: Navy #0F1419 (text), Turquoise #2ED4C7, Coral #FF7A4A (accents)
 * - Format: 1920x1080 (16:9 presentation)
 */

import { slide01_cover_v2, slide01_cover_v3, slide01_cover_v4, slide01_cover_v5, slide01_cover_v6, slide01_cover_v7, slide01_cover_v8, slide01_cover_v9, slide01_cover_v10, slide01_cover_v11, slide01_cover_v12, slide02_services_v1, slide03_services_v2, slide04_differentiators_v1, slide05_hedging_v1, slide06_capital_v1, slide07_closing_v1 } from './presentationTemplates_v2';

export interface PresentationSlide {
  title: string;
  html: string;
}

const LOGO_URL = 'https://gdfhytvjnzdovjfovqfv.supabase.co/storage/v1/object/sign/Brand/Xending%20bola%20logoabril26.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8zNDdhNjgwZi1hZGU3LTQ3OGYtYjdkNy1kMGY5YzJjMDc4NDEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJCcmFuZC9YZW5kaW5nIGJvbGEgbG9nb2FicmlsMjYucG5nIiwiaWF0IjoxNzc3MTU1Nzg2LCJleHAiOjE4MDg2OTE3ODZ9.8ZrGD1_TGdtzJn5lSP3X3pvlqvFV-mfgwxLySRQUO3U';

const FONTS = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap';

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

const BASE_STYLES = `
  <style>
    @import url('${FONTS}');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body { margin: 0; overflow: hidden; background: #F5F3F0; }

    .slide {
      width: 1920px;
      height: 1080px;
      position: relative;
      overflow: hidden;
      font-family: 'Inter', sans-serif;
      color: #0F1419;
      transform-origin: top left;
    }

    /* Card Light background: cream + mesh gradient (enhanced for presentation) */
    .bg-mesh {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse 1200px 900px at 90% 5%, rgba(255,120,70,0.22) 0%, transparent 55%),
        radial-gradient(ellipse 1400px 1000px at 5% 95%, rgba(46,212,199,0.28) 0%, transparent 55%),
        radial-gradient(ellipse 800px 600px at 50% 50%, rgba(255,255,255,0.6) 0%, transparent 70%),
        linear-gradient(180deg, #F8F5F1 0%, #EEEBE5 100%);
    }

    .grain {
      position: absolute;
      inset: 0;
      opacity: 0.08;
      mix-blend-mode: multiply;
      pointer-events: none;
      background-image: ${GRAIN};
    }

    .slide-content {
      position: relative;
      z-index: 1;
      width: 100%;
      height: 100%;
      padding: 64px 80px;
      display: flex;
      flex-direction: column;
    }

    /* Typography */
    h1 {
      font-family: 'Fraunces', serif;
      font-weight: 600;
      font-size: 72px;
      line-height: 1.05;
      color: #0F1419;
    }

    h2 {
      font-family: 'Fraunces', serif;
      font-weight: 600;
      font-size: 52px;
      line-height: 1.1;
      color: #0F1419;
    }

    h3 {
      font-family: 'Fraunces', serif;
      font-weight: 600;
      font-size: 36px;
      line-height: 1.15;
      color: #0F1419;
    }

    .subtitle {
      font-family: 'Inter', sans-serif;
      font-size: 26px;
      font-weight: 400;
      color: #555;
      line-height: 1.5;
    }

    .body {
      font-family: 'Inter', sans-serif;
      font-size: 22px;
      font-weight: 400;
      color: #555;
      line-height: 1.5;
    }

    /* Accent styles matching Card Light */
    .accent-coral {
      font-style: italic;
      background: linear-gradient(135deg, #FF7A4A, #E85A2C);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .accent-tq {
      font-style: italic;
      background: linear-gradient(135deg, #2ED4C7, #1FB8AC);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .number {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      color: #2ED4C7;
    }

    .number-coral {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      color: #FF7A4A;
    }

    /* Main slide card — white container that wraps all content */
    .slide-card {
      position: absolute;
      top: 32px;
      left: 32px;
      right: 32px;
      bottom: 32px;
      background: #fff;
      border-radius: 32px;
      padding: 56px 72px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.03), 0 30px 70px rgba(255,120,70,0.08), 0 50px 120px rgba(46,212,199,0.06);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 1;
    }
    .card {
      background: #F9F7F4;
      border-radius: 20px;
      padding: 40px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
      border: 1px solid rgba(0,0,0,0.04);
    }

    .card-accent {
      background: #F9F7F4;
      border-radius: 20px;
      padding: 40px;
      border-left: 5px solid #2ED4C7;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }

    .card-coral {
      background: #F9F7F4;
      border-radius: 20px;
      padding: 40px;
      border-left: 5px solid #FF7A4A;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }

    /* Tags */
    .tag {
      display: inline-block;
      padding: 8px 18px;
      border-radius: 100px;
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      font-family: 'Inter', sans-serif;
    }

    .tag-tq {
      background: rgba(46,212,199,0.12);
      color: #1FB8AC;
    }

    .tag-coral {
      background: rgba(255,120,70,0.12);
      color: #E85A2C;
    }

    /* CTA button */
    .cta-btn {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      padding: 20px 40px;
      border-radius: 100px;
      border: none;
      font-family: 'Inter', sans-serif;
      font-weight: 600;
      font-size: 22px;
      background: linear-gradient(135deg, #FF7A4A, #E85A2C);
      color: #fff;
      cursor: pointer;
    }

    .cta-btn-tq {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      padding: 20px 40px;
      border-radius: 100px;
      border: none;
      font-family: 'Inter', sans-serif;
      font-weight: 600;
      font-size: 22px;
      background: linear-gradient(135deg, #2ED4C7, #1FB8AC);
      color: #0F1419;
      cursor: pointer;
    }

    /* Logo row */
    .logo-row {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .logo-row img {
      width: 48px;
      height: 48px;
      object-fit: contain;
    }

    .wordmark {
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      font-size: 28px;
      color: #1a1a1a;
    }

    /* Utilities */
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 28px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; }
    .grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 28px; }

    .divider {
      width: 80px;
      height: 4px;
      background: linear-gradient(90deg, #FF7A4A, #2ED4C7);
      border-radius: 2px;
    }

    .disclaimer {
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      color: #999;
    }

    /* Image placeholder */
    .img-placeholder {
      background: linear-gradient(135deg, rgba(46,212,199,0.08), rgba(255,120,70,0.06));
      border: 2px dashed rgba(46,212,199,0.3);
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #999;
      font-size: 16px;
      font-style: italic;
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
      // Run on load and after a small delay to ensure iframe has dimensions
      resize();
      setTimeout(resize, 50);
      setTimeout(resize, 200);
    })();
  </script>
`;

function wrapSlide(content: string): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${BASE_STYLES}</head><body style="margin:0;overflow:hidden;background:#F5F3F0;width:100%;height:100vh;"><div class="slide"><div class="bg-mesh"></div><div class="grain"></div><div class="slide-card">${content}</div></div></body></html>`;
}

// ─── SLIDE 1: Cover ──────────────────────────────────────────────────────────

const slide01_cover = wrapSlide(`
  <div style="display:flex;height:100%;gap:80px;align-items:center;">
    <!-- Left content -->
    <div style="flex:1.2;display:flex;flex-direction:column;gap:32px;">
      <div class="logo-row">
        <img src="${LOGO_URL}" alt="Xending" />
        <span class="wordmark">xending</span>
      </div>

      <h1 style="font-size:76px;max-width:750px;">
        ¿Cuánto le está costando el tipo de cambio a tu empresa
        <span class="accent-coral">cada mes?</span>
      </h1>

      <p class="subtitle" style="max-width:600px;">
        La mayoría de los CFOs no lo saben con exactitud.
        Xending Global te lo muestra — y te ayuda a reducirlo.
      </p>

      <!-- Stats row -->
      <div style="display:flex;gap:48px;margin-top:16px;">
        <div>
          <span class="number" style="font-size:48px;">15+</span>
          <p style="color:#888;font-size:16px;margin-top:4px;">Años en FX</p>
        </div>
        <div>
          <span class="number" style="font-size:48px;">130+</span>
          <p style="color:#888;font-size:16px;margin-top:4px;">Divisas</p>
        </div>
        <div>
          <span class="number" style="font-size:48px;">1 día</span>
          <p style="color:#888;font-size:16px;margin-top:4px;">Pagos a Asia</p>
        </div>
      </div>
    </div>

    <!-- Right: image placeholder -->
    <div style="flex:0.8;height:80%;display:flex;align-items:center;">
      <!-- IMAGE: Dashboard financiero o mockup de plataforma con gráficas de tipo de cambio -->
      <div class="img-placeholder" style="width:100%;height:100%;border-radius:24px;">
        📊 Imagen: Dashboard / Plataforma
      </div>
    </div>
  </div>
`);

// ─── SLIDE 2: El Problema ────────────────────────────────────────────────────

const slide02_problem = wrapSlide(`
  <div style="display:flex;flex-direction:column;height:100%;gap:36px;">
    <div>
      <span class="tag tag-coral">EL PROBLEMA</span>
      <h2 style="margin-top:20px;">La realidad de operar <span class="accent-coral">internacionalmente</span> hoy</h2>
      <p class="subtitle" style="margin-top:8px;">Lo que ningún banco te dice en la propuesta</p>
    </div>

    <div class="grid-3" style="flex:1;align-items:stretch;">
      <div class="card-coral" style="display:flex;flex-direction:column;gap:16px;">
        <span style="font-size:13px;font-weight:600;color:#E85A2C;letter-spacing:1px;text-transform:uppercase;">Costo</span>
        <h3 style="font-size:30px;">Spreads ocultos en tu banco</h3>
        <p class="body" style="font-size:19px;">
          El diferencial promedio bancario es <span class="number">2-4%</span> por operación.
          En $1M USD anuales, eso es hasta <span class="number-coral">$40,000 USD</span> perdidos.
        </p>
      </div>
      <div class="card-coral" style="display:flex;flex-direction:column;gap:16px;">
        <span style="font-size:13px;font-weight:600;color:#E85A2C;letter-spacing:1px;text-transform:uppercase;">Tiempo</span>
        <h3 style="font-size:30px;">Pagos a Asia con demoras</h3>
        <p class="body" style="font-size:19px;">
          Proveedores en China, Vietnam o India esperan <span class="number">3-7 días</span>.
          Cada día de retraso cuesta descuentos, relaciones y producción.
        </p>
      </div>
      <div class="card-coral" style="display:flex;flex-direction:column;gap:16px;">
        <span style="font-size:13px;font-weight:600;color:#E85A2C;letter-spacing:1px;text-transform:uppercase;">Riesgo</span>
        <h3 style="font-size:30px;">Riesgo cambiario sin estrategia</h3>
        <p class="body" style="font-size:19px;">
          El MXN/USD puede moverse <span class="number">5-10%</span> en semanas.
          Sin cobertura, tu margen depende del mercado — no de tu gestión.
        </p>
      </div>
    </div>

    <p style="color:#888;font-size:17px;text-align:center;font-style:italic;">
      Si usas más de un proveedor financiero para resolver esto, estás pagando de más — y perdiendo visibilidad.
    </p>
  </div>
`);

// ─── SLIDE 3: La Solución ────────────────────────────────────────────────────

const slide03_solution = wrapSlide(`
  <div style="display:flex;flex-direction:column;justify-content:center;height:100%;gap:44px;">
    <div>
      <span class="tag tag-tq">LA SOLUCIÓN</span>
      <h1 style="margin-top:20px;font-size:68px;">
        Un solo aliado. Todo centralizado.<br/>
        <span class="accent-coral">Resultados reales.</span>
      </h1>
      <p class="subtitle" style="margin-top:12px;">Una plataforma. Todo integrado. Sin fricción.</p>
    </div>

    <div class="grid-3" style="gap:20px;">
      <div style="display:flex;align-items:center;gap:14px;padding:20px 24px;background:#F9F7F4;border-radius:16px;border-left:3px solid #2ED4C7;box-shadow:0 4px 20px rgba(46,212,199,0.1);">
        <div style="width:10px;height:10px;border-radius:50%;background:#2ED4C7;box-shadow:0 0 8px rgba(46,212,199,0.6);"></div>
        <span style="font-size:20px;color:#0F1419;font-weight:500;">FX competitivo en +130 divisas</span>
      </div>
      <div style="display:flex;align-items:center;gap:14px;padding:20px 24px;background:#F9F7F4;border-radius:16px;border-left:3px solid #FF7A4A;box-shadow:0 4px 20px rgba(255,120,70,0.1);">
        <div style="width:10px;height:10px;border-radius:50%;background:#FF7A4A;box-shadow:0 0 8px rgba(255,120,70,0.6);"></div>
        <span style="font-size:20px;color:#0F1419;font-weight:500;">Pagos a Asia el mismo día</span>
      </div>
      <div style="display:flex;align-items:center;gap:14px;padding:20px 24px;background:#F9F7F4;border-radius:16px;border-left:3px solid #2ED4C7;box-shadow:0 4px 20px rgba(46,212,199,0.1);">
        <div style="width:10px;height:10px;border-radius:50%;background:#2ED4C7;box-shadow:0 0 8px rgba(46,212,199,0.6);"></div>
        <span style="font-size:20px;color:#0F1419;font-weight:500;">Coberturas cambiarias (forwards)</span>
      </div>
      <div style="display:flex;align-items:center;gap:14px;padding:20px 24px;background:#F9F7F4;border-radius:16px;border-left:3px solid #FF7A4A;box-shadow:0 4px 20px rgba(255,120,70,0.1);">
        <div style="width:10px;height:10px;border-radius:50%;background:#FF7A4A;box-shadow:0 0 8px rgba(255,120,70,0.6);"></div>
        <span style="font-size:20px;color:#0F1419;font-weight:500;">Cuenta Multidivisa integrada</span>
      </div>
      <div style="display:flex;align-items:center;gap:14px;padding:20px 24px;background:#F9F7F4;border-radius:16px;border-left:3px solid #2ED4C7;box-shadow:0 4px 20px rgba(46,212,199,0.1);">
        <div style="width:10px;height:10px;border-radius:50%;background:#2ED4C7;box-shadow:0 0 8px rgba(46,212,199,0.6);"></div>
        <span style="font-size:20px;color:#0F1419;font-weight:500;">Financiamiento a proveedores</span>
      </div>
      <div style="display:flex;align-items:center;gap:14px;padding:20px 24px;background:#F9F7F4;border-radius:16px;border-left:3px solid #FF7A4A;box-shadow:0 4px 20px rgba(255,120,70,0.1);">
        <div style="width:10px;height:10px;border-radius:50%;background:#FF7A4A;box-shadow:0 0 8px rgba(255,120,70,0.6);"></div>
        <span style="font-size:20px;color:#0F1419;font-weight:500;">Onboarding con IA en horas</span>
      </div>
    </div>
  </div>
`);

// ─── SLIDE 4: Experiencia ────────────────────────────────────────────────────

const slide04_experience = wrapSlide(`
  <div style="display:flex;height:100%;gap:60px;align-items:center;">
    <!-- Left -->
    <div style="flex:1;display:flex;flex-direction:column;gap:28px;">
      <span class="tag tag-coral">EXPERIENCIA</span>
      <h2>
        Con más de <span class="accent-coral">15 años</span> operando mercados de divisas.
      </h2>
      <p class="body" style="max-width:520px;font-size:20px;">
        No somos una startup sin historial. Somos una fintech construida sobre experiencia real en FX,
        tesorería corporativa e infraestructura financiera global.
      </p>

      <div style="display:flex;gap:36px;margin-top:12px;">
        <div style="text-align:center;">
          <span class="number-coral" style="font-size:44px;">15+</span>
          <p style="color:#888;font-size:14px;margin-top:4px;">Años en FX</p>
        </div>
        <div style="text-align:center;">
          <span class="number" style="font-size:44px;">130+</span>
          <p style="color:#888;font-size:14px;margin-top:4px;">Divisas</p>
        </div>
        <div style="text-align:center;">
          <span class="number-coral" style="font-size:44px;">30</span>
          <p style="color:#888;font-size:14px;margin-top:4px;">Multi-divisa</p>
        </div>
        <div style="text-align:center;">
          <span class="number" style="font-size:44px;">Same Day</span>
          <p style="color:#888;font-size:14px;margin-top:4px;">Asia</p>
        </div>
      </div>
    </div>

    <!-- Right: Quote card -->
    <div style="flex:1;">
      <div class="card-coral" style="padding:44px;">
        <p style="font-size:13px;font-weight:600;color:#E85A2C;letter-spacing:1px;text-transform:uppercase;margin-bottom:16px;">Nuestra Filosofía</p>
        <p style="font-family:'Fraunces',serif;font-size:26px;font-weight:600;line-height:1.35;color:#0F1419;font-style:italic;">
          "No somos un proveedor de pagos. Somos el área de tesorería internacional que tu empresa necesita
          — sin el costo de tenerla internamente."
        </p>
        <div class="divider" style="margin:28px 0 24px;"></div>
        <ul style="list-style:none;display:flex;flex-direction:column;gap:12px;">
          <li style="display:flex;align-items:center;gap:10px;font-size:17px;color:#555;">
            <span style="color:#FF7A4A;font-weight:700;">✓</span> Modelo híbrido: tecnología + mercado financiero
          </li>
          <li style="display:flex;align-items:center;gap:10px;font-size:17px;color:#555;">
            <span style="color:#2ED4C7;font-weight:700;">✓</span> Atención personalizada por expertos reales
          </li>
          <li style="display:flex;align-items:center;gap:10px;font-size:17px;color:#555;">
            <span style="color:#FF7A4A;font-weight:700;">✓</span> Infraestructura escalable y segura
          </li>
          <li style="display:flex;align-items:center;gap:10px;font-size:17px;color:#555;">
            <span style="color:#2ED4C7;font-weight:700;">✓</span> KYC/PLD automatizado con IA
          </li>
        </ul>
      </div>
    </div>
  </div>
`);

// ─── SLIDE 5: Servicios ──────────────────────────────────────────────────────

const slide05_services = wrapSlide(`
  <div style="display:flex;flex-direction:column;height:100%;gap:36px;">
    <div>
      <span class="tag tag-tq">SERVICIOS</span>
      <h2 style="margin-top:20px;">Todo lo que necesitas. <span class="accent-coral">En un solo lugar.</span></h2>
      <p class="subtitle" style="margin-top:8px;">De fragmentar operaciones entre múltiples bancos, a centralizarlo todo con Xending.</p>
    </div>

    <div class="grid-2" style="flex:1;">
      <div class="card" style="display:flex;flex-direction:column;gap:14px;border-top:3px solid #2ED4C7;">
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="number" style="font-size:20px;background:rgba(46,212,199,0.1);padding:8px 14px;border-radius:8px;">FX</span>
          <h3 style="font-size:26px;">Compra/Venta de Divisas</h3>
        </div>
        <p class="body" style="font-size:18px;">
          Tipos de cambio competitivos en +130 divisas con ejecución inmediata.
          Sin spreads ocultos ni comisiones sorpresa.
        </p>
      </div>
      <div class="card" style="display:flex;flex-direction:column;gap:14px;border-top:3px solid #FF7A4A;">
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="number-coral" style="font-size:20px;background:rgba(255,120,70,0.1);padding:8px 14px;border-radius:8px;">PAGOS</span>
          <h3 style="font-size:26px;">Pagos Internacionales</h3>
        </div>
        <p class="body" style="font-size:18px;">
          Paga a tus proveedores el mismo día (Asia incluida).
          Dispersión masiva con un solo archivo y un clic.
        </p>
      </div>
      <div class="card" style="display:flex;flex-direction:column;gap:14px;border-top:3px solid #FF7A4A;">
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="number-coral" style="font-size:20px;background:rgba(255,120,70,0.1);padding:8px 14px;border-radius:8px;">COB</span>
          <h3 style="font-size:26px;">Coberturas Cambiarias</h3>
        </div>
        <p class="body" style="font-size:18px;">
          Forwards y derivados para proteger tus márgenes.
          Fija tu tipo de cambio hoy para operaciones futuras.
        </p>
      </div>
      <div class="card" style="display:flex;flex-direction:column;gap:14px;border-top:3px solid #2ED4C7;">
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="number" style="font-size:20px;background:rgba(46,212,199,0.1);padding:8px 14px;border-radius:8px;">MULTI</span>
          <h3 style="font-size:26px;">Cuenta Multidivisa</h3>
        </div>
        <p class="body" style="font-size:18px;">
          Administra 30+ divisas en una sola cuenta.
          Envía pagos en 130+ monedas con total control.
        </p>
      </div>
    </div>
  </div>
`);

// ─── SLIDE 6: Xending Capital ────────────────────────────────────────────────

const slide06_capital = wrapSlide(`
  <div style="display:flex;height:100%;align-items:center;gap:72px;">
    <!-- Left -->
    <div style="flex:1;display:flex;flex-direction:column;gap:28px;">
      <span class="tag tag-coral">PRÓXIMAMENTE</span>
      <div>
        <h1 style="font-size:60px;">Xending</h1>
        <h1 style="font-size:60px;"><span class="accent-coral">Capital</span></h1>
      </div>
      <h3 style="font-size:32px;color:#0F1419;">
        Financia tus importaciones.<br/>
        <span style="color:#888;">Sin costo financiero explícito.</span>
      </h3>
      <p class="body" style="max-width:480px;">
        Paga a tu proveedor en Asia hoy — sin descapitalizarte — y liquida en la fecha que tú determines.
      </p>
      <div style="background:rgba(46,212,199,0.08);border:1px solid rgba(46,212,199,0.2);border-radius:16px;padding:20px 28px;display:inline-flex;align-items:center;gap:12px;">
        <span class="number" style="font-size:32px;">Tasa 0%</span>
        <span class="body" style="font-size:18px;">cuando operas FX con Xending</span>
      </div>
    </div>

    <!-- Right: Service stack -->
    <div style="flex:0.8;display:flex;flex-direction:column;gap:16px;">
      <div class="card" style="padding:24px 32px;display:flex;align-items:center;gap:16px;">
        <span class="number" style="font-size:18px;background:rgba(46,212,199,0.1);padding:6px 12px;border-radius:8px;">FX</span>
        <span style="font-size:18px;color:#555;">Compra/venta de divisas competitiva</span>
      </div>
      <div class="card" style="padding:24px 32px;display:flex;align-items:center;gap:16px;">
        <span class="number" style="font-size:18px;background:rgba(46,212,199,0.1);padding:6px 12px;border-radius:8px;">PAY</span>
        <span style="font-size:18px;color:#555;">Pagos internacionales el mismo día</span>
      </div>
      <div class="card" style="padding:24px 32px;display:flex;align-items:center;gap:16px;">
        <span class="number" style="font-size:18px;background:rgba(46,212,199,0.1);padding:6px 12px;border-radius:8px;">COB</span>
        <span style="font-size:18px;color:#555;">Coberturas y forwards estructurados</span>
      </div>
      <div style="background:#fff;border-radius:24px;padding:24px 32px;display:flex;align-items:center;gap:16px;border-left:4px solid #FF7A4A;box-shadow:0 4px 20px rgba(255,120,70,0.1);">
        <span class="number-coral" style="font-size:18px;background:rgba(255,120,70,0.1);padding:6px 12px;border-radius:8px;">$0</span>
        <span style="font-size:18px;color:#0F1419;font-weight:600;">Financiamiento a proveedores — tasa cero</span>
      </div>
    </div>
  </div>
`);

// ─── SLIDE 7: Comparativa ────────────────────────────────────────────────────

const slide07_comparison = wrapSlide(`
  <div style="display:flex;flex-direction:column;height:100%;gap:32px;">
    <div>
      <span class="tag tag-tq">COMPARATIVA</span>
      <h2 style="margin-top:20px;">Xending vs. <span class="accent-coral">las alternativas</span></h2>
      <p class="subtitle" style="margin-top:8px;">No es una comparación de precios. Es lo que tu empresa realmente obtiene.</p>
    </div>

    <!-- Table -->
    <div class="card" style="flex:1;padding:0;overflow:hidden;">
      <!-- Header -->
      <div style="display:grid;grid-template-columns:2.2fr 1fr 1fr 1fr;padding:20px 32px;background:rgba(46,212,199,0.05);border-bottom:1px solid #eee;">
        <span style="font-weight:600;color:#0F1419;font-size:16px;">Funcionalidad</span>
        <span style="font-size:15px;color:#888;text-align:center;">Banco Tradicional</span>
        <span style="font-size:15px;color:#888;text-align:center;">Fintech básica</span>
        <span style="font-size:15px;color:#1FB8AC;font-weight:600;text-align:center;">Xending Global</span>
      </div>
      <!-- Rows -->
      <div style="display:grid;grid-template-columns:2.2fr 1fr 1fr 1fr;padding:16px 32px;border-bottom:1px solid #f5f5f5;">
        <span style="font-size:18px;color:#0F1419;">FX sin spreads ocultos</span>
        <span style="text-align:center;font-size:18px;color:#ccc;">✗</span>
        <span style="text-align:center;font-size:15px;color:#888;">Parcial</span>
        <span style="text-align:center;font-size:18px;color:#2ED4C7;font-weight:700;">✓</span>
      </div>
      <div style="display:grid;grid-template-columns:2.2fr 1fr 1fr 1fr;padding:16px 32px;border-bottom:1px solid #f5f5f5;">
        <span style="font-size:18px;color:#0F1419;">Pagos a Asia mismo día</span>
        <span style="text-align:center;font-size:18px;color:#ccc;">✗</span>
        <span style="text-align:center;font-size:18px;color:#ccc;">✗</span>
        <span style="text-align:center;font-size:18px;color:#2ED4C7;font-weight:700;">✓</span>
      </div>
      <div style="display:grid;grid-template-columns:2.2fr 1fr 1fr 1fr;padding:16px 32px;border-bottom:1px solid #f5f5f5;">
        <span style="font-size:18px;color:#0F1419;">Coberturas estructuradas</span>
        <span style="text-align:center;font-size:15px;color:#888;">Burocrático</span>
        <span style="text-align:center;font-size:18px;color:#ccc;">✗</span>
        <span style="text-align:center;font-size:18px;color:#2ED4C7;font-weight:700;">✓</span>
      </div>
      <div style="display:grid;grid-template-columns:2.2fr 1fr 1fr 1fr;padding:16px 32px;border-bottom:1px solid #f5f5f5;">
        <span style="font-size:18px;color:#0F1419;">Cuenta multidivisa 130+ divisas</span>
        <span style="text-align:center;font-size:15px;color:#888;">Limitado</span>
        <span style="text-align:center;font-size:15px;color:#888;">Básico</span>
        <span style="text-align:center;font-size:18px;color:#2ED4C7;font-weight:700;">✓</span>
      </div>
      <div style="display:grid;grid-template-columns:2.2fr 1fr 1fr 1fr;padding:16px 32px;border-bottom:1px solid #f5f5f5;">
        <span style="font-size:18px;color:#0F1419;">Financiamiento tasa 0%</span>
        <span style="text-align:center;font-size:15px;color:#888;">Crédito bancario</span>
        <span style="text-align:center;font-size:18px;color:#ccc;">✗</span>
        <span style="text-align:center;font-size:18px;color:#2ED4C7;font-weight:700;">✓</span>
      </div>
      <div style="display:grid;grid-template-columns:2.2fr 1fr 1fr 1fr;padding:16px 32px;border-bottom:1px solid #f5f5f5;">
        <span style="font-size:18px;color:#0F1419;">Onboarding digital con IA</span>
        <span style="text-align:center;font-size:18px;color:#ccc;">✗</span>
        <span style="text-align:center;font-size:15px;color:#888;">Parcial</span>
        <span style="text-align:center;font-size:18px;color:#2ED4C7;font-weight:700;">✓</span>
      </div>
      <div style="display:grid;grid-template-columns:2.2fr 1fr 1fr 1fr;padding:16px 32px;">
        <span style="font-size:18px;color:#0F1419;">Atención experta dedicada</span>
        <span style="text-align:center;font-size:18px;color:#ccc;">✗</span>
        <span style="text-align:center;font-size:18px;color:#ccc;">✗</span>
        <span style="text-align:center;font-size:18px;color:#2ED4C7;font-weight:700;">✓</span>
      </div>
    </div>
  </div>
`);

// ─── SLIDE 8: Tecnología ─────────────────────────────────────────────────────

const slide08_technology = wrapSlide(`
  <div style="display:flex;height:100%;gap:56px;align-items:center;">
    <!-- Left -->
    <div style="flex:1;display:flex;flex-direction:column;gap:28px;">
      <span class="tag tag-tq">PLATAFORMA</span>
      <h2>Tecnología que trabaja para tu <span class="accent-coral">tesorería</span></h2>
      <p class="subtitle" style="font-size:22px;">Nuestra plataforma no es un portal de consulta. Es tu sala de operaciones financieras globales.</p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:12px;">
        <div style="background:#F9F7F4;border-radius:16px;padding:20px 24px;box-shadow:0 4px 16px rgba(0,0,0,0.04);">
          <span style="font-weight:600;color:#1FB8AC;font-size:16px;">Velocidad</span>
          <p style="color:#555;font-size:15px;margin-top:6px;">Procesamiento en tiempo real. Sin esperas.</p>
        </div>
        <div style="background:#F9F7F4;border-radius:16px;padding:20px 24px;box-shadow:0 4px 16px rgba(0,0,0,0.04);">
          <span style="font-weight:600;color:#1FB8AC;font-size:16px;">IA Integrada</span>
          <p style="color:#555;font-size:15px;margin-top:6px;">Onboarding automático, KYC/PLD, alertas.</p>
        </div>
        <div style="background:#F9F7F4;border-radius:16px;padding:20px 24px;box-shadow:0 4px 16px rgba(0,0,0,0.04);">
          <span style="font-weight:600;color:#1FB8AC;font-size:16px;">Cobertura Integral</span>
          <p style="color:#555;font-size:15px;margin-top:6px;">Pagos, FX, coberturas en un solo flujo.</p>
        </div>
        <div style="background:#F9F7F4;border-radius:16px;padding:20px 24px;box-shadow:0 4px 16px rgba(0,0,0,0.04);">
          <span style="font-weight:600;color:#1FB8AC;font-size:16px;">Acompañamiento</span>
          <p style="color:#555;font-size:15px;margin-top:6px;">Equipo de expertos. Extensión de tu área financiera.</p>
        </div>
      </div>
    </div>

    <!-- Right: Platform mockup -->
    <div style="flex:0.9;">
      <div class="card" style="padding:28px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;">
          <div style="width:10px;height:10px;border-radius:50%;background:#2ED4C7;"></div>
          <div style="width:10px;height:10px;border-radius:50%;background:#FF7A4A;"></div>
          <div style="width:10px;height:10px;border-radius:50%;background:#ddd;"></div>
          <span style="margin-left:12px;font-size:13px;color:#888;">Xending Platform</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div style="background:#F8F5F1;border-radius:14px;padding:18px;">
            <span style="font-size:12px;color:#888;">USD/MXN spot</span>
            <p class="number" style="font-size:32px;margin-top:4px;">18.42</p>
            <span style="color:#2ED4C7;font-size:13px;font-weight:600;">+0.3%</span>
          </div>
          <div style="background:#F8F5F1;border-radius:14px;padding:18px;">
            <span style="font-size:12px;color:#888;">Cobertura activa</span>
            <p class="number" style="font-size:32px;margin-top:4px;">18.15</p>
            <span style="color:#FF7A4A;font-size:13px;font-weight:600;">Fijado</span>
          </div>
          <div style="background:#F8F5F1;border-radius:14px;padding:18px;">
            <span style="font-size:12px;color:#888;">Próximo pago</span>
            <p style="font-size:18px;font-weight:600;color:#0F1419;margin-top:4px;">$450K MXN</p>
            <span style="color:#888;font-size:13px;">Jue 01 Mayo</span>
          </div>
          <div style="background:#F8F5F1;border-radius:14px;padding:18px;">
            <span style="font-size:12px;color:#888;">Posición FX</span>
            <p style="font-size:18px;font-weight:600;color:#0F1419;margin-top:4px;">$1.2M USD</p>
            <span style="color:#2ED4C7;font-size:13px;font-weight:600;">Cubierto 80%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
`);

// ─── SLIDE 9: Situaciones ────────────────────────────────────────────────────

const slide09_situations = wrapSlide(`
  <div style="display:flex;flex-direction:column;height:100%;gap:32px;">
    <div>
      <span class="tag tag-coral">¿TE IDENTIFICAS?</span>
      <h2 style="margin-top:20px;">¿Tu empresa está en alguna de <span class="accent-coral">estas situaciones?</span></h2>
    </div>

    <div class="grid-3" style="flex:1;gap:20px;">
      <div class="card" style="display:flex;flex-direction:column;gap:12px;padding:28px;border-top:3px solid #FF7A4A;">
        <span style="font-size:28px;">🌎</span>
        <h3 style="font-size:22px;">Importas o exportas</h3>
        <p style="color:#555;font-size:16px;line-height:1.4;">
          Operas con proveedores fuera de México y necesitas eficiencia en pagos y divisas.
        </p>
      </div>
      <div class="card" style="display:flex;flex-direction:column;gap:12px;padding:28px;border-top:3px solid #2ED4C7;">
        <span style="font-size:28px;">📉</span>
        <h3 style="font-size:22px;">Exposición al TC</h3>
        <p style="color:#555;font-size:16px;line-height:1.4;">
          El movimiento del dólar afecta tu rentabilidad y no tienes cobertura estructurada.
        </p>
      </div>
      <div class="card" style="display:flex;flex-direction:column;gap:12px;padding:28px;border-top:3px solid #FF7A4A;">
        <span style="font-size:28px;">⏳</span>
        <h3 style="font-size:22px;">Pagos lentos</h3>
        <p style="color:#555;font-size:16px;line-height:1.4;">
          Tus proveedores en Asia esperan días o semanas para recibir sus pagos.
        </p>
      </div>
      <div class="card" style="display:flex;flex-direction:column;gap:12px;padding:28px;border-top:3px solid #2ED4C7;">
        <span style="font-size:28px;">🏦</span>
        <h3 style="font-size:22px;">Múltiples proveedores</h3>
        <p style="color:#555;font-size:16px;line-height:1.4;">
          Banco para FX, otro para pagos, otro para crédito. Tiempo y dinero perdidos.
        </p>
      </div>
      <div class="card" style="display:flex;flex-direction:column;gap:12px;padding:28px;border-top:3px solid #FF7A4A;">
        <span style="font-size:28px;">💰</span>
        <h3 style="font-size:22px;">Capital atado</h3>
        <p style="color:#555;font-size:16px;line-height:1.4;">
          Necesitas pagar importaciones pero quieres preservar tu liquidez operativa.
        </p>
      </div>
      <div class="card" style="display:flex;flex-direction:column;gap:12px;padding:28px;border-top:3px solid #2ED4C7;">
        <span style="font-size:28px;">📊</span>
        <h3 style="font-size:22px;">Sin visibilidad FX</h3>
        <p style="color:#555;font-size:16px;line-height:1.4;">
          No tienes un dashboard en tiempo real de tu exposición cambiaria y posiciones.
        </p>
      </div>
    </div>
  </div>
`);

// ─── SLIDE 10: Proceso ───────────────────────────────────────────────────────

const slide10_process = wrapSlide(`
  <div style="display:flex;flex-direction:column;height:100%;gap:36px;justify-content:center;">
    <div>
      <span class="tag tag-coral">PROCESO</span>
      <h2 style="margin-top:20px;">
        De la primera llamada a tu <span class="accent-coral">primera operación</span>
      </h2>
      <p class="subtitle" style="margin-top:8px;">Así es trabajar con Xending</p>
    </div>

    <!-- Steps -->
    <div class="grid-4" style="gap:24px;">
      <div class="card" style="padding:28px;display:flex;flex-direction:column;gap:12px;border-top:4px solid #FF7A4A;">
        <span style="font-family:'JetBrains Mono',monospace;font-size:36px;font-weight:600;color:#FF7A4A;">01</span>
        <h3 style="font-size:22px;">Diagnóstico financiero</h3>
        <p style="color:#555;font-size:16px;line-height:1.4;">
          Analizamos tus operaciones, divisas, volumen y exposición. Sin compromiso.
        </p>
      </div>
      <div class="card" style="padding:28px;display:flex;flex-direction:column;gap:12px;border-top:4px solid #2ED4C7;">
        <span style="font-family:'JetBrains Mono',monospace;font-size:36px;font-weight:600;color:#2ED4C7;">02</span>
        <h3 style="font-size:22px;">Onboarding con IA</h3>
        <p style="color:#555;font-size:16px;line-height:1.4;">
          Alta digital en horas. KYC automatizado y acceso a plataforma.
        </p>
      </div>
      <div class="card" style="padding:28px;display:flex;flex-direction:column;gap:12px;border-top:4px solid #FF7A4A;">
        <span style="font-family:'JetBrains Mono',monospace;font-size:36px;font-weight:600;color:#FF7A4A;">03</span>
        <h3 style="font-size:22px;">Primera operación</h3>
        <p style="color:#555;font-size:16px;line-height:1.4;">
          Ejecutas tu primer pago o FX. Sientes la diferencia desde el día 1.
        </p>
      </div>
      <div class="card" style="padding:28px;display:flex;flex-direction:column;gap:12px;border-top:4px solid #2ED4C7;">
        <span style="font-family:'JetBrains Mono',monospace;font-size:36px;font-weight:600;color:#2ED4C7;">04</span>
        <h3 style="font-size:22px;">Estrategia de cobertura</h3>
        <p style="color:#555;font-size:16px;line-height:1.4;">
          Diseñamos tu esquema de coberturas y pagos programados.
        </p>
      </div>
    </div>

    <!-- Bottom highlight -->
    <div style="background:linear-gradient(135deg, rgba(255,120,70,0.08), rgba(46,212,199,0.08));border-radius:16px;padding:20px 32px;text-align:center;border:1px solid rgba(255,120,70,0.15);">
      <p style="font-size:20px;color:#0F1419;">
        La mayoría de nuestros clientes ejecutan su primera operación dentro de las primeras
        <span class="number-coral" style="font-size:24px;"> 48 horas</span>.
      </p>
    </div>
  </div>
`);

// ─── SLIDE 11: CTA / Cierre ─────────────────────────────────────────────────

const slide11_cta = wrapSlide(`
  <div style="display:flex;height:100%;align-items:center;gap:72px;">
    <!-- Left: CTA -->
    <div style="flex:1.2;display:flex;flex-direction:column;gap:28px;">
      <div class="logo-row">
        <img src="${LOGO_URL}" alt="Xending" />
        <span class="wordmark">xending</span>
      </div>

      <h1 style="font-size:64px;line-height:1.05;">
        ¿Listo para dejar de <span class="accent-coral">perder dinero</span> en operaciones cambiarias?
      </h1>

      <div class="divider" style="width:100px;"></div>

      <p class="subtitle" style="max-width:500px;">
        Agenda una sesión de diagnóstico gratuita.<br/>
        Sin compromiso. Con resultados reales.
      </p>

      <div style="margin-top:8px;">
        <button class="cta-btn" style="font-size:24px;padding:22px 44px;">
          Habla con un especialista hoy →
        </button>
      </div>
    </div>

    <!-- Right: Contact card -->
    <div style="flex:0.7;">
      <div class="card" style="display:flex;flex-direction:column;gap:20px;padding:40px;">
        <span style="font-family:'Inter',sans-serif;font-weight:700;font-size:20px;color:#0F1419;letter-spacing:2px;">XENDING GLOBAL</span>
        <div class="divider"></div>
        <div style="display:flex;flex-direction:column;gap:14px;">
          <div>
            <span style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Web</span>
            <p style="font-size:17px;color:#0F1419;margin-top:4px;">www.xendinglobal.com</p>
          </div>
          <div>
            <span style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Email</span>
            <p style="font-size:17px;color:#0F1419;margin-top:4px;">contacto@xendinglobal.com</p>
          </div>
          <div>
            <span style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Tel</span>
            <p style="font-size:17px;color:#0F1419;margin-top:4px;">81 1244 1623</p>
          </div>
        </div>
        <div class="divider"></div>
        <div>
          <span style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Servicios</span>
          <p style="font-size:17px;color:#1FB8AC;font-weight:600;margin-top:4px;">FX · Pagos · Coberturas · Financiamiento</p>
        </div>
        <div>
          <span style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Experiencia</span>
          <p style="font-size:17px;color:#0F1419;margin-top:4px;">15+ años en mercados de divisas</p>
        </div>
      </div>
    </div>
  </div>
`);

// ─── EXPORTS ─────────────────────────────────────────────────────────────────

export const PRESENTATION_TEMPLATES: PresentationSlide[] = [
  { title: 'Portada', html: slide01_cover_v8 },
  { title: 'Servicios (Grid Hero)', html: slide03_services_v2 },
  { title: 'Diferenciadores', html: slide04_differentiators_v1 },
  { title: 'Coberturas', html: slide05_hedging_v1 },
  { title: 'Xending Capital', html: slide06_capital_v1 },
  { title: 'Contacto', html: slide07_closing_v1 },
  { title: 'Portada (Original)', html: slide01_cover },
  { title: 'Portada (Navy)', html: slide01_cover_v2 },
  { title: 'Portada (Orb Marca)', html: slide01_cover_v3 },
  { title: 'Portada (Rayo Diagonal)', html: slide01_cover_v4 },
  { title: 'Portada (Glass Card)', html: slide01_cover_v5 },
  { title: 'Portada (Orb Halo Dark)', html: slide01_cover_v6 },
  { title: 'Portada (Orb Halo Light)', html: slide01_cover_v7 },
  { title: 'Portada (Halo Portal)', html: slide01_cover_v9 },
  { title: 'Portada (Navy Foto Halo)', html: slide01_cover_v10 },
  { title: 'Portada (Aliado Fusion)', html: slide01_cover_v11 },
  { title: 'Portada (Aliado Orb Envolvente)', html: slide01_cover_v12 },
  { title: 'El Problema', html: slide02_problem },
  { title: 'La Solución', html: slide03_solution },
  { title: 'Experiencia', html: slide04_experience },
  { title: 'Servicios', html: slide05_services },
  { title: 'Xending Capital', html: slide06_capital },
  { title: 'Comparativa', html: slide07_comparison },
  { title: 'Plataforma', html: slide08_technology },
  { title: '¿Te identificas?', html: slide09_situations },
  { title: 'Proceso', html: slide10_process },
  { title: 'Contacto', html: slide11_cta },
];

/**
 * Returns the full standalone HTML for the complete presentation
 * with keyboard navigation built in.
 */
export function getPresentationHtml(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Xending Global — Pitch Comercial</title>
  ${BASE_STYLES}
  <style>
    body {
      margin: 0;
      background: #F5F3F0;
      overflow: hidden;
    }
    .slide {
      position: absolute;
      top: 50%;
      left: 50%;
    }
    .slide-wrapper {
      display: none;
    }
    .slide-wrapper.active {
      display: block;
    }
    .nav-hint {
      position: fixed;
      bottom: 20px;
      right: 20px;
      color: rgba(0,0,0,0.3);
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      z-index: 100;
    }
    .slide-counter {
      position: fixed;
      bottom: 20px;
      left: 20px;
      color: rgba(0,0,0,0.4);
      font-family: 'JetBrains Mono', monospace;
      font-size: 16px;
      z-index: 100;
    }
  </style>
</head>
<body>
  ${PRESENTATION_TEMPLATES.map((s, i) => `<div class="slide-wrapper${i === 0 ? ' active' : ''}" data-slide="${i}"><div class="slide"><div class="bg-mesh"></div><div class="grain"></div><div class="slide-card">${extractContent(s.html)}</div></div></div>`).join('\n  ')}

  <div class="slide-counter"><span id="current">1</span> / ${PRESENTATION_TEMPLATES.length}</div>
  <div class="nav-hint">← → para navegar · ESC para salir</div>

  <script>
    (function() {
      var slides = document.querySelectorAll('.slide-wrapper');
      var current = 0;
      var total = slides.length;

      function show(idx) {
        slides[current].classList.remove('active');
        current = Math.max(0, Math.min(idx, total - 1));
        slides[current].classList.add('active');
        document.getElementById('current').textContent = current + 1;
        resize();
      }

      function resize() {
        var w = window.innerWidth;
        var h = window.innerHeight;
        var scale = Math.min(w / 1920, h / 1080);
        document.querySelectorAll('.slide').forEach(function(s) {
          s.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
          s.style.transformOrigin = 'center center';
        });
      }

      window.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); show(current + 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); show(current - 1); }
      });

      window.addEventListener('resize', resize);
      resize();
    })();
  </script>
</body>
</html>`;
}

/** Extract inner content from a full HTML slide string */
function extractContent(fullHtml: string): string {
  const match = fullHtml.match(/<div class="slide-card">([\s\S]*?)<\/div><\/div><\/body>/);
  return match ? match[1] : '';
}
