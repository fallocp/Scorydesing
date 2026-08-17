# Handoff — estado del branch y qué sigue

Contexto para continuar en una sesión nueva. Branch `feat/xending-design-studio-final`.

---

## 1. Qué es este branch

Reconstruir el núcleo creativo del Design Studio de Xending conservando la fábrica que ya
funciona. La especificación completa está en
`docs/architecture/XENDING_DESIGN_STUDIO_FINAL_TO_BE.md` (3,713 líneas), y las decisiones
tomadas sobre ella en `docs/architecture/XENDING_DESIGN_STUDIO_DECISIONS.md`.

**El criterio de cierre de la Fase 1 sigue sin cumplirse** y es lo único que falta:

> un request de Costos no debe contener el ángulo legacy de "costos ocultos"

---

## 2. Lo que está commiteado (13 commits)

```
3700d7c  docs: update baseline after type regeneration and lint setup
dee7538  fix(lint): clear the nine blocking lint errors
056206c  fix(types): declare CopyWorkstation saved designs and ideas shape
419bd42  fix(types): regenerate supabase types with the 9 missing tables
91790be  chore(lint): add eslint flat config, pinned deps and type-check script
c1e32ec  docs: resolve pending decisions on draft branches, types and migration timing
adea8ee  refactor(xending-copy): add branch slug identity migration (not applied)
7996fe2  docs: record branch decisions on quality, lint, draft branches and slugs
8d1cefd  docs: answer appendix F preflight questions with code evidence
71f483e  docs: add Xending Design Studio final TO-BE specification
3d5adf0  docs: record type-check, test and lint baseline for branch
9db44c8  docs: add carousel prompt dumps as audit evidence
e345f02  docs: add carousel AS-IS audit
```

Base `8fb80f3` de `feat/design-studio-content-modes`. Nada pusheado. Un stash previo intacto.

---

## 3. Lo que NO está commiteado — pedido expreso del usuario

**Recomendé un checkpoint y el usuario prefirió esperar. Ofrecerlo de nuevo antes de tocar más
código.**

Modificado, ~880 líneas:

| Archivo | Qué cambió |
| --- | --- |
| `_shared/buildCopyPromptV2.ts` | +575: 12 interfaces nuevas, 19 campos en `CopyKit`, `buildBranchSection` reordenada y renderizando los campos v3, `batch_policy` en la sección de distribución, `numbers_policy` en prosa |
| `_shared/validateCopyV2.ts` | +220: 5 reglas nuevas, `ctaBannedFor` suma rama + corredor, capacidad detectada en subline **o** CTA, disclaimer fuera |
| `_shared/analyzeCopyBank.ts` | +21: estrena todos los ángulos antes de repetir ninguno |
| `scripts/analyze-copy-bank.test.ts` | +53: test que fija ese comportamiento |
| `docs/prompts/masterCopyPrompt_v2.md` | 12 líneas: disclaimer fuera del contrato |

Sin trackear:

```
scripts/build-kit-v3-costos.mjs                          conversor v2 -> v3
scripts/build-kit-v3-velocidad.mjs                       conversor v2 -> v3
_shared/copy-kits/costos-ahorro.v3.json                  16/16 campos, 43 totales
_shared/copy-kits/velocidad.v3.json                      16/16 campos, 50 totales
docs/prompts/copy-banks/_contexto-editorial.costos-ahorro.v3.md
docs/prompts/copy-banks/_contexto-editorial.velocidad.v3.md
docs/architecture/_review/                               4 documentos de revisión
```

**Los dos kits v3 están aprobados por el usuario pero NO activos.** El runtime sigue en v2. Se
activan copiando el `.v3.json` sobre el `.json`, y para probar se revierte con
`git checkout -- <ruta>`.

---

## 4. Regla crítica de trabajo

Los `*.v3.json` son **artefactos generados**. Toda edición va al conversor `.mjs`, nunca al
JSON. El usuario editó el JSON directamente una vez y sus cuatro premisas se habrían perdido en
la siguiente regeneración; están ahora en `angulosCorregidos` dentro del script de velocidad.

Verificación estándar tras cualquier cambio:

```powershell
node scripts/build-kit-v3-velocidad.mjs
npx --no-install vitest --run scripts/copy-v2-smoke.test.ts
npm run test
node node_modules/typescript/bin/tsc -b
```

Para volcar los prompts compuestos: `$env:COPY_DUMP='1'` antes del smoke test. Escribe a
`docs/prompts/_generated/` (gitignored).

**Línea base a no empeorar:** 84 errores de `tsc`, 0 errores de lint (404 avisos), 1074 tests.

---

## 5. Lo que sigue: tercera pieza de la Fase B

El agente de carrusel todavía lee el bloque legacy. Concretamente:

`generate-carousel-script/index.ts` llama a
`buildBranchContextBlock(branch.prompt_kit, branch.strategic_config, branch.name)`, y esa
función usa `prompt_kit` cuando existe **sin mirar nunca el kit moderno**. Para la rama de
costos ese bloque mide 7,004 caracteres y contiene, medido:

