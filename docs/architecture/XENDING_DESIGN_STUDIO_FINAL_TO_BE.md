# Xending Design Studio Final — Arquitectura e implementación TO-BE

> **Documento maestro de ejecución para la branch `feat/xending-design-studio-final`.**  
> Estado: plan técnico y funcional para implementar después de crear la branch.  
> Alcance: terminar, limpiar y estabilizar el Design Studio actual de Xending antes de iniciar Design Studio OS.  
> No es el proyecto multi-tenant. No incluye onboarding de nuevas marcas ni Brand Blueprint genérico.  
> Fuente principal: auditoría AS-IS del flujo actual, caso real Cobertura/Motor/Infografía, código vigente de generación de imágenes, carruseles, mockups y UI.

---

## 0. Decisión ejecutiva

Esta branch no reconstruirá toda la plataforma. Conservará la fábrica operativa que ya funciona y sustituirá el núcleo creativo y las fuentes contradictorias de contexto.

La meta es cerrar Xending con una sola arquitectura activa, sin rutas V1/V2 simultáneas, sin prompts legacy mezclados con kits modernos y sin una historia de carrusel fijada universalmente por los roles.

La decisión central es:

> **Conservar la generación, persistencia, edición, mockups, HTML, exportación y cola por slide; reconstruir la resolución de contexto, la planeación creativa, la selección de evidencia y la compilación de prompts.**

El resultado esperado es un Design Studio de Xending que:

- produzca imágenes individuales con la calidad visual actual o mejor;
- produzca carruseles realmente distintos según el copy, la rama, la industria y el objetivo;
- mantenga un único medio visual por carrusel;
- pueda variar escenas, objetos, layouts y tratamientos sin perder identidad;
- use cifras solo cuando la historia lo necesita;
- calcule cualquier cifra en código;
- conozca qué se mostró en el slide anterior y qué se mostrará en el siguiente;
- elimine contextos y claims viejos que contradicen los kits modernos;
- deje una sola fuente editorial por rama;
- mantenga `imageQuality: 'high'` en la versión activa;
- mantenga logo y disclaimer fuera del prompt de imagen cuando se montan mediante HTML/export;
- cierre las seis líneas comerciales de Xending;
- quede estable y suficientemente limpio para convertirse después en la base de Design Studio OS.

Arquitectura objetivo de esta branch:

```text
COPY APROBADO
    ↓
CONTEXTO EFECTIVO DE XENDING
    ↓
RUTAS CREATIVAS
    ↓
PLAN CREATIVO DEL SET
    ↓
GUION Y COPY DE SLIDES
    ↓
PLAN DE EVIDENCIA / CIFRAS
    ↓
DIRECCIÓN VISUAL POR SLIDE
    ↓
CRÍTICO CREATIVO + VALIDACIONES
    ↓
PROMPT TÉCNICO POR SLIDE
    ↓
GPT-IMAGE-2 · HIGH
    ↓
MOCKUP / STORAGE / HTML BRAND LAYER / EXPORT
```

---

## 1. Branch y protección del trabajo actual

### 1.1 Nombre obligatorio

```text
feat/xending-design-studio-final
```

### 1.2 La branch debe salir de la versión activa con `high`

No crearla desde el commit auditado si ese commit aún usa `medium`.

Antes de cualquier modificación, Kiro debe ejecutar:

```bash
git status
git branch --show-current
git rev-parse HEAD
git log -1 --oneline
git worktree list
git grep "imageQuality"
git grep "quality: 'high'"
git log --all -S"imageQuality: 'high'" --oneline
```

Debe confirmar:

```text
Branch base:
Commit base:
Working tree:
Archivo donde se envía quality=high:
Modelo de imagen:
Timeout efectivo:
```

### 1.3 No perder cambios locales

Si la versión `high` está en el working tree y todavía no está confirmada:

- no hacer `reset`;
- no hacer `checkout -- .`;
- no cambiar a un commit histórico;
- crear la nueva branch preservando el working tree;
- crear un checkpoint commit antes del refactor.

Ejemplo:

```bash
git switch -c feat/xending-design-studio-final
git add -A
git commit -m "chore(design-studio): checkpoint current high-quality Xending runtime"
```

El commit de checkpoint solo aplica si el working tree contiene cambios válidos que forman la versión activa. No confirmar archivos temporales, dumps, secretos ni artefactos locales.

### 1.4 No hacer merge automático

La entrega de esta branch termina con:

- código;
- migraciones;
- pruebas;
- resultados de regresión;
- documentación;
- comparación antes/después.

No hacer merge a `main` sin revisión expresa.

---

## 2. Fuentes de verdad para esta implementación

La branch se implementa basándose en:

```text
docs/architecture/CAROUSEL_GENERATION_AS_IS.md
01-cobertura-motor-infografia.md
src/types/design-studio.ts
src/hooks/useCarouselQueue.ts
src/components/design-studio/CarouselPanel.tsx
supabase/functions/generate-carousel-script/index.ts
supabase/functions/generate-design-image/index.ts
supabase/functions/generate-design-mockups/index.ts
supabase/functions/_shared/copyKitRegistry.ts
supabase/functions/_shared/copy-kits/*.json
src/hooks/useDesignMockups.ts
src/utils/design-studio/exportCarousel.ts
src/utils/design-studio/masterImagePrompt.ts
src/utils/design-studio/buildBrandLayerHtml.ts
```

### 2.1 AS-IS que debe preservarse

El flujo actual separa correctamente:

```text
generate-carousel-script
→ historia, copy, imageIntent y brief

generate-design-image
→ prompt técnico e imagen
```

La cola del carrusel ya permite:

- generar un guion;
- editar copy por slide;
- editar `imageIntent`;
- generar prompts por slide;
- renderizar un slide individual;
- regenerar solo el slide defectuoso;
- generar el set secuencialmente;
- guardar URLs y mockups;
- exportar PNG/PDF.

Esa separación operativa se conserva.

### 2.2 AS-IS que debe eliminarse o sustituirse

El runtime actual todavía puede contener:

- `MASTER_IMAGE_PROMPT_V1`;
- selector/fallback V1/V2;
- `PROMPT_ENGINEER_SYSTEM` genérico como fallback;
- doble fuente de master prompt código/base de datos;
- copy banks v1 y v2 activos;
- `copyKitRegistry` moderno mezclado con `commercial_branches.prompt_kit` legacy;
- `strategic_config` legacy inyectado junto con bans V2;
- `FIGURE_SCENARIO_BY_ROLE`;
- `FX_MOMENT_LABELS` globales;
- `CAROUSEL_ROLE_BRIEFS` que ya dictan escenas;
- ejemplos universales de cobertura cambiaria;
- `CAROUSEL_SCENE_VARIETY` centrado en documentos FX;
- regla global “texto siempre arriba”;
- `visualAnchor` como prompt libre potencialmente contaminado por la campaña;
- `visualMotif` como único mecanismo de continuidad;
- `NO BRANDING` que puede contradecir copy exacto con “Xending”;
- `textInImage=false` presente dentro del prompt que luego intenta corregirse tarde;
- Edge Functions creativas que no validan membership de forma uniforme;
- caminos de exportación y renderer con configuración inconsistente.

---

## 3. Alcance de la branch

### 3.1 Incluido

1. Limpiar el runtime visual de Xending.
2. Dejar una sola versión activa del master image prompt.
3. Dejar una sola resolución editorial por rama.
4. Completar o preparar los seis kits modernos de Xending.
5. Migrar el Design Studio al banco v2 como fuente principal única.
6. Mejorar el agente de carruseles.
7. Agregar planeación creativa antes del guion.
8. Agregar rutas creativas realmente distintas.
9. Desacoplar cifras de roles.
10. Permitir cero cifras o ejemplos de uno a cuatro momentos.
11. Mantener cálculos en código.
12. Hacer set-aware el generador de prompts.
13. Hacer explícita la continuidad visual.
14. Mantener un solo medio por set.
15. Permitir máximo dos subtratamientos compatibles dentro del medio.
16. Mejorar copy zones y layouts.
17. Eliminar disclaimers del prompt de imagen.
18. Mantener logo como overlay/HTML; reservar espacio solo cuando el flujo realmente lo necesita.
19. Preservar `high`.
20. Estabilizar imágenes individuales.
21. Estabilizar mockups, Storage, library y reemplazos.
22. Estabilizar HTML/presentaciones existentes sin rediseñarlas como OS.
23. Corregir seguridad de Edge Functions.
24. Agregar observabilidad y prompt snapshots suficientes.
25. Agregar pruebas de regresión por rama y medio.
26. Eliminar código legacy cuando el cutover quede probado.

### 3.2 Fuera de alcance

No implementar en esta branch:

- onboarding conversacional de marcas;
- Brand Blueprint genérico;
- multi-tenant Creative OS nuevo;
- Scory;
- productos configurables mediante chat;
- Agent Registry multi-marca;
- Presentation Adapter genérico;
- News Adapter genérico;
- migración de otras marcas;
- creación automática de nuevas ramas comerciales sin deploy;
- RAG de ejemplos multi-tenant;
- un nuevo sistema completo de campañas cross-format.

### 3.3 Regla de futuro

Aunque esta branch es específica de Xending, no debe agregar nuevos hardcodes caóticos.

Toda nueva lógica debe quedar:

- tipada;
- modular;
- versionada;
- con una sola fuente de verdad;
- reutilizable en la futura branch de Design Studio OS.

No construir el OS ahora, pero tampoco crear deuda que obligue a rehacer lo recién terminado.

---

## 4. Principios no negociables

### 4.1 Una sola arquitectura activa

Al terminar:

- no debe existir un selector funcional V1/V2;
- no debe existir un fallback silencioso a V1;
- no debe existir un master prompt antiguo ejecutable;
- no debe inyectarse contexto editorial legacy cuando existe kit moderno;
- no debe haber dos copy banks productivos para la misma función;
- no debe haber dos generadores distintos resolviendo el mismo tipo de pieza sin una frontera explícita.

Git es el rollback.

Los archivos históricos pueden conservarse en documentación o historial Git; no deben participar en runtime.

### 4.2 Un medio por carrusel

El usuario selecciona:

```text
foto
infografia
financiero
```

El set completo mantiene ese medio.

No se permite:

```text
slide 1 fotografía
slide 2 iconografía 3D
slide 3 mapa
```

Sí se permite variedad dentro del medio.

### 4.3 Los ejemplos son referencias, no una taxonomía cerrada

