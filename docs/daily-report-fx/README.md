# Daily Report FX — Índice

> Punto de entrada del módulo **Daily Report FX**. Pestaña independiente en Design
> Studio que convierte el análisis diario USD/MXN en una pieza editorial vertical.

Reutiliza los cables de Xending News / Studio (OpenAI, generación de imagen,
render server, storage, auth) y agrega solo lo suyo: un agente que resume el MD,
un master prompt de imagen y un compositor HTML propio.

## Arquitectura (v3 — hero + kit)

Para que el texto no se encime con los objetos, la pieza se arma en 3 capas fijas:

1. **Hero AI** — la banda superior (escritorio: monitor con la gráfica/TC + globo de
   vidrio + docs), horizontal, con zona de texto segura a la izquierda. Es lo ÚNICO
   que genera la IA por reporte.
2. **Kit de objetos** — pizarra, dial, riel, compás, banderas MX/US, globo de entorno,
   lupa, instrumento de escenario. Se generan UNA vez (fondo blanco) y se reutilizan
   en slots fijos del layout. Ver `fxDailyKit.ts` / `useFxKit.ts`.
3. **Texto HTML editable** — header, ANÁLISIS DIARIO, headline (serif navy), comentario,
   Pulso (4 valores + flecha), Lo que mueve (2–3 columnas), Lectura Clave, Escenario
   Central, Escenarios (donut + % + sesgo + rango), En la Mira, nota. Alineado a cada
   slot. Editable y re-horneable sin re-generar el hero.

## Mapa código

| Pieza | Archivo |
|-------|---------|
| Tipos (FxDailyReport) | `supabase/functions/_shared/fx-daily/fx-daily-types.ts` |
| Agente extractor (LLM) | `supabase/functions/_shared/fx-daily/fxDailyExtractor.ts` |
| Prompt del HERO (banda superior, texto-safe izquierda) | `supabase/functions/_shared/fx-daily/fxDailyImagePrompt.ts` |
| Edge function | `supabase/functions/generate-fx-daily/` |
| Kit de objetos (catálogo + rutas fijas) | `src/utils/design-studio/fxDailyKit.ts` |
| Kit: generar/administrar (una vez, reutilizable) | `src/hooks/useFxKit.ts` |
| Compositor HTML editable (hero + slots kit + texto) | `src/utils/design-studio/buildFxDailyHtml.ts` |
| Hook del reporte | `src/hooks/useFxDaily.ts` |
| Panel + pestaña | `src/components/design-studio/FxDailyPanel.tsx`, `src/pages/DesignStudioPage.tsx` |

Cables reutilizados: `generate-design-image` (mode generate), `renderHtmlToPng`,
`useSaveMockup`, storage `design-images`, `callOpenAI`, `parseModelJson`.

## Estado

| Fase | Estado |
|------|--------|
| Backend (tipos + agente + prompt + edge) | ✅ |
| Compositor HTML | ✅ (bandas en `LAYOUT`, a tunear contra generaciones reales) |
| Frontend (hook + panel + pestaña) | ✅ |
| Persistencia de ediciones FX | ⬜ v1 en memoria + mockup en Storage; tabla `fx_daily_reports` pendiente si se quiere historial |

## Pendiente para usarlo

```
supabase functions deploy generate-fx-daily
```

Y tener corriendo el render server (`renderer/` → `node scripts/render-server.js`),
porque la composición del texto se hornea con él.

## Notas

- El lienzo es vertical **1024×1536**.
- Los valores horneados sobre los objetos son decorativos y coinciden con el dato al
  generar. Si editas un dato en HTML, es el autoritativo; "Actualizar texto" re-hornea
  la capa sobre la MISMA escena (sin gastar otra generación). Para que el mini-label
  del objeto también cambie, hay que regenerar la imagen.
- La alineación texto↔objeto es aproximada; ajustar en `LAYOUT` de `buildFxDailyHtml.ts`.
