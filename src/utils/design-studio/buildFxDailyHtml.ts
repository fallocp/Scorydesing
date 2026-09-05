/**
 * Compositor HTML del Daily Report FX (v5 — base de Presentaciones).
 *
 * El layout es la BASE que el usuario diseñó en Presentaciones (carta vertical
 * 1920×2485): header + hero (texto izquierda / imagen a sangre arriba-derecha),
 * PULSO DE MERCADO (3 stats), LO QUE MUEVE AL MERCADO (3 split-cards) y una fila
 * de 4 cards (Lectura Clave, Escenario Central, Escenarios, En la Mira) + nota.
 *
 * La imagen AI (heroImageUrl) es SOLO el hero. Todo el texto editorial se inyecta
 * desde `report` (editable/re-horneable). Los slots de icono se rellenan con el
 * KIT si existe; si no, quedan vacíos (se generan aparte con "Generar faltantes").
 *
 * Una sola fuente para preview y export (render server).
 */

import type {
  FxDailyReport,
  FxScenario,
} from '../../../supabase/functions/_shared/fx-daily/fx-daily-types';
import { FX_MIRA_CATEGORY_OBJECT, type FxKitObjectId } from './fxDailyKit';

// Paleta de la base (misma que el diseño en Presentaciones).
const MINT = '#2ED4C7';
const CORAL = '#FF7A4A';
const NAVY_TITLE = '#081B57';
const GRAY = '#6B7280';
const BLUE = '#1187c7'; // acento de secciones/meta en la base

// Orbe de marca Xending (solo el ícono). URL firmada del bucket Brand.
const XENDING_LOGO_URL =
  'https://gdfhytvjnzdovjfovqfv.supabase.co/storage/v1/object/sign/Brand/Xending%20bola%20logoabril26.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8zNDdhNjgwZi1hZGU3LTQ3OGYtYjdkNy1kMGY5YzJjMDc4NDEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJCcmFuZC9YZW5kaW5nIGJvbGEgbG9nb2FicmlsMjYucG5nIiwiaWF0IjoxNzc3MTU1Nzg2LCJleHAiOjE4MDg2OTE3ODZ9.8ZrGD1_TGdtzJn5lSP3X3pvlqvFV-mfgwxLySRQUO3U';

export type FxKitUrls = Partial<Record<FxKitObjectId, string>>;