Las referencias:

1. Corporate Professional Photography
2. Premium 3D Iconography
3. Hybrid Corporate Visual
4. Product / Dashboard Mockup
5. Global Map / Globe Visual
6. Shipping / Ports & Global Trade Photography

muestran capacidades y estándar de calidad.

No deben convertirse en una lista rígida de seis escenas.

La misma idea puede adaptarse al medio activo.

### 4.4 Los roles no deciden escenas

```text
shift ≠ HOY/PAGO
risk ≠ COMPRA 1/2/3
solution ≠ documento resuelto
example ≠ cifras
moment ≠ siempre tres fechas
```

El role define una función narrativa.

El Creative Plan define:

- escena;
- evidencia;
- objetos;
- cifras;
- layout;
- copy zone;
- tratamiento;
- continuidad.

### 4.5 Las cifras son opcionales

Default:

```text
usar cifras solo si son la mejor evidencia
```

No deben aparecer automáticamente por role.

### 4.6 El agente decide la evidencia; el código calcula

El modelo puede decidir:

```text
esta historia se entiende mejor con dos momentos
```

El modelo no decide:

```text
18.20 × 10,000 = 182,000
```

Todo cálculo, fecha y asignación de valores a documentos se hace en código.

### 4.7 Disclaimer fuera del creative engine

El disclaimer:

- no se genera en la imagen;
- no se escribe en el prompt de imagen;
- no requiere banda inferior;
- no reserva espacio en el canvas creativo;
- no forma parte del brief visual.

El disclaimer se monta mediante HTML/export.

La necesidad legal sí puede persistirse como metadata para que el renderer sepa qué texto montar, pero esta branch no debe hornearlo en la imagen.

### 4.8 Logo fuera del modelo

El modelo no dibuja el logo.

El logo se monta por HTML/brand layer.

Solo reservar espacio para el logo cuando:

- el slide realmente llevará logo;
- el template de overlay necesita una zona definida;
- la reserva no rompe la composición.

No reservar huecos vacíos universalmente.

### 4.9 Copy exacto manda

El headline, body y CTA aprobados se renderizan exactamente.

El generador técnico no puede:

- reescribirlos;
- traducirlos;
- agregar frases;
- sustituir Xending por otro término;
- inventar microcopy;
- mover cifras entre documentos.

### 4.10 `high` permanece

La branch no puede degradar silenciosamente:

```ts
imageQuality: 'high'
```

Si surge un problema de timeout, debe documentarse y resolverse sin cambiar el comportamiento creativo aprobado por una degradación silenciosa.

---

## 5. Qué se conserva de la implementación actual

### 5.1 Infraestructura

Conservar:

- Supabase;
- Storage;
- `image_library`;
- `design_mockups`;
- `copy_bank_items`;
- sesiones de diseño;
- historial de HTML;
- renderer;
- exportación;
- feedback;
- selección de medio;
- selección de fondo;
- prompt editable;
- image-to-image donde ya funcione;
- regeneración individual;
- cola secuencial del carrusel;
- persistencia de group/index;
- edición manual antes de render.

### 5.2 Flujo de carrusel

Conservar el concepto:

```text
createScript
→ user edits
→ buildPrompts
→ generateSlot/generateAll
→ persist
→ export
```

Cambiar la inteligencia interna, no destruir el workflow operativo.

### 5.3 Imágenes individuales

Conservar:

- los resultados V2 que el usuario ya considera excelentes;
- fotografía natural;
- iconografía 3D White Xending;
- dashboard/financiero;
- mapas/rutas;
- sistema de color navy/turquesa/coral;
- política de rostros no protagonistas;
- detalle industrial realista;
- feedback iterativo;
- `high`.

### 5.4 HTML y presentaciones

Conservar:

- `current_html`;
- `html_history`;
- iteraciones;
- referencia visual;
- conversión de mockup a HTML;
- renderer;
- export.

En esta branch solo estabilizar, documentar y probar.

No convertir todavía este flujo en el Presentation Adapter del futuro OS.

---

## 6. Limpieza de versiones viejas

### 6.1 Master Image Prompt

Al finalizar debe existir un único prompt activo para Xending.

Eliminar del runtime:

```text
MASTER_IMAGE_PROMPT_V1
MASTER_IMAGE_PROMPT_VERSION
MASTER_IMAGE_PROMPT_FALLBACK
DEFAULT_MASTER_IMAGE_BACKGROUND_STYLE dependiente de versión
selección per-request v1/v2
fallback de base de datos a prompt viejo
```

Mantener una constante versionada, por ejemplo:

```ts
export const XENDING_MASTER_IMAGE_PROMPT_REVISION = 'xending-image-v3';
```

Y una única fuente activa.

### 6.2 Decidir fuente canónica

Para esta branch, la recomendación es:

```text
código versionado = fuente canónica del prompt activo
```

Razón:

- reproducibilidad;
- revisión en Git;
- tests;
- evitar que una fila de DB vieja cambie comportamiento silenciosamente.

Puede conservarse una tabla histórica de prompts, pero no debe sobreescribir runtime sin un mecanismo explícito y probado.

### 6.3 Generic legacy image path

Auditar `PROMPT_ENGINEER_SYSTEM` y `handleLegacyPath`.

Regla:

- si no tiene caller activo: eliminar;
- si Image Stock Studio usa `styleSystemPrompt`: separar esa función en una ruta con nombre y contrato explícitos;
- no conservarla como fallback genérico;
- no permitir que `business_id` ausente cambie silenciosamente a un motor viejo.

Ejemplo de frontera limpia:

```text
generate-design-image
→ Xending master path

generate-stock-style-image
→ styleSystemPrompt explícito
```

No es obligatorio crear una nueva Edge Function si un router claro resuelve la frontera, pero no debe seguir llamándose “legacy” y actuar como fallback invisible.

### 6.4 Copy bank V1

El AS-IS mantiene:

```text
copy_bank_items
+ generated_ideas
```

La branch final debe utilizar:

```text
copy_bank_items
```

como fuente productiva del Design Studio.

Acciones:

1. Inventariar filas Design Studio de `generated_ideas`.
2. Migrar únicamente contenido útil no duplicado.
3. Preservar IDs o referencia de origen cuando ayude a trazabilidad.
4. Actualizar UI y hooks para no consultar ambos bancos.
5. Retirar `useDesignCopyBank` del flujo principal.
6. Mantener histórico read-only si otra parte de la plataforma todavía lo requiere.
7. Eliminar adaptación v1 cuando no tenga consumers.

### 6.5 Branch prompts legacy

Cuando exista un kit moderno:

```text
NO inyectar commercial_branches.prompt_kit legacy
NO inyectar strategic_config editorial legacy
NO inyectar content_ingredients legacy
NO inyectar claims viejos
NO inyectar ejemplos viejos
```

Un caso real mostró simultáneamente:

```text
“costos ocultos” como posicionamiento
```

y:

```text
“costos ocultos” como frase prohibida
```

Eso debe ser imposible en el nuevo runtime.

---

## 7. Fuente editorial única por rama

### 7.1 Resolver único

Implementar:

```ts
resolveXendingBranchKit()
```

Contrato recomendado:

```ts
export interface XendingBranchKit {
  kitVersion: string;
  branchSlug: XendingBranchSlug;
  branchName: string;
  status: 'active' | 'draft' | 'blocked';

  editorialObjective: string;
  scope: string[];
  clientShouldThink: string[];
  positioningMustCommunicate: string[];

  productFacts: string[];
  allowedSituations: string[];
  prohibitedSituations: string[];

  tone: {
    yes: string[];
    no: string[];
    tension: string;
    hedging: string;
  };

  allowedClaims: string[];
  prohibitedClaims: string[];
  hardBusinessRules: string[];

  formulasAllowed: string[];
  bannedOpenings: string[];
  bannedPhrases: string[];

  ctaRules: string[];
  ctas: string[];

  corridors?: Record<string, unknown>;
  industries?: Record<string, unknown>;
  angles: Record<string, unknown>;

  figurePolicy: {
    allowed: boolean;
    allowedScenarios: string[];
    maxPerSet?: number;
    notes: string[];
  };

  goldExamples: Array<{
    headline: string;
    subcopy?: string;
    cta?: string;
    tags?: string[];
  }>;

  rejectedExamples: Array<{
    text: string;
    reason: string;
  }>;
}
```

### 7.2 Una sola fuente efectiva

El resolver devuelve exactamente un kit.

No concatena:

```text
kit moderno + kit viejo + strategic_config + content_ingredients
```

### 7.3 Kits activos de Xending

El runtime final debe reconocer seis líneas canónicas:

```ts
export type XendingBranchSlug =
  | 'velocidad-mismo-dia'
  | 'costos-ahorro'
  | 'cuenta-multidivisa'
  | 'coberturas'
  | 'control-operativo-pagos'
  | 'banco-vs-xending';
```

### 7.4 Aliases de migración

Resolver temporalmente aliases históricos:

```text
ahorro-costos-ocultos → costos-ahorro
cobertura-cambiaria → coberturas
pagos-con-orden → control-operativo-pagos
```

Los aliases sirven para migrar datos, no para seguir creando contenido con nombres viejos.

### 7.5 Nombres visibles

```text
Velocidad — Mismo Día
Costos y Ahorro
Cuenta Multidivisa
Cobertura Cambiaria
Control Operativo de Pagos
Banco vs Xending
```

### 7.6 No inventar kits incompletos

Si los bancos finales de Cuenta Multidivisa, Control Operativo o Banco vs Xending todavía no están aprobados:

- crear schema y archivos draft;
- marcar `status: 'draft'`;
- impedir generación productiva desde una rama incompleta;
- mostrar “kit pendiente de aprobación”;
- no llenar huecos con claims inferidos.

La branch debe quedar preparada para activarlos al pegar los bancos aprobados, sin volver a tocar el agente.

---

## 8. Cierre de las seis ramas de Xending

### 8.1 Velocidad — Mismo Día

Debe contener:

- China/Asia;
- pagos internacionales generales;
- industrias;
- tiempos operativos reales;
- proveedor;
- embarque;
- inventario;
- confirmación;
- claridad;
- CTAs aprobados.

No debe derivar automáticamente hacia:

- cobertura;
- exposición cambiaria;
- comparativos de FX;
- tres compras;
- ahorro garantizado.

### 8.2 Costos y Ahorro

Debe usar exclusivamente el kit moderno.

Eliminar del runtime:

