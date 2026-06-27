/**
 * Ejemplos "gold standard" del sistema de diseño "Xending Light Editorial".
 *
 * Son los slides reales que ya usamos (template de 3 cajas y onboarding con
 * panel + franja de features). Se inyectan como few-shot en el system prompt de
 * generación de slides para que el modelo replique EXACTAMENTE cajas, tipografía,
 * detalles y color. Reciben la URL de fuentes y el placeholder de icono para no
 * duplicar esas constantes.
 */

export function buildSlideExamples(fontsUrl: string, iconPlaceholder: string, heroPlaceholder: string): {
  cards: string;
  onboarding: string;
  stats: string;
  heroCards: string;
} {
  const cards = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${fontsUrl}');
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
    .card h3 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 30px; line-height: 1.18; color: var(--navy-title); }
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
        <div class="icon-slot"><img class="stat-icon" src="${iconPlaceholder}#c1" alt="" /></div>
        <div class="card-line"></div>
        <h3>Título de la caja</h3>
        <div class="card-sub">Subtítulo breve y directo.</div>
        <div class="card-body">Texto descriptivo de apoyo para explicar el beneficio o la idea principal de esta caja.</div>
      </div>
      <div class="card">
        <div class="icon-slot"><img class="stat-icon" src="${iconPlaceholder}#c2" alt="" /></div>
        <div class="card-line"></div>
        <h3>Título de la caja</h3>
        <div class="card-sub">Subtítulo breve y directo.</div>
        <div class="card-body">Texto descriptivo de apoyo para explicar el beneficio o la idea principal de esta caja.</div>
        <div class="pill">✓ Etiqueta destacada</div>
      </div>
      <div class="card">
        <div class="icon-slot"><img class="stat-icon" src="${iconPlaceholder}#c3" alt="" /></div>
        <div class="card-line"></div>
        <h3>Título de la caja</h3>
        <div class="card-sub">Subtítulo breve y directo.</div>
        <div class="card-body">Texto descriptivo de apoyo con un <span class="hl">término resaltado</span> dentro del contenido.</div>
      </div>
    </div>
  </div>