export interface FxDailyHtmlInput {
  report: FxDailyReport;
  heroImageUrl: string;
  kit: FxKitUrls;
  /** Orbe de marca (solo ícono). Por defecto el logo Xending. */
  logoUrl?: string;
  width?: number;
  height?: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function driverKitId(title: string): FxKitObjectId {
  const t = title.toUpperCase();
  if (/MÉX|MEX/.test(t)) return 'flag_mx';
  if (/EE|US|U\.S|ESTADOS/.test(t)) return 'flag_us';
  return 'entorno_globe';
}

/** Imagen del kit en un slot cuadrado; si no hay url, deja el slot vacío (mantiene el espacio). */
function kitSlot(url: string | undefined, alt: string): string {
  if (url) {
    return `<img class="stat-icon" src="${url}" alt="${escapeHtml(alt)}" />`;
  }
  return '';
}

export function buildFxDailyHtml(input: FxDailyHtmlInput): string {
  const { report, heroImageUrl, kit } = input;
  const logoUrl = input.logoUrl ?? XENDING_LOGO_URL;
  const W = input.width ?? 1920;
  const H = input.height ?? 2485;

  // --- Comentario (párrafos) ---
  const summary = report.commentary
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('');

  // --- PULSO DE MERCADO (3 stats, sin iconos) ---
  const pulsoCols = [
    { label: 'APERTURA', value: report.pulso.apertura, valueSize: 58 },
    { label: 'RANGO DEL DÍA', value: report.pulso.rango_dia, valueSize: 54 },
    { label: 'TENDENCIA', value: report.pulso.tendencia, valueSize: 42 },
  ];
  const pulso = pulsoCols
    .map((c, i) => `${i > 0 ? '<div class="divider"></div>' : ''}
      <div class="col">
        <div class="stat-line"></div>
        <div class="label" style="color:${NAVY_TITLE};font-size:19px;margin-top:0;">${escapeHtml(c.label)}</div>
        <div class="number" style="font-size:${c.valueSize}px;margin-top:10px;">${escapeHtml(c.value || '—')}</div>
      </div>`)
    .join('');

  // --- LO QUE MUEVE AL MERCADO (split-cards por driver) ---
  const drivers = report.drivers
    .map((d) => {
      const bullets = d.bullets
        .map((b) => b.trim())
        .filter(Boolean)
        .map((b) => `• ${escapeHtml(b)}`)
        .join('<br><br>');
      return `
      <div class="split-card">
        <div class="split-icon">${kitSlot(kit[driverKitId(d.title)], d.title)}</div>
        <div class="split-body">
          <h3>${escapeHtml(d.title)}</h3>
          <div class="split-text" style="margin-top:10px;">${bullets}</div>
        </div>
      </div>`;
    })
    .join('');

  // --- ESCENARIOS (mini-grid con punto de color por escenario) ---
  const dotColors = [NAVY_TITLE, MINT, CORAL];
  const escenarios = report.escenarios
    .slice(0, 4)
    .map((e: FxScenario, i) => {
      const dot = `<span style="width:22px;height:22px;border-radius:6px;background:${dotColors[i % dotColors.length]};display:inline-block;"></span>`;
      const desc = e.rango ? escapeHtml(e.rango) : '';
      return `<div class="mini-item"><div class="mini-icon">${dot}</div><div class="mini-text"><div class="mini-title">${e.pct}% ${escapeHtml(e.label)}</div>${desc ? `<div class="mini-desc">${desc}</div>` : ''}</div></div>`;
    })
    .join('');

  // --- EN LA MIRA (mini genérico por categoría; fallback punto turquesa) ---
  const enLaMira = report.en_la_mira
    .map((item) => {
      const url = kit[FX_MIRA_CATEGORY_OBJECT[item.category]];
      const icon = url
        ? `<img src="${url}" alt="" style="width:36px;height:36px;object-fit:contain;" />`
        : `<span style="width:12px;height:12px;border-radius:50%;background:${MINT};display:inline-block;"></span>`;
      return `<div class="mini-item"><div class="mini-icon">${icon}</div><div class="mini-text"><div class="mini-title">${escapeHtml(item.label)}</div></div></div>`;
    })
    .join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Poppins:wght@400;500;600;700&family=Fraunces:wght@400;600&display=swap" rel="stylesheet" />
<style>
:root{--mint:${MINT};--coral:${CORAL};--navy:#0F1419;--navy-title:${NAVY_TITLE};--gray:${GRAY};}
*{margin:0;padding:0;box-sizing:border-box;}
body{margin:0;overflow:hidden;background:#ffffff;}
.slide{width:${W}px;height:${H}px;position:relative;overflow:hidden;font-family:'Poppins',sans-serif;background:linear-gradient(180deg,#ffffff 0%,#fbfcfd 100%);transform-origin:top left;padding:64px 64px 54px;}
.topbar{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:26px;position:relative;z-index:3;}
.brand-block{display:flex;flex-direction:column;gap:34px;max-width:1120px;}
.eyebrow-row{display:flex;align-items:center;gap:14px;}
.eyebrow-line{width:44px;height:3px;background:var(--coral);border-radius:999px;}
.eyebrow{color:var(--navy-title);font-weight:600;font-size:15px;letter-spacing:3px;text-transform:uppercase;}
.top-title-row{display:flex;align-items:center;gap:16px;}
.brand-logo{width:58px;height:58px;object-fit:contain;flex:none;}
.top-title{font-family:'Montserrat',sans-serif;font-weight:700;font-size:31px;line-height:1;color:var(--navy-title);letter-spacing:-0.5px;text-transform:uppercase;}
.top-title-line{width:60px;height:3px;background:var(--coral);border-radius:999px;}
.meta{display:flex;align-items:center;gap:18px;margin-top:4px;}
.meta-date,.meta-pair{font-weight:500;color:var(--navy-title);letter-spacing:0.2px;}
.meta-date{font-size:30px;font-weight:700;letter-spacing:0.4px;}
.meta-pair{font-size:16px;color:${BLUE};}
.meta-divider{width:1px;height:34px;background:rgba(8,27,87,0.18);}
.hero-region{position:relative;min-height:1010px;margin-top:-6px;}
.hero-photo{position:absolute;top:-64px;right:-64px;width:1040px;height:1120px;object-fit:cover;z-index:0;-webkit-mask-image:radial-gradient(135% 118% at 100% 0%,#000 56%,rgba(0,0,0,0) 100%);mask-image:radial-gradient(135% 118% at 100% 0%,#000 56%,rgba(0,0,0,0) 100%);}
.hero-copy{position:relative;z-index:2;max-width:820px;padding-top:26px;}
.hero-eyebrow{display:flex;align-items:center;gap:14px;}
.hero-eyebrow .eyebrow-line{width:44px;height:3px;}
.hero-eyebrow .eyebrow{font-size:14px;letter-spacing:3px;}
.hero-title{font-family:'Montserrat',sans-serif;font-weight:700;font-size:68px;line-height:1.04;color:var(--navy-title);letter-spacing:-1px;margin-top:18px;max-width:780px;}
.hero-title .accent{font-style:italic;color:var(--navy-title);}
.hero-accent-line{width:60px;height:4px;background:var(--coral);border-radius:999px;margin:24px 0 22px;}
.hero-summary{font-weight:400;font-size:22px;line-height:1.6;color:var(--navy-title);max-width:700px;}
.hero-summary p{margin-bottom:20px;}
.section-title{display:flex;align-items:center;gap:14px;margin:26px 0 18px;}
.section-title .section-text{font-family:'Montserrat',sans-serif;font-weight:700;font-size:26px;line-height:1;color:var(--navy-title);letter-spacing:-0.4px;text-transform:uppercase;}
.section-title .section-line{width:62px;height:2px;background:rgba(8,27,87,0.18);border-radius:999px;}
.cols{display:flex;align-items:stretch;justify-content:center;}
.col{flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;padding:0 28px;}
.divider{width:1px;background:rgba(8,27,87,0.12);align-self:center;height:150px;}
.stat-line{width:60px;height:4px;background:var(--coral);border-radius:999px;margin:30px 0 22px;}
.number{font-family:'Montserrat',sans-serif;font-weight:700;font-size:88px;line-height:1;color:var(--navy-title);}
.number.same-day{font-style:italic;font-weight:500;font-size:72px;}
.label{font-weight:600;font-size:24px;line-height:1.4;color:var(--navy-title);margin-top:16px;}
.icon-slot{width:124px;height:124px;align-self:center;margin:4px 0 8px;display:flex;align-items:center;justify-content:center;}
.stat-icon{width:100%;height:100%;object-fit:contain;}
.split-row{display:flex;gap:28px;align-items:stretch;}
.split-card{flex:1;background:#fff;border:1px solid rgba(8,27,87,0.06);border-radius:26px;box-shadow:0 20px 55px rgba(15,20,25,0.06);padding:28px 28px;display:flex;align-items:flex-start;gap:22px;min-height:288px;}
.split-icon{flex:none;width:110px;height:110px;display:flex;align-items:center;justify-content:center;}
.split-icon img{width:100%;height:100%;object-fit:contain;}
.split-body{flex:1;min-width:0;}
.split-card h3{font-family:'Montserrat',sans-serif;font-weight:700;font-size:26px;line-height:1.1;color:var(--navy-title);}
.split-text{font-weight:500;font-size:17px;line-height:1.55;color:var(--navy-title);margin-top:10px;}
.cards{display:flex;gap:28px;align-items:stretch;}
.card{flex:1;background:#fff;border:1px solid rgba(8,27,87,0.06);border-radius:26px;padding:28px 24px;box-shadow:0 20px 55px rgba(15,20,25,0.06);display:flex;flex-direction:column;min-height:320px;}
.card .icon-slot{width:112px;height:112px;}
.card-body{font-weight:500;font-size:17px;line-height:1.55;color:var(--navy-title);margin-top:8px;}
.mini-label{font-weight:700;font-size:17px;letter-spacing:3px;text-transform:uppercase;color:var(--navy-title);text-align:center;}
.mini-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px 24px;margin-top:22px;}
.mini-item{display:flex;align-items:center;gap:16px;}
.mini-icon{flex:none;width:60px;height:60px;border-radius:14px;background:#fff;border:1px solid rgba(8,27,87,0.06);box-shadow:0 8px 22px rgba(15,20,25,0.05);display:flex;align-items:center;justify-content:center;}
.mini-title{font-weight:600;font-size:23px;line-height:1.25;color:var(--navy-title);}
.mini-desc{font-weight:400;font-size:17px;line-height:1.4;color:var(--navy-title);margin-top:4px;}
.footer-note{font-family:'Fraunces',serif;font-size:12px;line-height:1.45;color:#6f7580;margin-top:18px;}
</style>
<script>(function(){function resize(){var s=document.querySelector('.slide');if(!s)return;var w=document.documentElement.clientWidth||window.innerWidth;var h=document.documentElement.clientHeight||window.innerHeight;s.style.transform='scale('+Math.min(w/${W},h/${H})+')';}window.addEventListener('resize',resize);resize();setTimeout(resize,50);setTimeout(resize,200);})();</script>
</head><body style="margin:0;overflow:hidden;background:#ffffff;width:100%;height:100vh;"><div class="slide">
  <div class="hero-region">
    <img class="hero-photo" src="${heroImageUrl}" alt="" />
    <div class="topbar">
      <div class="brand-block">
        <div class="top-title-row"><img class="brand-logo" src="${logoUrl}" alt="Xending" /><div class="top-title">XENDING</div><div class="top-title-line"></div></div>
        <div class="eyebrow-row"><span class="eyebrow-line"></span><span class="eyebrow">Daily FX</span></div>
      </div>
      <div class="meta">
        <div class="meta-date">${escapeHtml(report.date)}</div>
        <div class="meta-divider"></div>
        <div class="meta-pair">${escapeHtml(report.pair)}</div>
      </div>
    </div>
    <div class="hero-copy">
      <h1 class="hero-title">${escapeHtml(report.headline)}</h1>
      <div class="hero-accent-line"></div>
      <div class="hero-summary">${summary}</div>
    </div>
  </div>
  <div class="section-title" style="margin-top:4px;"><div class="section-text">PULSO DE MERCADO</div><div class="section-line"></div></div>
  <div class="cols">${pulso}</div>
  <div class="section-title"><div class="section-text">LO QUE MUEVE AL MERCADO</div><div class="section-line" style="flex:1;"></div></div>
  <div class="split-row">${drivers}</div>
  <div class="cards" style="margin-top:16px;">
    <div class="card">
      <div class="mini-label">LECTURA CLAVE</div>
      <div class="icon-slot" style="margin-top:18px;">${kitSlot(kit.magnifier, 'Lectura clave')}</div>
      <div class="card-body" style="text-align:left;margin-top:8px;">${escapeHtml(report.lectura_clave)}</div>
    </div>
    <div class="card">
      <div class="mini-label">ESCENARIOS</div>
      <div class="mini-grid" style="grid-template-columns:1fr;gap:18px;">${escenarios}</div>
    </div>
    <div class="card">
      <div class="mini-label">EN LA MIRA</div>
      <div class="mini-grid" style="grid-template-columns:1fr;gap:16px;">${enLaMira}</div>
    </div>
  </div>
  <div class="footer-note">Nota: ${escapeHtml(report.nota)}</div>
</div></body></html>`;
}