- "Xending revela y elimina los costos ocultos que los bancos tradicionales esconden"
- "Ahorro de hasta 70% vs costos bancarios promedio" **listado como claim permitido**
- "El foco debe estar en COSTOS OCULTOS, TRANSPARENCIA y AHORRO REAL"
- "Las empresas pagan 2-4% más de lo que creen en cada operación"
- lenguaje visual con "lupa revelando costos ocultos" e "iceberg"

De sus 19 secciones, **17 contienen frases que el kit moderno prohíbe**. El arreglo no es borrar
el dato de la base, es dejar de leerlo cuando la rama tiene kit.

Las tres tareas:

1. **`buildBranchContextFromKit`** con el subconjunto que aplica al carrusel. `batch_policy` NO
   va: gobierna una tanda de 30 y un carrusel son 5 slides de un copy ya aprobado.
2. **Dejar de inyectar `prompt_kit`** cuando la rama resuelve kit. Las tres ramas draft
   (`cuenta-multidivisa`, `control-operativo-pagos`, `banco-vs-xending`) lo conservan porque es
   lo único que tienen.
3. **Filtrar los ejemplos por rama y ángulo.** Hoy `carouselMechanicsExamples(preset, objective)`
   inyecta ejemplos de **coberturas** en un carrusel de costos, y existe una sección entera
   llamada `## PROHIBIDO REUSAR ESTAS LÍNEAS` con seis frases "QUEMADAS" que es un parche para
   pelear con eso. Al filtrar, el parche se puede retirar.

Evidencia del estado actual, con números de línea:
`docs/architecture/carousel-prompt-dumps/cobertura-motor-infografia/07-create-script-system-prompt.txt`
— 32,493 caracteres. El bloque legacy son las líneas **333 a 490**. Las prohibiciones del kit
moderno están justo antes, en 286-332: ahí se ve la contradicción pegada.

**Ojo con el tamaño.** El prompt de copys pasó de 21,455 a 33,532 en costos y de 20,210 a
36,770 en velocidad. El de carrusel ya mide 32,493 y va a sumar su propia capa. Medir antes y
después.

---

## 6. Decisiones ya tomadas que no hay que volver a discutir

- **`imageQuality` se queda en `medium`.** `high` no funciona sincrónicamente: `fetchWithRetry`
  aborta a 110s y `high` a 1024² no regresa dentro de ese techo. Volver a `high` exige render
  asíncrono, fuera de alcance. Anula §4.10, §41.2 y §38.1 del TO-BE.
- **El disclaimer sale del motor creativo por completo.** Sin `disclaimerKey`, sin
  `needsLegalNote` automático, sin columnas nuevas. El usuario lo monta a mano porque cambia las
  frases. `needsLegalNote` y `legalNote` van siempre en `false` y `null`, y se conservan en el
  contrato solo para no romper el validador ni el panel.
- **No hay migración de `copy_bank_items`.** Se descartó `claim_type` y `review_status`.
- **Las tres ramas draft siguen operativas**, marcadas draft, sin bloqueo. Anula §7.6.
- **La migración de slugs** `20260816_xending_branch_slug_identity.sql` está escrita y **no
  aplicada**. Corre en el mismo deploy que el cambio de código. Alcance medido: 2 filas de
  `commercial_branches`, 0 de `design_sessions`, 17 de `design_mockups`, 2 de `design_feedback`.
- **`velocidad` y `coberturas` conservan `legal_note` en su JSON** como dato inerte: el
  constructor dejó de leerlo. Se borra cuando les toque su v3.
- **Coberturas v3 no está hecho.** Es el más delicado por los forwards y productos regulados.
  El checklist de lo que necesita está en
  `docs/architecture/_review/PLANTILLA_CONTEXTO_EDITORIAL_v3.md`.

---

## 7. Hallazgos que conviene no perder

- **La migración `20260811` nunca tuvo efecto.** Reescribió `strategic_config` para quitar el
  ángulo de costos ocultos, pero `buildBranchContextBlock` usa `prompt_kit` cuando existe y
  nunca cae a `strategic_config`. Está inerte desde que se aplicó.
- **Seis migraciones nunca se aplicaron** a la base conectada: `custom_templates`,
  `asset_snapshots`, `creative_profiles`, `learning_deltas`, `template_registry`,
  `trigger_templates`. Sus 27 errores de tipos son deuda declarada. El código las consulta.
- **`scope` era dato muerto**: estaba en el JSON, no en la interfaz, y ningún prompt lo leía.
- **Tres bugs del validador salieron de medir contra los 180 copys aprobados**, no de leer
  código: la capacidad puede vivir en el CTA (37 falsos positivos en costos), el CTA viene de un
  banco cerrado y no debe escanearse por disparadores (15 en velocidad), y el tope de tanda
  mixta no aplica a una tanda de un solo corredor (1). Después de arreglarlos: cero falsos
  positivos, y la contraprueba confirma que sí atrapan lo malo.
- **Medir contra el banco antes de confiar en una regla.** Es el hábito que más valor dio en
  toda la sesión.

---

## 8. Cosas del usuario que están abiertas

- Revisar la segunda mitad de la regla dura de seguimiento en velocidad, que delimita por
  exclusión: notificación proactiva al proveedor, hora estimada de acreditación y visibilidad
  del banco intermediario. Si alguna **sí** existe, hay que sacarla.
- Redactar el contexto editorial de coberturas.
- Decidir si se aplica la migración de slugs junto con la tercera pieza.