- “costos ocultos”;
- “tu banco te cobra de más”;
- “hasta 70%” si no está autorizado;
- “sin spread oculto” si no es factualmente validado;
- comparativos agresivos;
- claims de ahorro como resultado garantizado.

Debe poder hablar de:

- tipo de cambio como parte del costo;
- comparación;
- segunda cotización;
- costo total;
- margen;
- diferencias acumuladas;
- simplificación operativa cuando corresponda.

### 8.3 Cuenta Multidivisa

Debe definirse por capacidades reales.

Posibles territorios, solo si son verdaderos:

- balances por moneda;
- centralización;
- recepción;
- conversión;
- pago;
- visibilidad;
- administración de divisas;
- menos cuentas/portales.

No afirmar:

- funciones no implementadas;
- disponibilidad de monedas no confirmadas;
- rendimientos;
- custodia bancaria propia;
- que Xending es banco.

### 8.4 Cobertura Cambiaria

Separar claramente:

- cobertura general;
- forward;
- opciones, si existen y están validadas;
- ejemplos industriales;
- lenguaje legal.

Forward y productos regulados deben llevar metadata de revisión de producto/legal.

No inyectar esta narrativa en otras ramas.

### 8.5 Control Operativo de Pagos

Confirmar capacidades antes de activar:

- usuarios;
- roles;
- autorizaciones;
- beneficiarios;
- estatus;
- trazabilidad;
- reportes;
- conciliación;
- API;
- historial.

Si la rama no tiene al menos un conjunto suficiente de capacidades reales, mantener draft.

### 8.6 Banco vs Xending

Debe ser una rama narrativa comparativa, no una agresión.

Requiere identificar qué capacidad se compara:

```text
velocidad
costos
cuenta multidivisa
control operativo
pagos internacionales
cobertura
```

No usar:

- “tu banco te engaña”;
- “tu banco te roba”;
- “siempre somos más baratos”;
- “reemplaza a tu banco”;
- comparativos sin fuente.

Debe poder comunicar:

- generalista vs especialista;
- alternativa complementaria;
- segunda opción;
- experiencia especializada;
- operación internacional coordinada.

---

## 9. Banco de copy canónico

### 9.1 Objetivo

Dejar un banco activo limpio por rama.

Meta recomendada:

```text
30 copys canónicos activos por rama
```

No es obligatorio que los 180 estén terminados antes de implementar el motor; sí es obligatorio que el sistema soporte su carga sin duplicar lógica.

### 9.2 Cada copy debe guardar

```ts
interface XendingCopyBankItem {
  id: string;
  branchSlug: XendingBranchSlug;
  headline: string;
  subcopy?: string;
  cta?: string;

  status: 'seed' | 'proposed' | 'approved' | 'rejected' | 'archived';

  angleTag?: string;
  angleLabel?: string;
  industry?: string;
  corridor?: string;
  objectiveHint?: 'explicar' | 'conectar' | 'vender';

  needsProductLegalReview?: boolean;
  reviewNote?: string;

  sourceDocument?: string;
  sourceIndex?: number;

  rating?: 'liked' | 'disliked';
  rejectionReason?: string;
}
```

### 9.3 No duplicar entre ramas

Un copy tiene una rama primaria.

Puede tener tags secundarios.

No guardar la misma frase como fila activa en dos ramas.

### 9.4 Migración

Crear reporte:

```text
copy-bank-migration-report.md
```

Debe mostrar:

- filas v1 detectadas;
- filas v2 detectadas;
- duplicados;
- copys movidos de rama;
- copys archivados;
- aliases normalizados;
- copys que requieren revisión manual.

---

## 10. Contexto efectivo de Xending

### 10.1 Compilador específico de esta branch

Implementar:

```ts
resolveEffectiveXendingCreativeContext()
```

No es todavía el Context Compiler multi-tenant del futuro OS.

Es una versión específica y limpia para Xending.

### 10.2 Contrato

```ts
export interface EffectiveXendingCreativeContext {
  brand: {
    name: 'Xending';
    colors: {
      navy: '#0F1419';
      turquoise: '#2ED4C7';
      coral: '#FF7A4A';
      white: '#FFFFFF';
    };
    typography: {
      display: 'Montserrat';
      body: 'Poppins';
    };
  };

  branch: XendingBranchKit;

  angle?: {
    slug: string;
    name: string;
    instruction?: string;
  };

  industry?: {
    id?: string;
    name: string;
    keywords: string[];
  };

  corridor?: {
    mode?: string;
    origin?: string;
    destination?: string;
  };

  objective: 'explicar' | 'conectar' | 'vender';
  medium: 'foto' | 'infografia' | 'financiero';
  background: string;

  seedCopy: {
    headline: string;
    body?: string;
    cta?: string;
  };

  explicitGuidance?: string;

  recentCreativeFingerprints: XendingCreativeFingerprint[];

  sourceTrace: Array<{
    field: string;
    source: string;
  }>;

  conflicts: Array<{
    field: string;
    severity: 'warning' | 'blocking';
    description: string;
  }>;
}
```

### 10.3 Precedencia

```text
1. Reglas duras de producto/compliance
2. Kit moderno de la rama
3. Copy aprobado
4. Selecciones explícitas de UI
5. Industria/corredor
6. Objetivo
7. Guidance del usuario
8. Preferencias aprendidas
9. Defaults
```

### 10.4 Conflict detection

Bloquear cuando:

- un claim aparece permitido y prohibido;
- la rama está draft;
- el copy contiene una frase prohibida no aprobada;
- el medio no corresponde a la selección;
- un dato numérico no tiene fuente/cálculo;
- se intenta usar un producto no validado;
- el contexto legacy aparece en el stack.

### 10.5 Source trace

Cada prompt snapshot debe poder explicar:

```text
este claim vino del kit costos-ahorro-v2.0
este CTA vino del copy aprobado
esta industria vino de copy_bank_items.industry
este medium vino del panel
```

---

## 11. Motor creativo del carrusel

### 11.1 Separar planeación y redacción

El nuevo flujo debe tener dos etapas:

```text
Creative Routes / Plan
→ Script Writer
```

No pedirle al mismo prompt que:

- invente la estrategia;
- elija la evidencia;
- escriba cinco slides;
- decida layouts;
- decida cifras;
- diseñe color;
- valide claims;
- genere motivo;

en una sola respuesta monolítica.

### 11.2 Agentes lógicos

No es obligatorio crear cinco Edge Functions.

Sí es obligatorio separar responsabilidades mediante funciones, contratos y prompts.

#### Creative Planner

Decide:

- premisa;
- reacción buscada;
- story engine;
- secuencia;
- evidencia;
- tratamientos;
- continuidad;
- figure policy.

#### Script Writer

Decide:

- headline;
- body;
- CTA;
- line breaks;
- highlights.

No cambia el plan.

#### Figure Engine

Código puro:

- calcula;
- formatea;
- asigna documentos;
- valida aritmética.

#### Prompt Translator

Convierte el slide plan en prompt técnico.

No reinventa la historia.

#### Creative Critic

Valida el plan y el guion antes de gastar imágenes.

---

## 12. Rutas creativas

### 12.1 Generar tres rutas

Cuando el usuario pulse “Generar idea carrusel”, producir tres rutas realmente distintas.

### 12.2 Contrato

```ts
export interface XendingCarouselCreativeRoute {
  id: string;
  title: string;
  premise: string;

  desiredReaction:
    | 'understand'
    | 'recognize'
    | 'desire'
    | 'act';

  storyEngine: string;

  cohesionMode:
    | 'single_treatment'
    | 'controlled_mix';

  primaryTreatment: string;
  secondaryTreatment?: string;

  figurePolicy:
    | 'none'
    | 'optional'
    | 'recommended';

  continuityConcept: string;

  slides: Array<{
    index: number;
    narrativeJob: string;
    keyMessage: string;
    visualDevice: string;
    primaryObject: string;
  }>;

  scores: {
    copyAlignment: number;
    branchFit: number;
    visualSpecificity: number;
    narrativeProgression: number;
    commercialImpact: number;
    novelty: number;
    mediumConsistency: number;
  };

  strengths: string[];
  risks: string[];
}
```

### 12.3 Las rutas deben diferenciarse de verdad

No aceptar:

```text
Ruta A: mismo HOY/PAGO con motor
Ruta B: mismo HOY/PAGO con factura
Ruta C: mismo HOY/PAGO con calendario
```

Deben variar:

- premise;
- story engine;
- evidence device;
- sequence;
- treatment;
- primary objects;
- persuasion mechanism.

### 12.4 Ejemplo con “Cada motor también mueve tus costos”

Posibles rutas válidas:

#### Ruta A — Anatomía del costo

```text
motor
→ precio de fábrica
→ conversión de moneda
→ transferencia
→ costo total
```

#### Ruta B — Del pedido al pago

```text
orden de compra
→ fecha futura
→ variable cambiaria
→ presupuesto
→ decisión
```

#### Ruta C — Volumen industrial

```text
una pieza
→ pallet
→ contenedor
→ compras recurrentes
→ impacto en margen
```

No todas requieren cifras.

### 12.5 Selección

La ruta con mayor score queda recomendada.

El usuario puede:

- usar la recomendada;
- elegir otra;
- regenerar rutas;
- agregar guidance.

### 12.6 Auto mode

Puede existir un modo automático para no agregar fricción.

Aun en auto, guardar las rutas generadas y la razón de selección.

---

## 13. Creative Plan del carrusel

### 13.1 Contrato

```ts
export interface XendingCarouselCreativePlan {
  version: 'xending-carousel-final-v1';

  routeId: string;
  premise: string;
  desiredReaction: string;
  storyEngine: string;

  medium: 'foto' | 'infografia' | 'financiero';

  cohesionMode:
    | 'single_treatment'
    | 'controlled_mix';

  primaryTreatment: string;
  secondaryTreatment?: string;

  continuity: XendingCarouselContinuityKit;

  figurePolicy:
    | 'auto'
    | 'none'
    | 'illustrative';

  layoutPolicy:
    | 'varied'
    | 'repeated'
    | 'progressive'
    | 'mirrored';

  slides: XendingCarouselSlidePlan[];
}
```

### 13.2 Slide plan