</body>
</html>`;

  const onboarding = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${fontsUrl}');
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
    .topbar { position: absolute; left: 0; top: 0; width: 100%; height: 8px; background: var(--navy-title); }
    .top { display: flex; gap: 70px; flex: 1; align-items: stretch; }
    .left { flex: 0.92; display: flex; flex-direction: column; justify-content: center; max-width: 720px; }
    .eyebrow-row { display: flex; align-items: center; gap: 14px; }
    .eyebrow-line { width: 44px; height: 3px; background: var(--coral); border-radius: 999px; }
    .eyebrow { color: var(--coral); font-weight: 600; font-size: 15px; letter-spacing: 3px; text-transform: uppercase; }
    h1 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 84px; line-height: 1.02; color: var(--navy-title); margin-top: 24px; letter-spacing: -1px; }
    h1 .accent { display: block; font-style: italic; background: linear-gradient(135deg, #FF7A4A, #FF9468); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .accent-line { width: 60px; height: 4px; background: var(--coral); border-radius: 999px; margin: 32px 0 28px; }
    .subtitle { font-family: 'Poppins', sans-serif; font-weight: 400; font-size: 22px; line-height: 1.6; color: #1a2a62; max-width: 540px; }
    .panel { flex: 1.22; align-self: center; background: #ffffff; border: 1px solid rgba(8,27,87,0.06); border-radius: 30px; box-shadow: 0 24px 60px rgba(15,20,25,0.06); padding: 50px 56px; display: flex; align-items: center; gap: 48px; }
    .hero-slot { width: 330px; height: 330px; flex: none; display: flex; align-items: center; justify-content: center; }
    .hero-slot img { width: 100%; height: 100%; object-fit: contain; }
    .checklist { flex: 1; display: flex; flex-direction: column; gap: 30px; }
    .check-item { display: flex; align-items: flex-start; gap: 16px; }
    .check-mark { flex: none; width: 30px; height: 30px; border-radius: 50%; border: 2px solid var(--coral); display: flex; align-items: center; justify-content: center; color: var(--coral); font-size: 15px; font-weight: 700; margin-top: 2px; }
    .check-text { font-family: 'Poppins', sans-serif; font-weight: 500; font-size: 21px; line-height: 1.4; color: var(--navy-title); }
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
      <div class="left">
        <div class="eyebrow-row"><span class="eyebrow-line"></span><span class="eyebrow">Por qué Xending</span></div>
        <h1>Onboarding <span class="accent">empresarial con IA</span></h1>
        <div class="accent-line"></div>
        <p class="subtitle">Alta digital, validación documental y cumplimiento operativo para empezar a operar con mayor rapidez.</p>
      </div>
      <div class="panel">
        <div class="hero-slot"><img src="${iconPlaceholder}#hero" alt="" /></div>
        <div class="checklist">
          <div class="check-item"><span class="check-mark">✓</span><span class="check-text">Validación digital de empresa y representantes.</span></div>
          <div class="check-item"><span class="check-mark">✓</span><span class="check-text">Procesos seguros, auditables y alineados a estándares globales.</span></div>
          <div class="check-item"><span class="check-mark">✓</span><span class="check-text">Monitoreo preventivo de riesgos operativos.</span></div>
          <div class="check-item"><span class="check-mark">✓</span><span class="check-text">Menos fricción, más velocidad de activación.</span></div>
        </div>
      </div>
    </div>
    <div class="strip">
      <div class="feat"><div class="feat-icon"><img src="${iconPlaceholder}#b1" alt="" /></div><div><div class="feat-title">Seguridad institucional</div><div class="feat-body">Protección avanzada para tus operaciones y datos.</div></div></div>
      <div class="strip-divider"></div>
      <div class="feat"><div class="feat-icon"><img src="${iconPlaceholder}#b2" alt="" /></div><div><div class="feat-title">Eficiencia operativa</div><div class="feat-body">Menos procesos manuales, más tiempo para crecer.</div></div></div>
      <div class="strip-divider"></div>
      <div class="feat"><div class="feat-icon"><img src="${iconPlaceholder}#b3" alt="" /></div><div><div class="feat-title">Tecnología global</div><div class="feat-body">Infraestructura robusta, escalable y segura.</div></div></div>
      <div class="strip-divider"></div>
      <div class="feat"><div class="feat-icon"><img src="${iconPlaceholder}#b4" alt="" /></div><div><div class="feat-title">Cumplimiento inteligente</div><div class="feat-body">Procesos claros, auditables y sin complicaciones.</div></div></div>
    </div>
  </div>
</body>
</html>`;

  const stats = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${fontsUrl}');
    :root { --mint: #2ED4C7; --coral: #FF7A4A; --navy: #0F1419; --navy-title: #081B57; --gray: #6B7280; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #ffffff; }

    .slide {
      width: 1920px; height: 1080px; position: relative; overflow: hidden;
      font-family: 'Poppins', sans-serif;
      background: linear-gradient(180deg, #ffffff 0%, #fbfcfd 100%);
      transform-origin: top left;
      display: flex; flex-direction: column; align-items: center; padding: 90px 120px 80px;
    }
    .header { text-align: center; }
    h1 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 104px; line-height: 1; color: var(--navy-title); letter-spacing: -1px; }
    h1 .accent { font-style: italic; font-weight: 600; background: linear-gradient(135deg, #FF7A4A, #FF9468); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .title-line { width: 72px; height: 4px; background: var(--coral); border-radius: 999px; margin: 28px auto 30px; }
    .subtitle { font-family: 'Poppins', sans-serif; font-weight: 500; font-size: 30px; line-height: 1.5; color: #1a2a62; max-width: 900px; margin: 0 auto; }
    .cols { display: flex; align-items: stretch; justify-content: center; gap: 0; width: 100%; margin-top: 70px; flex: 1; }
    .col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; text-align: center; padding: 0 40px; }
    .divider { width: 1px; background: rgba(8,27,87,0.12); align-self: center; height: 420px; }
    .icon-slot { width: 300px; height: 300px; display: flex; align-items: center; justify-content: center; }
    .stat-icon { width: 100%; height: 100%; object-fit: contain; }
    .stat-line { width: 60px; height: 4px; background: var(--coral); border-radius: 999px; margin: 30px 0 22px; }
    .number { font-family: 'Fraunces', serif; font-weight: 600; font-size: 88px; line-height: 1; color: var(--navy-title); }
    .number.same-day { font-style: italic; font-weight: 500; font-size: 72px; }
    .label { font-family: 'Poppins', sans-serif; font-weight: 500; font-size: 24px; line-height: 1.4; color: var(--gray); margin-top: 16px; }
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
        <div class="icon-slot"><img class="stat-icon" src="${iconPlaceholder}#i1" alt="" /></div>
        <div class="stat-line"></div>
        <div class="number">30+</div>
        <div class="label">años de experiencia<br/>en el mercado fx</div>
      </div>
      <div class="divider"></div>
      <div class="col">
        <div class="icon-slot"><img class="stat-icon" src="${iconPlaceholder}#i2" alt="" /></div>
        <div class="stat-line"></div>
        <div class="number">130+</div>
        <div class="label">divisas<br/>disponibles</div>
      </div>
      <div class="divider"></div>
      <div class="col">
        <div class="icon-slot"><img class="stat-icon" src="${iconPlaceholder}#i3" alt="" /></div>
        <div class="stat-line"></div>
        <div class="number same-day">Same Day</div>
        <div class="label">pagos a asia<br/>en el mismo día</div>
      </div>
    </div>
  </div>
</body>
</html>`;

  const heroCards = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    @import url('${fontsUrl}');
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
    .left { flex: 0.92; display: flex; flex-direction: column; position: relative; z-index: 2; }
    .eyebrow-row { display: flex; align-items: center; gap: 14px; }
    .eyebrow-line { width: 44px; height: 3px; background: var(--coral); border-radius: 999px; }
    .eyebrow { color: var(--coral); font-weight: 600; font-size: 15px; letter-spacing: 3px; text-transform: uppercase; }
    h1 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 76px; line-height: 1.05; color: var(--navy-title); margin-top: 24px; letter-spacing: -1px; }
    h1 .accent { font-style: italic; background: linear-gradient(135deg, #FF7A4A, #FF9468); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .subtitle { font-family: 'Poppins', sans-serif; font-weight: 500; font-size: 22px; line-height: 1.55; color: #1a2a62; margin-top: 26px; max-width: 560px; }
    .hero {
      position: absolute; left: 0; top: 0; width: 100%; height: 100%;
      background-size: 92% auto; background-position: left bottom; background-repeat: no-repeat;
      z-index: 0; pointer-events: none;
      -webkit-mask-image: radial-gradient(ellipse 60% 60% at 22% 82%, #000 34%, rgba(0,0,0,0) 74%);
              mask-image: radial-gradient(ellipse 60% 60% at 22% 82%, #000 34%, rgba(0,0,0,0) 74%);
      -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
    }
    .cards { flex: 1.18; display: flex; gap: 28px; align-items: flex-start; margin-top: 40px; position: relative; z-index: 2; }
    .card { flex: 1; height: 810px; background: #ffffff; border: 1px solid rgba(8,27,87,0.06); border-radius: 26px; padding: 40px 34px; box-shadow: 0 20px 55px rgba(15,20,25,0.06); display: flex; flex-direction: column; }
    .icon-slot { width: 190px; height: 190px; align-self: center; margin: 6px 0 10px; }
    .stat-icon { width: 100%; height: 100%; object-fit: contain; }
    .card-line { width: 52px; height: 3px; background: var(--coral); border-radius: 999px; margin: 30px 0 20px; }
    .card h3 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 30px; line-height: 1.18; color: var(--navy-title); }
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
    <div class="hero" style="background-image:url('${heroPlaceholder}');"></div>
    <div class="left">
      <div class="eyebrow-row"><span class="eyebrow-line"></span><span class="eyebrow">Por qué Xending</span></div>
      <h1>Tu mejor opción para operar <span class="accent">globalmente</span></h1>
      <p class="subtitle">Centraliza tus pagos, divisas y onboarding empresarial en una plataforma diseñada para empresas que operan globalmente con velocidad, cumplimiento y atención experta.</p>
    </div>
    <div class="cards">
      <div class="card">
        <div class="icon-slot"><img class="stat-icon" src="${iconPlaceholder}#c1" alt="" /></div>
        <div class="card-line"></div>
        <h3>Velocidad operativa</h3>
        <div class="card-sub">Sin fricciones, rápido y sencillo.</div>
        <div class="card-body">Procesos digitales para cotizar, validar y ejecutar operaciones con mayor agilidad.</div>
      </div>
      <div class="card">
        <div class="icon-slot"><img class="stat-icon" src="${iconPlaceholder}#c2" alt="" /></div>
        <div class="card-line"></div>
        <h3>Pagos a China el mismo día</h3>
        <div class="card-sub">Conexión directa para pagos internacionales.</div>
        <div class="card-body">Pagos a proveedores con seguimiento operativo, soporte especializado y mayor visibilidad en cada transferencia.</div>
        <div class="pill">✓ Rápido, seguro y trazable</div>
      </div>
      <div class="card">
        <div class="icon-slot"><img class="stat-icon" src="${iconPlaceholder}#c3" alt="" /></div>
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

  return { cards, onboarding, stats, heroCards };
}