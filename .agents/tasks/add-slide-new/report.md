# «Agregar slide» con el sistema de la presentación

Rama `feat/own-local-supabase` sobre `f85ceb2`. Sin commit, push, despliegue ni migración. Solo hay cambios de cliente.

## Cambios por archivo

- `src/lib/presentations/addSlide.ts` (nuevo):
  - Interruptor `isAddSlideNewEnabled` y placeholder `NEW_SLIDE_PROMPT`.
  - `blankSlideHtml`: lienzo del deck, fondo del sistema y logo opcional, con valores escapados.
  - `insertSlideAfter` y `newSlideDesignTarget` (pantalla o popup).
  - `deckSystemFor`: el sistema sale solo de `negocio:presentación`.
  - `measureDeckLogo` / `measureLogoIn`: logo medido.
  - `adaptTemplate`: llama a `syntheticSourceSheet` y `runStyleTransfer` (que corre `checkTransfer`), y verifica que el texto y el lienzo no cambien.
  - «Usar plantilla tal cual» se recuerda en localStorage con la clave `scory-add-slide-template-as-is`.
- `src/components/presentations/AddSlideMenu.tsx` (nuevo): menú `role="menu"` con «Nueva con IA», «En blanco», un separador, la casilla `menuitemcheckbox` «Usar plantilla tal cual» y las plantillas. Se navega con flechas, Home/End y Escape (el foco vuelve al botón). Muestra un estado «Preparando…» con `aria-busy`.
- `src/pages/PresentationsPage.tsx`:
  - `handleAddSlide` para las tres opciones. Inserta después de la diapositiva actual, identificada por id. Si cambió el proyecto mientras medía, no inserta.
  - «Nueva con IA» abre la pantalla de diseño en la diapositiva nueva, o el popup si la pantalla está apagada.
  - Con el interruptor apagado se muestra el menú anterior sin tocar.
  - Pasa `emptyPrompt` al espacio de diseño cuando la diapositiva está vacía.
- `src/components/presentations/UnifiedDesignWorkspace.tsx`: prop `emptyPrompt`. Es el placeholder del chat mientras no haya mensajes.
- `src/lib/presentations/styleSpec.ts`: ahora se exporta `measureInFrame`, para medir el logo con el mismo iframe aislado.
- Tests nuevos: `__tests__/addSlide.test.ts`, `__tests__/addSlide.browser.test.ts` y un caso nuevo en `UnifiedDesignWorkspace.test.ts`.
- QA: `artifacts/add-slide-qa/capture.mjs`.

## Decisiones

- **Al cerrar sin generar, la diapositiva vacía se queda.** Se puede borrar con «Eliminar». Descartarla al salir obligaría a rastrear la salida en la pantalla y en el popup, y podría borrar algo que el usuario quería conservar.
- **Base de «Nueva con IA».** La lógica que ya existía basta: una diapositiva sin texto arranca con «Estilo de la presentación» (`deck`) si hay diapositivas con contenido, y con «Referencias y marca» (`new`) si no las hay. Nunca arranca con `current`.
  - El arquetipo sin repetir a la vecina lo pone `deckTurnFor` (base `deck`) cuando `VITE_DESAING_DECK_SYSTEM` está encendido.
  - Que no invente texto depende del contrato de copy literal que ya existe (el plan pregunta si falta). No agregué instrucciones nuevas al servidor.
- **Contenido de cada opción.** «Nueva con IA» lleva el fondo del sistema y no lleva logo, porque la IA rehace toda la diapositiva. «En blanco» lleva fondo y logo.
- **Cuándo cuenta un logo.** Es una `<img>` que se llama «logo», «marca» o «brand», o que se repite pequeña cerca de un borde. Tiene que aparecer en 2 o más diapositivas, o en al menos el 40 %. Se coloca en la posición mediana medida. Si solo hay una diapositiva con logo, no se pone.
- **Cuándo hay sistema.** Hacen falta 2 o más diapositivas con contenido y `VITE_DESAING_DECK_SYSTEM` encendido.
  - Las plantillas se adaptan solo con la pieza `_TOKENS` encendida.
  - Los tokens por acomodo se usan solo con `_ARQUETIPO`. Siguen la misma regla que el generador: una portada, sección o cierre solos conservan su fondo y sus tamaños.
- **Cuándo una plantilla se inserta tal cual.** La plantilla se inserta original, con un aviso que explica por qué, en estos casos:
  - el lienzo es distinto (por ejemplo, «Portada (Aliado Mapa)» es de 1600×900);
  - no hubo puntos que comparar;
  - adaptar cambiaría el texto o el tamaño;
  - falló la medición.