```ts
export interface XendingCarouselSlidePlan {
  index: number;
  role: CarouselSlideRole;

  narrativeJob: string;
  keyMessage: string;

  visualIntent: string;
  visualMetaphor: string;

  evidenceDevice:
    | 'product'
    | 'document'
    | 'comparison'
    | 'repetition'
    | 'calendar'
    | 'dashboard'
    | 'route'
    | 'globe'
    | 'macro_detail'
    | 'process'
    | 'status'
    | 'abstract_metaphor'
    | 'clean_close';

  visualTreatment: string;

  layout: CarouselLayoutV2;
  copyZone: CarouselCopyZone;

  cameraScale:
    | 'wide'
    | 'medium'
    | 'close'
    | 'macro'
    | 'top_down'
    | 'isometric';

  primaryObjects: string[];
  secondaryObjects: string[];

  figureSpec?: XendingCarouselFigureSpec;

  avoidSimilarityWith: number[];
}
```

### 13.3 Persistencia

Guardar el plan dentro de `copy_bank_items.image_meta.carousel` junto con:

- selected route;
- script;
- prompts;
- fingerprint;
- style spec;
- kit version;
- prompt revision.

No crear una segunda fuente de verdad si JSONB actual puede contenerlo de forma ordenada.

---

## 14. Roles y presets

### 14.1 El role se vuelve abstracto

Reescribir briefs globales.

Ejemplo:

```ts
shift:
  'Explica el mecanismo concreto que hace avanzar la historia. La evidencia se decide en el Creative Plan. No presupongas dos fechas, documentos ni FX.'

risk:
  'Vuelve visible una consecuencia real y condicional. Puede ser volumen, espera, fricción, margen, desalineación, exposición, tiempo o complejidad. No presupongas repetición ni cifras.'

solution:
  'Muestra la transición hacia claridad, control, velocidad o capacidad según la rama. No presupongas documento, dashboard ni check.'
```

### 14.2 Presets actuales

Conservar inicialmente:

```text
Tensión → Qué cambia → Riesgo → Solución → CTA
Gancho → Problema → Ejemplo → Solución
Checklist — 3 señales
Cronología de una operación
```

### 14.3 Reglas por preset

Cada preset debe tener:

```ts
interface CarouselPresetV2 {
  slug: string;
  name: string;
  roles: CarouselSlideRole[];
  narrativeRules: string;
  seedCopyUsage: 'cover' | 'source_material' | 'adaptive';
  layoutPolicy: 'varied' | 'repeated' | 'progressive' | 'mirrored';
  examplesId: string;
  figurePolicyDefault: 'auto' | 'none';
}
```

### 14.4 Ejemplos por estructura

No volver a inyectar los mismos tres ejemplos de cobertura a todos los presets.

Implementar:

```ts
getCarouselMechanicsExamples({
  presetSlug,
  branchSlug,
  objective,
})
```

Checklist recibe ejemplos de checklist.

Cronología recibe ejemplos de timeline.

Velocidad no recibe ejemplos de cobertura.

### 14.5 Seed copy

El copy semilla no siempre es el slide 1.

```text
Arco clásico → cover
Checklist → source material
Cronología → source material
Otros → adaptive
```

---

## 15. Medio visual y subtratamientos

### 15.1 Medio bloqueado por set

```ts
export type XendingCarouselMedium =
  | 'foto'
  | 'infografia'
  | 'financiero';
```

### 15.2 Cohesión

```ts
export type XendingCarouselCohesionMode =
  | 'auto'
  | 'single_treatment'
  | 'controlled_mix';
```

### 15.3 Regla auto

`auto` puede seleccionar uno o dos subtratamientos compatibles.

Nunca cambia de medio.

### 15.4 Registro extensible

```ts
export interface XendingVisualTreatmentDefinition {
  id: string;
  medium: XendingCarouselMedium;
  description: string;
  compatibleWith: string[];
  incompatibleWith: string[];
}
```

### 15.5 Tratamientos iniciales

#### Foto

```text
corporate_editorial
operational_detail
trade_logistics
industrial_product
document_desk
dashboard_in_context
environmental_wide
macro_industrial
```

#### Infografía

```text
premium_3d_icon
industrial_3d_product
document_3d
dashboard_3d
operational_diorama_3d
globe_3d
abstract_financial_3d
macro_3d_detail
```

#### Financiero

```text
dashboard_flow
global_network
geographic_corridor
operational_route
status_nodes
financial_timeline
multi_currency_system
document_flow
```

### 15.6 Los seis ejemplos visuales

Se registran como referencias de capacidad y no como opciones UI rígidas.

### 15.7 `CAROUSEL_MEDIUM_SECTION`

Mantener la función como bloqueo de medio, pero ampliar la descripción para permitir las familias internas.

No usar frases que reduzcan:

```text
infografia = solo icono 3D
financiero = solo ruta
```

---

## 16. Style Spec neutral

### 16.1 Sustituir `visualAnchor` libre

El anchor actual puede heredar semántica de la campaña.

Crear:

```ts
export interface XendingCarouselBrandStyleSpec {
  revision: string;
  medium: XendingCarouselMedium;
  backgroundStyle: string;

  materiality: string;
  camera: string;
  lighting: string;
  palette: string;
  typography: string;
  compositionDensity: string;
  negativeSpace: string;
  finish: string;

  textPolicy: 'editorial_full_text';
  globalAvoid: string[];
}
```

### 16.2 Qué puede contener

- medio;
- materialidad;
- cámara;
- iluminación;
- color;
- tipografía;
- densidad;
- acabado;
- negativas visuales.

### 16.3 Qué no puede contener

- headline;
- body;
- CTA;
- motor;
- factura;
- pallet;
- escena;
- comparación;
- HOY/PAGO;
- tensión concreta;
- metáfora de una campaña;
- política `textInImage=false`.

### 16.4 Generación

Puede construirse determinísticamente desde el sistema visual de Xending o mediante un modo:

```text
mode = carousel_style_spec
```

Si se usa modelo, validar que no incluya sujetos ni escenas.

### 16.5 Una sola política de texto

Para carruseles actuales:

```text
textInImage = true
```

No incluir en el mismo prompt ambas ramas `true` y `false`.

---

## 17. Continuidad del set

### 17.1 Sustituir `visualMotif`

Crear:

```ts
export interface XendingCarouselContinuityKit {
  campaignSubject: string;

  recurringObject?: string;

  recurrencePolicy:
    | 'bookends'
    | 'selective'
    | 'every_slide'
    | 'none';

  recurringGraphicDevice?: string;

  sharedMaterials: string[];
  sharedCameraLanguage: string;
  sharedAccentLogic: string;

  forbiddenRepetitions: string[];
}
```

### 17.2 Bookends

Cuando `bookends`:

- el objeto recurrente protagoniza portada y cierre;
- no debe aparecer en `primaryObjects` de slides intermedios;
- no debe ser nombrado en el `imageIntent` intermedio;
- puede aparecer desenfocado como contexto solo si el plan lo autoriza.

### 17.3 Cohesión sin repetir objeto

La unidad viene de:

- medio;
- style spec;
- cámara;
- luz;
- materiales;
- paleta;
- tipografía;
- grid;
- highlight system;
- graphic device.

No de cinco motores iguales.

---

## 18. Contexto del slide anterior y siguiente

### 18.1 Problema actual

Cada llamada técnica recibe un slide aislado, pero se le pide no repetirse.

Eso no es suficiente.

### 18.2 Nuevo payload

Enviar a cada llamada:

```ts
interface XendingCarouselPlanSummary {
  premise: string;
  storyEngine: string;
  medium: XendingCarouselMedium;
  cohesionMode: string;
  primaryTreatment: string;
  secondaryTreatment?: string;
  continuity: XendingCarouselContinuityKit;

  slides: Array<{
    index: number;
    role: CarouselSlideRole;
    narrativeJob: string;
    keyMessage: string;
    visualTreatment: string;
    evidenceDevice: string;
    layout: CarouselLayoutV2;
    copyZone: CarouselCopyZone;
    cameraScale: string;
    primaryObjects: string[];
    figureScenario: string;
  }>;
}
```

Y además:

```ts
currentSlideIndex
previousSlideSummary
nextSlideSummary
```

### 18.3 Reglas del Prompt Translator

Antes de escribir la escena debe comprobar:

- qué objeto ya se usó;
- qué layout ya se usó;
- qué evidencia ya se usó;
- qué tratamiento corresponde;
- qué debe preparar para el siguiente slide;
- si la repetición es intencional o accidental.

---

## 19. Copy zones y layouts

### 19.1 Eliminar regla global

Eliminar:

```text
El texto va SIEMPRE en la zona superior
```

### 19.2 Copy zone

```ts
export type CarouselCopyZone =
  | 'top'
  | 'left'
  | 'right'
  | 'center'
  | 'integrated';
```

### 19.3 Layouts V2

```ts
export type CarouselLayoutV2 =
  | 'editorial_top'
  | 'split_editorial'
  | 'editorial_repetition'
  | 'document_result'
  | 'hero_clean'
  | 'centered_statement'
  | 'macro_detail'
  | 'timeline_continuous'
  | 'dashboard_focus'
  | 'full_scene_negative_space'
  | 'comparison_mirrored'
  | 'object_anatomy';
```

### 19.4 Renombrar `split_photo`

Cambiar a:

```text
split_editorial
```

porque puede aplicarse a foto, 3D o financiero.

### 19.5 Repetición intencional

Checklist y cronología pueden repetir layout.

El critic no debe castigar una repetición que el preset ordena.

---

## 20. Sistema de cifras

### 20.1 Eliminar asignación por role

Eliminar del runtime:

```ts
FIGURE_SCENARIO_BY_ROLE
```

### 20.2 Política UI

```ts
export type XendingCarouselFigurePolicy =
  | 'auto'
  | 'none'
  | 'illustrative';
```

Mostrar:

```text
Uso de cifras
- Automático
- Sin cifras
- Ejemplo ilustrativo
```

### 20.3 Default

```text
auto = no usar cifra salvo que sea la mejor evidencia
```

### 20.4 Figure spec

```ts
export interface XendingCarouselFigureSpec {
  enabled: boolean;

  scenarioId:
    | 'fx_two_moment'
    | 'fx_timeline'
    | 'fx_repeated_purchases'
    | 'invoice_vs_budget'
    | 'cost_breakdown'
    | 'payment_schedule'
    | 'multiple_orders'
    | 'single_metric'
    | 'none';

  momentCount?: 1 | 2 | 3 | 4;
  comparisonBase?: number;

  labels?: string[];
  dateOffsets?: number[];

  assumptions?: {
    baseRate?: number;
    amountUsd?: number;
    driftPct?: number[];
  };
}
```

