# Decisiones de la branch `feat/xending-design-studio-final`

Registro de decisiones tomadas sobre el documento TO-BE, con su efecto en los criterios de
aceptación. Existe para que el Definition of Done no se evalúe contra criterios que fueron
modificados a propósito.

## D1 — La calidad de imagen se queda en `medium`

**Decisión:** no se implementa `high` en esta branch.

**Razón:** el TO-BE §4.10 y §41.2 asumen que `high` es una versión activa que solo hay que no
degradar. El preflight demostró que no existe: `high` a 1024² no regresa dentro de los 110s
que `fetchWithRetry` se concede antes del gateway, y el propio código concluye que volver a
`high` exige que el render deje de ser una petición sincrónica. Las imágenes en `medium` ya
tienen la calidad aprobada.

**Efecto en los criterios:**

- §41.2 ("`high` sigue en payload y pruebas") queda **anulado**.
- §1.2 ("la branch debe salir de la versión activa con `high`") queda **anulado**: la branch
  sale de `8fb80f3`, que usa `medium`.
- §38.1 ("el request final debe enviar `high`") queda **anulado**.
- §38.3 no aplica: no se rediseña a job asíncrono.
- Se conserva §38.2: seguir midiendo tiempos de render.

**Reversibilidad:** alta. El cambio es una línea en `useCarouselQueue.ts:793`, pero requiere
antes mover el render a un job asíncrono con polling. Queda documentado como trabajo futuro,
fuera de esta branch.

## D2 — ESLint se instala con configuración

**Decisión:** instalar ESLint y crear su configuración, en vez de retirar el script muerto.

**Razón:** el script `lint` de `package.json` invoca `eslint`, que no está instalado ni
declarado en `devDependencies`, y no existe archivo de configuración. El DoD §42 pide "Lint
sin errores nuevos", que hoy no es verificable.

**Pendiente de acordar:** versiones exactas a fijar y si el umbral arranca en
`--max-warnings 0` sobre una base que nunca pasó por lint.

## D3 — Las tres ramas sin kit se completarán, pero no en esta branch

**Decisión:** `cuenta-multidivisa`, `control-operativo-pagos` y `banco-vs-xending` se
completarán con contexto maestro, banco de copys y kit aprobado más adelante. Esta branch
solo construye el andamiaje: schema, estado `draft` y bloqueo.

**Razón:** el TO-BE §7.6 prohíbe llenar huecos con claims inferidos. Hoy las tres están
activas en el selector y generan carrusel apoyadas solo en `prompt_kit` legacy;
`banco-vs-xending` genera comparativas sin ningún bloque de prohibiciones moderno.

**Efecto:** los criterios §41.9 y §41.10 se cumplen con las seis ramas tipadas y tres en
`draft`. La branch queda lista para activarlas al pegar los bancos aprobados, sin volver a
tocar el agente.

## D4 — Identidad de rama: el slug de la base absorbe el slug del kit

**Decisión:** renombrar dos slugs y un nombre visible para que rama y kit compartan
identificador.

| Antes | Después |
| --- | --- |
| slug `ahorro-costos-ocultos`, nombre "Ahorro / Costos Ocultos" | slug `costos-ahorro`, nombre "Costos y Ahorro" |
| slug `cobertura-cambiaria`, nombre "Cobertura Cambiaria" | slug `coberturas`, nombre "Cobertura Cambiaria" |

Los otros cuatro slugs ya coinciden con los canónicos del TO-BE §7.3.

**Razón adicional al alineamiento:** el nombre de la rama viaja al prompt como parámetro de
`buildBranchContextBlock`, y "Ahorro / Costos Ocultos" contiene la frase que el kit moderno
prohíbe. `prompt_kit.branch_name` repite el mismo texto y `prompt_kit.positioning` declara
"Xending revela y elimina los costos ocultos que los bancos tradicionales esconden". La
migración `20260811_fix_costos_branch_editorial_compliance.sql` corrigió el editorial pero
dejó el nombre, así que la frase prohibida sigue entrando por esa puerta.

**Impacto:** bajo. La llave entre tablas es `commercial_branches.id` (UUID), no el slug, así
que ninguna relación se rompe. Se toca:

- una migración nueva de rename (las tres históricas no se editan);
- `copyKitRegistry.ALIASES` conserva los alias viejos para datos existentes;
- `resolveBranchForKitSlug` pasa a acertar por slug exacto en vez de caer al regex;
- el fixture de `src/types/__tests__/copy-bank.test.ts:180`.

**Efecto en los criterios:** el alias `pagos-con-orden → control-operativo-pagos` del §7.4 se
retira: la base activa ya usa `control-operativo-pagos` y nunca contuvo `pagos-con-orden`.

## D5 — Errores de tipos preexistentes

**Pendiente de decisión.** La base tiene 152 errores de `tsc -b` (ver `BRANCH_BASELINE.md`),
mientras el DoD §42 pide "TypeScript sin errores". Opciones: declararlos deuda y medir solo
que no aumenten, o limpiar al menos `templateAssembler.ts` y `VisualSelections`, que se
cruzan con los contratos nuevos.