- **Nombres de las diapositivas nuevas.** «Nueva diapositiva» y «En blanco».
- **Medición repetida.** La medición usa la clave `negocio:presentación:nombre del negocio`. La pantalla de diseño usa otra clave, así que puede volver a medir una vez (son menos de 0.5 s con 4 diapositivas).
- **Sin tocar:** las URLs firmadas de `presentationTemplates_v2.ts`, el servidor y las migraciones.

## Verificación

- **Tests de archivos tocados:** 5 archivos y 44 tests en verde. Tras corregir un tipo, repetí los 2 nuevos: 7/7.
  - Lo que cubren: diapositiva vacía válida e insertada en la posición correcta; «Nueva con IA» abre la pantalla o el popup y empieza con una base que no es `current`, con su placeholder; plantilla adaptada con `failed = []` y el mismo texto; logo medido en 120,50 de 160×40; «tal cual» sin medir ni cambiar nada; interruptor apagado.
- **`npm test`:** 3942 ok y 12 fallidos, que son los 12 conocidos de piloto/presupuesto.
  - También fallaron a nivel de archivo el legacy demo-v1, `designElementTools` y `designCanvasEditing.browser`, que fallan bajo carga. Los dos últimos pasan solos (11/11).
- **`npm run type-check`:** ok.
- **`npm run lint`:** 13 errores, la línea base. Los 2 de `UnifiedDesignWorkspace.test.ts` están en líneas que ya existían.
- No usé `deno` porque no toqué `supabase/`. No hay logs temporales.
- **Capturas** en `artifacts/add-slide-qa/` (las revisé). El deck son las fixtures: portada (con el logo agregado), slide 2, slide 3 y fotos + pasos.
  - `template-1-before.png` y `template-1-after.png` («Plantilla · 3 Cajas»): queda fondo crema #F5F3F0, encabezados navy en mayúsculas con tracking como la slide 2, texto gris y radio de 24. El texto es idéntico: 81 puntos, 8 corregidos, 0 fallidos.
  - `template-2-before.png` y `template-2-after.png` («Servicios (Grid Hero)»): 172 puntos, 25 corregidos, 0 fallidos.
  - `deck-slide-2.png` sirve de referencia.
  - `blank.png` (crema con el logo arriba a la izquierda) y `new-with-ai-empty.png`.
  - `results.json`: 31 de 32 plantillas quedaron adaptadas, con 0 fallidos y el texto igual. Cada una tarda de 100 a 210 ms, y el sistema 390 ms.

## Pendientes (notas, no bloquean)

- **Líneas de tarjeta.** En «3 Cajas» solo la primera línea toma el turquesa del deck; las otras dos siguen coral. `runStyleTransfer` empareja una sola línea del sistema. Es comportamiento de la transferencia y no lo cambié.
- **Roles mal leídos.** En «Servicios (Grid Hero)», «1D» toma el estilo de encabezado de tarjeta y «Pagos Internacionales» queda pequeño. La heurística de roles no los clasifica bien.
- **Acentos propios.** Los acentos de la plantilla ceden al patrón del deck (decisión 7 de style-transfer). Por ejemplo, «término resaltado» pierde su turquesa.
- **Imágenes de las plantillas.** En las capturas no cargan, porque la QA no sale a storage.
- **Copy literal.** Falta probar con IA real que «Nueva con IA» respeta el copy literal. No usé APIs pagadas.

## Despliegue

No hay nada que desplegar en el servidor. Solo hace falta un rebuild del front.

## Cómo encender

`VITE_DESAING_ADD_SLIDE_NEW=true`. La adaptación, el fondo y el logo necesitan además `VITE_DESAING_DECK_SYSTEM=true`; sin él se insertan tal cual, con aviso. La pantalla completa se enciende con `VITE_DESAING_DESIGN_SCREEN=true`; si no, se usa el popup.

## Prueba real en «Xending Capital 2 test»

1. Ponte en la diapositiva 2, abre «Agregar slide» y elige «Servicios (Grid Hero)». Debe insertarse como la 3, con el aviso «Adapté la plantilla al estilo de tu presentación (N puntos).». Revisa que fuentes, colores, tarjetas y fondo sean los del deck y que el texto no cambie.
2. Marca «Usar plantilla tal cual» y vuelve a insertar: debe quedar la original. Recarga la página: la casilla sigue marcada.
3. Elige «En blanco»: debe salir el fondo del deck y el logo donde lo usan las demás diapositivas, sin texto.
4. Elige «Nueva con IA»: se abre el diseño en la diapositiva nueva, con el chat enfocado y el placeholder «¿Qué va en esta diapositiva?…». La base debe ser «Estilo de la presentación».
   - Escribe el contenido, por ejemplo «Crédito revolvente: Liquidez, Plazos de 1 a 45 días, Sin comisión de apertura».
   - El plan debe nombrar un acomodo que no sea el de la vecina, y el texto debe ser el tuyo.
5. Con el teclado: Tab hasta «Agregar slide», Enter, flechas, Escape (el foco vuelve al botón).