### 20.5 No limitar siempre a dos o tres momentos

Permitir:

- un dato;
- dos estados;
- tres compras;
- cuatro fechas;

según la historia.

### 20.6 Cálculo en código

Conservar y generalizar:

- redondeo visible;
- base comparison;
- monto fijo cuando aplica;
- exact values per document;
- complete `TOTAL`;
- field order;
- color role;
- date formatting;
- accumulated amount.

### 20.7 No disclaimer en imagen

Si el ejemplo requiere nota legal:

- guardar `needsLegalNote` y `legalNoteKey` como metadata;
- no enviar el disclaimer al image model;
- no reservar banda;
- el HTML/export lo monta.

### 20.8 Figure registry

Crear un registro extensible, no un switch disperso por roles.

```ts
interface XendingFigureScenarioDefinition {
  id: string;
  branchCompatibility: XendingBranchSlug[];
  minMoments: number;
  maxMoments: number;
  buildDocuments: (...) => CarouselFigureDocument[];
  validate: (...) => ValidationResult;
}
```

---

## 21. Copy, tipografía y color

### 21.1 Jerarquía

```text
Headline dominante
Supporting copy mucho menor
CTA/microcopy/document labels menor todavía
```

### 21.2 Supporting copy

- Poppins-like;
- una oración;
- no repetir headline;
- no competir;
- 8–25 palabras como guía, no como dogma absoluto.

### 21.3 Highlights semánticos

Normalmente uno.

Dos solo ante oposición real.

Puede ser una frase completa.

No limitar a una palabra.

### 21.4 Contrato

```ts
interface CarouselHighlight {
  text: string;
  colorRole: 'risk' | 'control';
}
```

### 21.5 Validaciones

```text
highlight.text debe existir literalmente en headline
máximo dos highlights
no overlap accidental
no headline completo como highlight
```

### 21.6 Semántica Xending

```text
navy = neutral / estructura
coral = riesgo / exposición / incremento / futuro
Turquesa = control / presente / activación / Xending
```

### 21.7 CTA con Xending

No usar una prohibición general que impida renderizar el copy aprobado.

Nueva regla:

```text
No generes logos, wordmarks, marcas de agua ni ocurrencias adicionales de la marca.
Renderiza exactamente el copy entregado, incluso si contiene la palabra Xending.
```

### 21.8 Document text

Permitir texto dentro de objetos cuando ayuda:

- USD;
- MXN;
- TOTAL;
- HOY;
- PAGO;
- fechas;
- labels;
- cifras estructuradas.

No permitir:

- pseudo-text;
- párrafos inventados;
- números sueltos;
- claims no autorizados.

---

## 22. Prompt compiler del carrusel

### 22.1 No mega prompt contradictorio

El prompt final debe compilar módulos con una sola autoridad.

```text
STYLE SPEC
+ SET PLAN SUMMARY
+ CURRENT SLIDE PLAN
+ NEIGHBOR CONTEXT
+ EXACT COPY
+ EXACT FIGURES
+ MEDIUM RULES
+ TYPOGRAPHY/COLOR RULES
+ NEGATIVE RULES
```

### 22.2 No repetir branch context dentro del prompt visual

La estrategia comercial ya fue resuelta por Planner y Script Writer.

El Prompt Translator recibe:

- plan aprobado;
- copy aprobado;
- visual treatment;
- evidence;
- figures;
- style spec.

No necesita nuevamente todos los bancos de copy.

### 22.3 Orden recomendado

```text
1. Slide identity
2. Set summary
3. Medium lock
4. Style spec
5. Current slide visual job
6. Scene
7. Layout/copy zone
8. Exact copy
9. Highlights
10. Exact documents/figures
11. Environmental labels
12. Logo clear-space rule, if applicable
13. Canvas
14. Avoid
```

### 22.4 Contradicciones que deben desaparecer

- `textInImage=false` vs `true`;
- texto siempre arriba vs split;
- no Xending vs copy con Xending;
- motif bookend vs motif evolves everywhere;
- one hero max vs repeated purchase scene;
- zero figures examples vs forced figures;
- V1 vs V2;
- modern kit vs legacy branch context.

### 22.5 Prompt snapshot

Persistir por set/slide:

```ts
interface XendingPromptSnapshot {
  promptRevision: string;
  branchKitVersion: string;
  creativePlanVersion: string;
  styleSpecRevision: string;
  model: string;
  imageQuality: 'high';
  systemPromptHash: string;
  finalPrompt: string;
  createdAt: string;
}
```

No es necesario crear tabla nueva si puede guardarse en metadata de forma razonable.

---

## 23. Creative Critic

### 23.1 Antes del guion

Evaluar rutas.

### 23.2 Antes de prompts

Evaluar creative plan + copy.

### 23.3 Criterios

```text
copy alignment
branch fit
product truth
visual specificity
story progression
commercial impact
novelty
medium consistency
slide differentiation
text-image alignment
claim safety
```

### 23.4 Test de generalidad

```text
¿La misma imagen funcionaría para diez headlines distintos?
```

Si sí, reparar.

### 23.5 Test de vecinos

```text
¿El slide repite el objeto, layout o evidencia del anterior sin intención?
¿El slide anticipa exactamente la misma escena del siguiente?
```

### 23.6 Test de rama

```text
¿Una pieza de Velocidad está hablando de FX?
¿Una pieza de Multidivisa parece Cobertura?
¿Banco vs Xending está atacando al banco?
```

### 23.7 Repair pass

Una reparación automática controlada.

No regenerar todo por un único fallo.

Salida:

```ts
interface CreativeCriticReport {
  passed: boolean;
  scores: Record<string, number>;
  violations: Array<{
    code: string;
    severity: 'warning' | 'blocking';
    slideIndex?: number;
    message: string;
  }>;
  repairsApplied: string[];
}
```

---

## 24. Memoria creativa y no repetición

### 24.1 Feedback actual

El sistema actual ya separa likes/dislikes por `business_id` y fondo.

Conservar el principio:

```text
la selección explícita manda sobre la preferencia aprendida
```

### 24.2 Scope para Xending

Guardar preferencia por:

- branch;
- medium;
- background;
- format;
- industry, cuando sea relevante.

### 24.3 Fingerprint

```ts
export interface XendingCreativeFingerprint {
  branchSlug: XendingBranchSlug;
  objective: string;
  presetSlug: string;
  medium: XendingCarouselMedium;
  storyEngine: string;
  primaryTreatment: string;
  secondaryTreatment?: string;
  layoutSequence: string[];
  evidenceDevices: string[];
  dominantObjects: string[];
  figureScenarios: string[];
  visualMetaphors: string[];
  createdAt: string;
}
```

### 24.4 Uso

El planner recibe fingerprints recientes.

Penaliza combinaciones repetidas.

No prohíbe una idea para siempre.

### 24.5 No aprender selectores explícitos como defaults globales

No convertir:

```text
esta vez eligió white
```

en:

```text
siempre prefiere white
```

Aprender solo feedback cualitativo aprobado.

---

## 25. Imágenes individuales

### 25.1 Objetivo

No degradar el flujo que actualmente produce las mejores imágenes.

### 25.2 Consolidar prompt activo

Eliminar V1 y fallbacks, pero conservar el contenido útil de V2:

- fotografía natural;
- 3D White Xending;
- mapas/rutas;
- dashboard;
- anatomía industrial;
- reglas de personas;
- colores;
- tipografía;
- fondos.

### 25.3 Una sola ruta de contexto

La imagen individual debe recibir el mismo `EffectiveXendingCreativeContext` que el carrusel.

No debe recibir `strategic_config` viejo cuando existe kit moderno.

### 25.4 Texto en imagen

Mantener dos modos explícitos:

```text
textInImage=false → fondo/visual para HTML overlay
textInImage=true → pieza editorial terminada
```

No incluir ambas ramas completas dentro del mismo prompt final.

Compilar solo la rama activa.

### 25.5 Medio autoritativo

```text
foto ≠ 3D
infografia ≠ foto
financiero ≠ stock photo
```

### 25.6 Reference mode

Conservar imagen de referencia.

Documentar si:

- la referencia se envía como píxeles;
- solo se describe;
- se usa `/images/edits`;
- se conserva composición.

### 25.7 Calidad

Todas las regresiones principales se ejecutan en `high`.

### 25.8 Test mínimo

- motor 3D;
- foto logística;
- dashboard;
- mapa/ruta;
- pieza de velocidad;
- pieza de costos;
- pieza multidivisa.

---

## 26. HTML, presentaciones y brand layer

### 26.1 No rediseñar como OS

En esta branch:

- preservar;
- limpiar;
- estabilizar;
- probar.

### 26.2 Brand layer

Responsabilidades:

```text
logo
disclaimer
footer
brand marks
```

No hornearlos mediante image model cuando el usuario los monta por HTML/export.

### 26.3 Templates

Confirmar:

- logo zone real;
- disclaimer rendering;
- font loading;
- line breaks;
- safe area;
- 1:1 carousel;
- PDF.

### 26.4 Presentation / HTML reference flow

Prueba de regresión:

1. subir una referencia;
2. generar mockup;
3. convertir a HTML;
4. iterar;
5. guardar template;
6. renderizar PNG/PDF.

### 26.5 No crear una segunda fuente visual

El HTML debe usar:

- misma paleta;
- mismas tipografías;
- mismo brand layer;
- mismas decisiones de background.

No necesita el mismo prompt de imagen.

---

## 27. Mockups, Storage e image library

### 27.1 Mantener asociación

```text
carouselGroupId
carouselIndex
mockupId
imageLibraryId
imageUrl
```

### 27.2 Regeneración

Definir semántica explícita:

```text
Regenerar conserva historial
Reemplazar actualiza el slot
Borrar elimina mockup + library + storage según política
```

### 27.3 Evitar residuos

Actualmente regenerar puede dejar mockups anteriores.

Agregar:

- historial visible o cleanup;
- acción de borrar carrusel completo;
- cleanup de Storage;
- cleanup de `image_library`;
- cleanup de metadata.

### 27.4 Constraint recomendado

Evaluar índice único por versión activa:

```text
(carousel_group_id, carousel_index, is_current)
```

No aplicar una constraint que destruya historial sin diseñar primero la semántica.

### 27.5 Persistencia parcial de prompts

Durante `buildPrompts`, persistir prompts conforme llegan o implementar checkpoint.

