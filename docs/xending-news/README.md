# Xending News — Índice de documentación

> Punto de entrada único del módulo **Xending News**. Si buscas cualquier cosa de
> News, empieza aquí. Todo lo demás cuelga de esta carpeta.

Xending News es una **pestaña independiente dentro de Design Studio** que convierte
noticias (financieras, macro, comerciales, geopolíticas o de empresa) en un set
editorial visual premium de 5–8 piezas. Reutiliza toda la infraestructura de
Design Studio (generación de imagen, cola/preview, export PNG/PDF, storage,
auth/RLS) y agrega **solo sus cables propios** con ADN editorial. **No se mezcla
con el pipeline de carrusel comercial.**

---

## Orden de lectura

1. **[XENDING_NEWS_SPEC_v1.0.md](./XENDING_NEWS_SPEC_v1.0.md)** — especificación
   maestra. Qué es, qué NO debe hacer, formatos de entrada, motores visuales,
   arquetipos, paleta, layouts y config. **Léelo primero.**
2. Esta sección (**Mapa doc ↔ código**) — dónde vive cada cable en el repo.
3. **Estado de implementación** — en qué fase vamos.

---

## Mapa doc ↔ código (los "cables propios" de News)

Cada agente/módulo del spec tiene un lugar fijo en el repo. Los cables propios de
News viven aislados en `supabase/functions/_shared/news/` y en dos edge functions
dedicadas.

| Cable (nombre del spec)          | Sección spec | Archivo / carpeta en el repo                                   |
|----------------------------------|--------------|----------------------------------------------------------------|
| Contratos / tipos                | 7, 13, 15–18, 50 | `supabase/functions/_shared/news/news-types.ts`            |
| `xending_news_v1_style`          | 39, 40, 21–31 | `supabase/functions/_shared/news/newsStyleV1.ts`              |
| `xending_news_archetype_fx`      | 41           | `supabase/functions/_shared/news/archetypes.ts`                |
| `xending_news_archetype_bonds`   | 42           | `supabase/functions/_shared/news/archetypes.ts`                |
| `xending_news_archetype_trade_map` | 43         | `supabase/functions/_shared/news/archetypes.ts`                |
| `xending_news_archetype_executive_wrap` | 44     | `supabase/functions/_shared/news/archetypes.ts`                |
| Fallbacks (institutional / industrial / maps) | 45–47 | `supabase/functions/_shared/news/archetypes.ts`          |
| `xending_news_slide_planner` (+ input adapter, normalizer, editorial selector) | 9–13 | `supabase/functions/generate-news-plan/` |
| `xending_news_visual_resolver`   | 14–16, 50–52 | `supabase/functions/generate-news-visuals/`                    |
| `xending_news_prompt_builder`    | 48, 49       | `supabase/functions/generate-news-visuals/` (+ builder compartido) |
| Persistencia (ediciones)         | —            | Tabla `news_editions` (`supabase/migrations/20260822_create_news_editions.sql`) + hooks `src/hooks/useNewsEditions.ts` (list/load/save/discard) |
| Compositor editorial (sección 54) | 54, 55      | `src/utils/design-studio/buildNewsSlideHtml.ts` (headline + dato + fuente + fecha + Nº sobre la escena, en la text-safe area). Se **hornea al generar** cada slide (`useNewsEdition.generateSlide` → `renderHtmlToPng` del render server) y se guarda el PNG ya compuesto. Requiere `renderer/` corriendo. |
| Pestaña + panel (frontend)       | —            | `src/pages/DesignStudioPage.tsx`, `src/components/design-studio/NewsPanel.tsx`, `src/hooks/useNewsEdition.ts` |

### Cables REUTILIZADOS (no son de News, no se tocan)

| Necesidad de News          | Cable existente reutilizado                                  |
|----------------------------|--------------------------------------------------------------|
| Generar la imagen del slide | `supabase/functions/generate-design-image/` (mode `generate`) |
| Cola y preview slide-a-slide | `src/hooks/useCarouselQueue.ts`, `CarouselStoryboardPreview` |
| Export PNG / PDF           | `src/utils/design-studio/exportCarousel.ts`, `CarouselPdfComposer` |
| Storage de imágenes        | Bucket `design-images`                                        |
| OpenAI / auth / RLS / CORS | `_shared/callOpenAI.ts`, `_shared/parseModelJson.ts`, `_shared/fetchBusinessContext.ts` |

> Regla de oro: los prompts de imagen de News salen **100% de sus arquetipos +
> `newsStyleV1`**, nunca de los scene-kits comerciales
> (`sceneKitRegistry`, `copyKitRegistry`, `carouselStoryRegistry`).

---

## Estado de implementación

| Fase | Descripción | Estado |
|------|-------------|--------|
| 1 | Contratos + `xending_news_v1_style` + arquetipos (código puro, sin DB) | ✅ hecho |
| 2 | `generate-news-plan` (adapter + normalizer + editorial selector + slide planner) | ✅ hecho |
| 3 | `generate-news-visuals` (visual resolver + prompt builder) | ✅ hecho |
| 4 | Tabla `news_editions` + migración RLS (archivo listo; falta aplicar) | ✅ hecho |
| 5 | Frontend: pestaña Xending News + `NewsPanel` | ✅ hecho |
| 6 | QA visual + diversidad + ediciones especiales | 🔄 diversidad/specials hechos; QA = revisión manual (v1) |
| 7 | Estilo foto hiperrealista + editar texto/re-hornear + comentario final + lightbox | ✅ hecho (requiere redeploy de las 2 edge functions) |

Leyenda: ⬜ pendiente · 🔄 en curso · ✅ hecho

---

## Convenciones

- **Base de datos:** tablas, columnas, enums y políticas RLS siempre en inglés,
  `snake_case`. Labels de UI en español.
- **Independencia:** ningún archivo de `_shared/news/` importa nada del carrusel
  comercial. Si necesitas algo de allí, se copia con ADN de News, no se importa.
- **Versionado de estilo:** el ADN visual vive en `newsStyleV1.ts`. Un cambio de
  dirección visual crea `newsStyleV2.ts`, no edita el v1.