No perder cuatro prompts válidos porque el quinto falló.

---

## 28. Exportación

### 28.1 PNG

Conservar orden por index.

Validar nombres y estado incompleto.

### 28.2 PDF

Unificar configuración del renderer.

Eliminar hardcode de:

```text
http://localhost:3333
```

si existen variables:

```text
RENDER_SERVICE_URL
RENDER_SERVICE_TOKEN
```

### 28.3 Brandized export

Distinguir claramente:

```text
imagen base generada
imagen con brand layer
PDF final
```

El export final debe poder usar las versiones brandizadas.

### 28.4 Disclaimer

El disclaimer se monta aquí, no en el prompt de imagen.

### 28.5 Carrusel incompleto

Permitir export parcial solo con advertencia fuerte.

Opcionalmente requerir confirmación.

---

## 29. Seguridad

### 29.1 Problema AS-IS

`generate-carousel-script` valida membership.

`generate-design-image` no lo hace de forma uniforme en el handler auditado.

### 29.2 Regla obligatoria

Todas las Edge Functions creativas deben:

1. exigir Authorization;
2. validar JWT;
3. identificar usuario;
4. verificar membership del `business_id`;
5. no confiar solo en el ID del body;
6. filtrar consultas por negocio;
7. usar service role únicamente después de autorizar;
8. no cruzar feedback, assets o imágenes.

### 29.3 Funciones a revisar

- `generate-design-image`;
- `generate-carousel-script`;
- `generate-design-mockups`;
- HTML generation;
- template save;
- image library actions;
- renderer auth.

### 29.4 Tests

- usuario sin membership;
- business ID manipulado;
- lectura de prompt de otro negocio;
- image library de otro negocio;
- feedback cruzado;
- mockup cruzado.

---

## 30. Observabilidad

### 30.1 Guardar metadata

Por generación:

```text
branchSlug
branchKitVersion
copyBankItemId
objective
presetSlug
medium
background
creativeRouteId
creativePlanVersion
figureScenario
styleSpecRevision
promptRevision
model
quality
timeToPromptMs
timeToImageMs
status
errorCode
```

### 30.2 Logs sin secretos

No registrar:

- JWT;
- API keys;
- base64 completo;
- URLs firmadas sensibles.

### 30.3 Prompt diagnostics

En desarrollo, permitir ver:

- Effective Context;
- selected route;
- plan;
- critic report;
- final prompt.

No mostrarlo por defecto al usuario final.

### 30.4 Métricas

- tasa de regeneración por slide;
- porcentaje de sets completos;
- prompt failures;
- image failures;
- average render time high;
- branch repetition score;
- thumbs up/down;
- edits before render;
- edits after render.

---

## 31. UI final del carrusel

### Paso 1 — Configuración

Mantener:

- estructura;
- objetivo;
- medio;
- fondo;
- guidance.

Agregar:

```text
Uso de cifras
- Automático
- Sin cifras
- Ejemplo ilustrativo
```

Agregar:

```text
Cohesión visual
- Automática
- Un solo tratamiento
- Mezcla controlada
```

### Paso 2 — Rutas creativas

Mostrar tres tarjetas compactas:

- título;
- premisa;
- historia;
- tratamiento(s);
- evidencia;
- uso de cifras;
- score/recomendación.

Acciones:

```text
Usar esta ruta
Regenerar rutas
```

### Paso 3 — Guion y plan

Por slide mostrar:

- role;
- headline;
- body;
- CTA;
- narrative job;
- visual intent;
- visual metaphor;
- evidence device;
- treatment;
- layout;
- copy zone;
- objects;
- figures.

No es necesario hacer todos los campos editables en v1.

Sí permitir editar:

- copy;
- imageIntent;
- visual metaphor;
- layout;
- treatment, cuando sea viable.

### Paso 4 — Prompts

- generar prompts;
- ver prompt;
- editar prompt;
- reconstruir prompt de un slide;
- no reconstruir todo si solo cambia un slide.

### Paso 5 — Imágenes

- generar uno;
- generar todos;
- detener entre slides;
- regenerar;
- reemplazar;
- ver historial.

### Paso 6 — Brand layer / export

- montar logo;
- montar disclaimer;
- export PNG;
- export PDF.

No meter el disclaimer en configuración del creative agent.

---

## 32. Persistencia del carrusel final

### 32.1 Contrato recomendado

```ts
export interface XendingCarouselMetaFinal {
  schemaVersion: 'xending-carousel-final-v1';

  branchSlug: XendingBranchSlug;
  branchKitVersion: string;

  presetSlug: string;
  objective: CarouselObjective;
  imageType: DesignImageType;
  background: string;

  figurePolicy: XendingCarouselFigurePolicy;
  cohesionMode: XendingCarouselCohesionMode;

  creativeRoutes: XendingCarouselCreativeRoute[];
  selectedRouteId: string;
  creativePlan: XendingCarouselCreativePlan;

  styleSpec: XendingCarouselBrandStyleSpec;
  creativeFingerprint: XendingCreativeFingerprint;

  groupId: string;
  slots: CarouselSlotFinal[];

  promptRevision: string;
  imageQuality: 'high';

  createdAt: string;
  updatedAt: string;
}
```

### 32.2 Slot

```ts
export interface CarouselSlotFinal {
  id: string;
  index: number;
  role: CarouselSlideRole;

  slideCopy: CarouselSlideCopy;
  slidePlan: XendingCarouselSlidePlan;

  brief: CarouselSlideBriefFinal;
  prompt: string;

  brandElements: Array<'logo'>;

  status: CarouselSlotStatus;
  mockupId?: string;
  imageUrl?: string;
  imageLibraryId?: string;
  error?: string;

  promptSnapshot?: XendingPromptSnapshot;
}
```

### 32.3 Backward compatibility durante la branch

Puede existir un migrador de metadata antigua a nueva forma.

No mantener dos runtimes después del cutover.

---

## 33. Migraciones y limpieza de datos

### 33.1 Antes de eliminar

Crear backup/export de:

- prompts V1;
- legacy copy kits;
- strategic configs;
- content ingredients;
- generated ideas de Design Studio;
- carruseles existentes.

### 33.2 Migración de metadata

Crear función/script:

```text
migrate-xending-carousel-meta.ts
```

Debe:

- detectar metadata vieja;
- conservar copy, prompts, URLs y mockups;
- mapear aliases;
- marcar `migratedFromLegacy: true`;
- no reconstruir imágenes;
- no inventar creative plan histórico;
- dejar campos nuevos opcionales en históricos.

### 33.3 Migración de branch slugs

```text
ahorro-costos-ocultos → costos-ahorro
pagos-con-orden → control-operativo-pagos
cobertura-cambiaria → coberturas
```

### 33.4 Eliminar runtime viejo al final

Solo después de pasar regresión:

- remover constantes;
- remover env flags;
- remover imports;
- remover dead code;
- remover UI v1;
- remover queries v1 del Design Studio;
- remover tests de fallback;
- actualizar documentación.

---

## 34. Inventario explícito de legacy a retirar

Kiro debe producir un archivo:

```text
docs/architecture/XENDING_DESIGN_STUDIO_LEGACY_REMOVAL.md
```

Con tabla:

| Símbolo/archivo | Uso actual | Reemplazo | Momento de eliminación | Eliminado |
|---|---|---|---|---|

Revisar al menos:

```text
MASTER_IMAGE_PROMPT_V1
MASTER_IMAGE_PROMPT_VERSION
MASTER_IMAGE_PROMPT_FALLBACK
MASTER_IMAGE_PROMPT_SOURCE
PROMPT_ENGINEER_SYSTEM
handleLegacyPath
useDesignCopyBank
generated_ideas Design Studio path
commercial_branches.prompt_kit runtime injection
strategic_config editorial runtime injection
content_ingredients legacy
FIGURE_SCENARIO_BY_ROLE
FX_MOMENT_LABELS universal
carouselMechanicsExamples universal
CAROUSEL_SCENE_VARIETY FX-global
visualAnchor free-text semantics
visualMotif legacy-only
reserved disclaimer block
NO BRANDING contradictory rule
textInImage dual branches in one prompt
```

No borrar algo con consumer activo sin migrarlo.

---

## 35. Testing strategy

### 35.1 Unit tests

Agregar para:

- branch alias resolution;
- modern kit precedence;
- legacy exclusion;
- effective context;
- conflict detection;
- creative route schema;
- creative plan schema;
- medium lock;
- treatment compatibility;
- max two treatments;
- role briefs abstractos;
- figure policy;
- dynamic moment count;
- arithmetic;
- document assignment;
- highlight validation;
- copy zones;
- recurrence policy;
- fingerprint similarity;
- prompt assembly;
- no contradictory text policy;
- exact copy preservation;
- Xending branding rule;
- metadata migration;
- security membership.

### 35.2 Integration tests

```text
copy → effective context → routes
route → plan → script
plan → figures → prompts
prompt → generate request
render → mockup → storage → metadata
brand layer → export
```

### 35.3 No image API en unit tests

Mockear modelo.

Validar contracts y prompts.

### 35.4 Visual regression manual

Usar un set congelado de inputs y comparar resultados.

---

## 36. Casos de regresión obligatorios

### Caso 1 — Costos / motor / infografía

```text
Cada motor también mueve tus costos
```

Esperado:

- tres rutas distintas;
- no HOY/PAGO obligatorio;
- no tres compras obligatorio;
- cifras opcionales;
- un solo medio 3D;
- no cinco motores hero;
- highlights correctos;
- texto legible;
- high.

### Caso 2 — Velocidad / fotografía / ferretería

Esperado:

- historia operativa;
- proveedor/embarque/inventario;
- no narrativa FX;
- no +1/+2;
- no compras repetidas automáticas;
- fotografía real;
- rostros no protagonistas;
- entorno natural.

### Caso 3 — Velocidad / infografía / pantallas

Esperado:

- 3D consistente;
- concepto de renovación/tiempo;
- no documentos FX genéricos;
- no ruta logística si no aporta.

### Caso 4 — Cuenta Multidivisa / financiero

Esperado:

- balances;
- monedas;
- centralización;
- dashboard/flow;
- no motor;
- no HOY/PAGO automático;
- kit activo o bloqueo si draft.

### Caso 5 — Cobertura / industria textil

Esperado:

- exposición futura;
- lenguaje condicional;
- producto correcto;
- revisión de forward si aplica;
- cifra solo si elegida.

### Caso 6 — Control Operativo

Esperado:

- estatus/roles/seguimiento según capacidades reales;
- no multidivisa genérico;
- no velocidad como mensaje principal salvo territorio seleccionado.

### Caso 7 — Banco vs Xending

Esperado:

- comparación sobria;
- no ataque;
- capacidad base explícita;
- no claims numéricos inventados.

### Caso 8 — Checklist

Esperado:

- portada + tres señales;
- señales autónomas;
- layout repetido intencional;
- critic no penaliza esa repetición.

### Caso 9 — Cronología

Esperado:

- misma operación;
- momentos variables según plan;
- no siempre tres fechas por hardcode;
- layout progresivo/repetido intencional.

### Caso 10 — Figure policy none

Esperado:

```text
0 documents
0 FX moments
0 numeric labels
0 disclaimer reservation
```

### Caso 11 — Figure policy illustrative

Esperado:

- exact arithmetic;
- structured documents;
- metadata de legal note;
- disclaimer no horneado;
- no claim de ahorro.

### Caso 12 — Imagen individual 3D

Esperado:

- conserva calidad aprobada;
- no cambia por limpieza de V1;
- high.

### Caso 13 — Imagen individual foto

Esperado:

- ambiente natural;
- sin set blanco artificial;
- no CGI;
- no rostro AI protagonista.

### Caso 14 — HTML/presentación

Esperado:

- referencia → HTML;
- iteración;
- brand layer;
- export.

### Caso 15 — Seguridad

Usuario sin membership no puede generar ni leer assets de otro business.

---

## 37. Evaluación humana

Puntaje 0–5:

| Dimensión | Pregunta |
|---|---|
| Branch fit | ¿Pertenece a la línea correcta? |
| Copy alignment | ¿La imagen demuestra el texto? |
| Visual specificity | ¿Serviría igual para otro headline? |
| Story progression | ¿Cada slide avanza? |
| Slide differentiation | ¿Anterior, actual y siguiente son distintos? |
| Medium consistency | ¿Todo el set conserva el medio? |
| Xending fit | ¿Se siente como Xending? |
| Commercial impact | ¿Atrae, conecta, explica o vende? |
| Product truth | ¿Promete capacidades reales? |
| Legibility | ¿Texto correcto y jerarquizado? |
| Color semantics | ¿Coral/turquesa aportan significado? |
| Novelty | ¿Evita repetir campañas recientes? |

Umbral recomendado:

```text
ninguna dimensión crítica < 3
total promedio >= 4
```

---

## 38. Calidad `high`, rendimiento y timeouts

### 38.1 No downgrade

El request final debe enviar `high`.

Agregar test que inspeccione payload.

### 38.2 Medir

Registrar:

- prompt build time;
- image render time;
- timeout rate;
- retries;
- total set time.

### 38.3 Si high excede límite

No cambiar a medium silenciosamente.

Opciones, en orden:

1. revisar timeout real de la versión que ya funciona;
2. separar prompt generation de render;
3. usar job asíncrono si fuera necesario;
4. permitir polling;
5. documentar retry.

La branch no debe rediseñar a job asíncrono si `high` ya funciona de forma estable.

### 38.4 Cola

Mantener secuencial inicialmente.

No paralelizar cinco imágenes sin evaluar rate limit y costo.

---

## 39. Fases de implementación

### Fase 0 — Checkpoint

- crear branch;
- confirmar high;
- congelar benchmark;
- ejecutar tests actuales;
- documentar commit base.

**DoD:** branch aislada, benchmark y quality confirmados.

### Fase 1 — Fuente canónica y legacy boundary

- resolver kits modernos;
- aliases;
- eliminar inyección dual;
- seleccionar un master prompt activo;
- separar/remover legacy image path;
- documentar legacy.

**DoD:** un request de Costos no contiene “costos ocultos” legacy.

### Fase 2 — Copy bank final

- consolidar `copy_bank_items`;
- migrar v1 útil;
- remover UI/query dual;
- reporte de migración.

**DoD:** Design Studio opera con un banco principal.

### Fase 3 — Effective Xending Context

- resolver branch;
- industry;
- objective;
- medium;
- guidance;
- conflicts;
- source trace.

**DoD:** contexto estructurado y testeado.

### Fase 4 — Creative Routes y Plan

- schemas;
- planner prompt;
- routes UI;
- auto selection;
- critic inicial;
- persistence.

**DoD:** caso motor produce tres rutas realmente distintas.

### Fase 5 — Roles, presets y ejemplos

- briefs abstractos;
- examples por preset;
- seed usage;
- layout policy.

**DoD:** checklist/timeline ya no heredan arco de cobertura.

### Fase 6 — Figures desacopladas

- remove `FIGURE_SCENARIO_BY_ROLE`;
- figure policy UI;
- registry;
- 1–4 moments;
- calculations;
- metadata legal.

**DoD:** `none` genera cero cifras; `illustrative` genera números exactos.

### Fase 7 — Style Spec, continuity y neighbor awareness

- neutral style spec;
- continuity kit;
- full plan summary;
- previous/next;
- copy zones;
- layouts V2.

**DoD:** slides intermedios no repiten automáticamente el hero.

### Fase 8 — Prompt compiler y critic final

- modular assembly;
- remove contradictions;
- prompt snapshots;
- validation/repair.

**DoD:** prompt final no contiene reglas opuestas.

### Fase 9 — Single image stabilization

- remove V1;
- canonical V2;
- branch context clean;
- text modes compiled;
- reference mode tests;
- high tests.

**DoD:** benchmarks individuales igualan o superan los actuales.

### Fase 10 — Mockups, HTML y export

- cleanup;
- replacement semantics;
- renderer env;
- brand layer;
- full delete;
- PDF.

**DoD:** set completo se guarda, marca y exporta sin residuos.

### Fase 11 — Security y observability

- JWT/membership;
- logs;
- metrics;
- prompt metadata;
- isolation tests.

**DoD:** ninguna función creativa confía solo en `business_id` del body.

### Fase 12 — Legacy removal y final regression

- borrar runtime viejo;
- borrar flags;
- borrar imports;
- actualizar docs;
- ejecutar suite;
- human review.

**DoD:** una sola arquitectura activa y Xending estable.

---

## 40. Plan de commits sugerido

```text
chore(xending-design): checkpoint active high-quality runtime
docs(xending-design): add final architecture and benchmark plan
refactor(xending-copy): resolve one canonical branch kit
refactor(xending-copy): migrate Design Studio to copy_bank_items
refactor(xending-image): remove V1 master prompt and legacy fallback
feat(xending-context): add effective creative context and conflict checks
feat(xending-carousel): add creative route contracts and planner
feat(xending-carousel): persist creative plan and fingerprints
refactor(xending-carousel): make roles narrative-only
refactor(xending-carousel): add preset-specific examples
feat(xending-carousel): decouple figures from roles
feat(xending-carousel): add dynamic figure registry
feat(xending-carousel): add neutral style spec and continuity kit
feat(xending-carousel): add neighbor-aware prompt generation
feat(xending-carousel): add copy zones and layout v2
feat(xending-carousel): add creative critic and repair pass
refactor(xending-prompts): compile contradiction-free prompt modules
refactor(xending-image): unify individual image runtime on canonical V2
fix(xending-security): enforce membership on creative edge functions
fix(xending-mockups): add replace/delete cleanup semantics
fix(xending-export): use renderer config and brandized assets
feat(xending-observability): persist prompt and creative metadata
test(xending-design): add final regression suite
refactor(xending-design): remove legacy runtime and flags
docs(xending-design): document final runtime and removed legacy
```

No es obligatorio usar exactamente estos commits, pero sí mantener cambios revisables.

---

## 41. Criterios de aceptación

La branch se considera terminada únicamente cuando:

1. Se creó desde la versión activa con `high`.
2. `high` sigue en payload y pruebas.
3. Existe una sola versión activa del master prompt.
4. V1 no participa en runtime.
5. No existe fallback silencioso al prompt viejo.
6. Costos usa exclusivamente su kit moderno.
7. Ningún kit moderno se concatena con `prompt_kit` legacy.
8. El Design Studio usa `copy_bank_items` como fuente principal única.
9. Las seis ramas canónicas existen como kits tipados.
10. Las ramas incompletas están draft y no inventan claims.
11. El agente genera tres rutas creativas distintas.
12. Existe un Creative Plan persistido.
13. Los roles no fijan escenas.
14. `FIGURE_SCENARIO_BY_ROLE` fue eliminado del runtime.
15. Un carrusel puede usar cero cifras.
16. Una historia puede usar 1–4 momentos.
17. Cualquier cifra se calcula en código.
18. No se hornea disclaimer.
19. No se reserva banda inferior para disclaimer.
20. El logo no se genera mediante AI.
21. El set mantiene un solo medio.
22. Auto usa máximo dos tratamientos compatibles.
23. Las referencias visuales no son una taxonomía cerrada.
24. El style spec no contiene escena.
25. El Prompt Translator recibe el plan completo.
26. Cada slide conoce anterior y siguiente.
27. La política de recurrencia es explícita.
28. El texto no está obligado a ir siempre arriba.
29. `split_photo` dejó de ser una limitación semántica del medio.
30. No existe contradicción `textInImage=false/true`.
31. No existe contradicción `NO BRANDING` vs copy con Xending.
32. No existe contradicción motif bookend/every slide.
33. El critic detecta repetición accidental.
34. Checklist y cronología conservan repetición intencional.
35. Velocidad no recibe automáticamente FX.
36. Multidivisa no recibe automáticamente HOY/PAGO.
37. Banco vs Xending no ataca a bancos.
38. Las imágenes individuales mantienen su calidad.
39. HTML/presentaciones siguen funcionando.
40. Mockups y Storage no dejan residuos graves.
41. Export usa configuración correcta.
42. Todas las Edge Functions creativas validan membership.
43. Los tests automatizados pasan.
44. El benchmark visual es aprobado.
45. El runtime viejo fue eliminado.
46. No se hizo merge automático.

---

## 42. Definition of Done

### Código

- [ ] Branch aislada.
- [ ] Build correcto.
- [ ] TypeScript sin errores.
- [ ] Lint sin errores nuevos.
- [ ] Tests pasan.
- [ ] Edge Functions deployables.
- [ ] Migraciones revisadas.
- [ ] Sin secretos.

### Contexto y copy

- [ ] Un kit efectivo por rama.
- [ ] Legacy excluido.
- [ ] Aliases migrados.
- [ ] Banco v2 canónico.
- [ ] Copys aprobados preservados.
- [ ] Ramas draft bloqueadas.

### Carrusel

- [ ] Rutas creativas.
- [ ] Creative Plan.
- [ ] Roles abstractos.
- [ ] Figures desacopladas.
- [ ] 1–4 momentos.
- [ ] Medium lock.
- [ ] Dos treatments máximo.
- [ ] Style spec neutral.
- [ ] Continuity kit.
- [ ] Neighbor awareness.
- [ ] Critic.
- [ ] Prompt modular.
- [ ] High.

### Imagen individual

- [ ] V1 eliminado.
- [ ] V2 canónico.
- [ ] Foto aprobada.
- [ ] 3D aprobado.
- [ ] Financiero aprobado.
- [ ] Mapa/ruta aprobado.
- [ ] Reference mode aprobado.

### Brand/export

- [ ] Logo por overlay.
- [ ] Disclaimer por HTML/export.
- [ ] No disclaimer en prompt.
- [ ] PDF aprobado.
- [ ] PNG aprobado.
- [ ] Brandized carousel aprobado.

### Seguridad

- [ ] JWT.
- [ ] Membership.
- [ ] Business isolation.
- [ ] Feedback isolation.
- [ ] Asset isolation.

### Limpieza

- [ ] V1 runtime eliminado.
- [ ] Flags V1/V2 eliminados.
- [ ] Copy bank v1 retirado del flujo.
- [ ] Legacy branch prompts retirados.
- [ ] Dead code eliminado.
- [ ] Documentación actualizada.

---

## 43. Instrucción operativa resumida para Kiro

Kiro debe ejecutar esta branch con la siguiente regla:

> **No reconstruyas la plataforma. Conserva generación, sesiones, mockups, Storage, HTML, exportación y cola. Elimina las fuentes legacy y reconstruye la capa que decide contexto, historia, evidencia y prompt.**

Orden obligatorio:

1. Verificar branch base y `high`.
2. Crear checkpoint.
3. Crear este documento en el repo.
4. Congelar benchmark.
5. Unificar kits.
6. Migrar banco v2.
7. Crear Effective Xending Context.
8. Crear Creative Routes y Plan.
9. Desacoplar roles y cifras.
10. Crear style spec neutral y continuity kit.
11. Hacer prompts set-aware.
12. Agregar critic.
13. Estabilizar imagen individual.
14. Estabilizar mockups/HTML/export.
15. Corregir seguridad.
16. Ejecutar regresión.
17. Eliminar legacy.
18. Entregar sin merge.

---

## 44. Entrega final requerida a Kiro

Al terminar, responder con:

1. Branch creada.
2. Commit base.
3. Commit de checkpoint.
4. Quality efectiva confirmada.
5. Lista de commits.
6. Lista de archivos modificados.
7. Migraciones creadas.
8. Kits activos por rama.
9. Ramas draft pendientes.
10. Diagrama del flujo final.
11. Tipos nuevos.
12. Legacy eliminado.
13. Tests ejecutados.
14. Resultados por caso de regresión.
15. Tres rutas del caso motor.
16. Comparación antes/después.
17. Capturas o URLs de benchmark.
18. Tiempos de generación high.
19. Riesgos pendientes.
20. Confirmación de que no hizo merge.
21. Confirmación de que no modificó la branch estable original.

---

# APÉNDICE A — Mapa AS-IS → TO-BE

| AS-IS | TO-BE Xending Final |
|---|---|
| Dos copy banks | `copy_bank_items` canónico |
| V1 + V2 | una versión activa |
| code/DB prompt source ambiguo | fuente canónica versionada |
| kit moderno + prompt legacy | un kit efectivo |
| `FIGURE_SCENARIO_BY_ROLE` | `figureSpec` en Creative Plan |
| HOY/PAGO automático | evidence elegida por historia |
| tres compras automáticas | 1–4 momentos opcionales |
| `visualMotif` string | `ContinuityKit` |
| `visualAnchor` libre | `BrandStyleSpec` neutral |
| slide aislado | full plan + neighbors |
| texto siempre arriba | `copyZone` por slide |
| layouts ligados a medio | layouts editoriales neutrales |
| ejemplos de cobertura universales | ejemplos por preset/rama |
| `NO BRANDING` absoluto | copy exacto permitido, logo prohibido |
| dual text policy | solo política activa |
| disclaimer en prompt/space | metadata + HTML/export |
| feedback genérico | scope por rama/medio/formato |
| repetición sin memoria | creative fingerprint |
| seguridad inconsistente | JWT + membership uniforme |

---

# APÉNDICE B — Ejemplo de flujo final del caso motor

```text
Seed copy
Cada motor también mueve tus costos

Context
Branch: Costos y Ahorro
Industry: motores/refacciones
Objective: conectar
Medium: infografia
Background: white-xending-v2
Figure policy: auto
Cohesion: auto
```

## B.1 Routes

```json
{
  "routes": [
    {
      "id": "cost-anatomy",
      "title": "Anatomía del costo",
      "premise": "El motor tiene un precio visible y componentes financieros que completan su costo",
      "storyEngine": "object_anatomy",
      "primaryTreatment": "industrial_3d_product",
      "secondaryTreatment": "document_3d",
      "figurePolicy": "optional"
    },
    {
      "id": "order-to-payment",
      "title": "De la orden al pago",
      "premise": "La misma compra atraviesa etapas antes de convertirse en un costo final en pesos",
      "storyEngine": "operational_timeline",
      "primaryTreatment": "operational_diorama_3d",
      "secondaryTreatment": "document_3d",
      "figurePolicy": "recommended"
    },
    {
      "id": "industrial-volume",
      "title": "Volumen industrial",
      "premise": "El impacto se vuelve relevante cuando una operación se repite a escala",
      "storyEngine": "scale_progression",
      "primaryTreatment": "industrial_3d_product",
      "secondaryTreatment": "macro_3d_detail",
      "figurePolicy": "none"
    }
  ],
  "recommendedRouteId": "cost-anatomy"
}
```

## B.2 Plan

El plan recomendado no tiene que utilizar HOY/PAGO.

Puede decidir:

```text
Slide 1 → motor + etiqueta de compra
Slide 2 → despiece conceptual de componentes del costo
Slide 3 → varias unidades/pallets mostrando escala
Slide 4 → comparación/cotización clara
Slide 5 → hero de cierre
```

Si el planner decide usar cifra:

- la cifra se calcula en código;
- se asocia a un slide;
- no fuerza a otro slide a usar otro documento;
- el disclaimer queda como metadata.

---

# APÉNDICE C — Ejemplo de figure plan dinámico

```ts
const figureSpec: XendingCarouselFigureSpec = {
  enabled: true,
  scenarioId: 'fx_two_moment',
  momentCount: 2,
  comparisonBase: 0,
  labels: ['HOY', 'PAGO'],
  dateOffsets: [0, 60],
  assumptions: {
    baseRate: 18.2,
    amountUsd: 10000,
    driftPct: [2],
  },
};
```

Otro carrusel puede usar:

```ts
{
  enabled: false,
  scenarioId: 'none'
}
```

Otro:

```ts
{
  enabled: true,
  scenarioId: 'fx_timeline',
  momentCount: 4,
  dateOffsets: [0, 30, 60, 90]
}
```

El role no participa en esa decisión.

---

# APÉNDICE D — Prompt stack final

```text
SYSTEM: Xending Carousel Prompt Translator

MODULE 1 — Medium rules
MODULE 2 — Brand Style Spec
MODULE 3 — Set plan summary
MODULE 4 — Continuity rules
MODULE 5 — Current slide + neighbors
MODULE 6 — Exact copy
MODULE 7 — Exact highlights
MODULE 8 — Exact structured figures
MODULE 9 — Layout and copy zone
MODULE 10 — Avoid

OUTPUT
sceneBlock
promptFinal
validationSummary
```

No incluir:

- copy bank completo;
- rama legacy;
- todos los examples;
- textInImage=false;
- disclaimer;
- escena del anchor;
- instrucciones de otro medio.

---

# APÉNDICE E — Matriz de las seis ramas

| Rama | Estado esperado | Visuales principales | Cifras | Riesgo principal |
|---|---|---|---|---|
| Velocidad | active | proveedor, confirmación, puerto, inventario, tiempo | opcionales, no FX por default | prometer mismo día universal |
| Costos y Ahorro | active | cotización, costo total, margen, comparación | limitadas y calculadas | claims de ahorro/banco |
| Cuenta Multidivisa | active o draft bloqueado | wallet, balances, monedas, dashboard | saldo/monedas solo con facts | inventar capacidades |
| Coberturas | active | obligación, fecha, presupuesto, exposición | ejemplos FX válidos | producto/legal |
| Control Operativo | active o draft bloqueado | usuarios, estatus, autorización, trazabilidad | métricas solo con facts | confundir con Multidivisa |
| Banco vs Xending | active o draft bloqueado | dos modelos operativos | solo datos verificados | ataque o comparación falsa |

---

# APÉNDICE F — Preguntas que Kiro debe resolver antes de codificar

1. ¿Cuál es exactamente la branch/commit con `high`?
2. ¿Qué callers activos usan `handleLegacyPath`?
3. ¿Qué filas útiles siguen solo en `generated_ideas`?
4. ¿Qué kits modernos están completos y aprobados?
5. ¿Qué capacidades reales sostienen Cuenta Multidivisa?
6. ¿Qué capacidades reales sostienen Control Operativo?
7. ¿Banco vs Xending tiene copy bank final o sigue draft?
8. ¿El logo se reserva siempre en portada o depende del template?
9. ¿Qué path de exportación es el oficial: directo o brandized composer?
10. ¿Qué timeout permite la versión `high`?
11. ¿Qué funciones creativas no validan membership?
12. ¿Qué partes de `PROMPT_ENGINEER_SYSTEM` tienen consumers reales?

Las respuestas deben documentarse en el TO-BE implementado, no resolverse mediante supuestos silenciosos.

---

# Cierre

Esta branch tiene una misión concreta:

> **Terminar Xending con una sola fuente editorial, una sola versión visual, un carrusel realmente creativo, cifras elegidas por la historia, prompts sin contradicciones, calidad high y una operación estable de imagen a exportación.**

No es todavía Design Studio OS.

Sí debe ser la versión de Xending que Design Studio OS tomará como benchmark funcional cuando comience la segunda branch.
