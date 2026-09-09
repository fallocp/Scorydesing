# Handoff — Xending USA

> Contexto autocontenido para migrar Xending USA en una sesión nueva. No hace falta
> leer nada más que este documento y los 5 MD que cita.
>
> Estado al cierre: el tenant y el guard de slug están escritos. El banco de copys, los
> kits y las rutas narrativas no.

---

## 1. Qué es Xending USA

Un mercado nuevo, hermano de Xending México. Comparte infraestructura y sistema visual;
no comparte capa editorial.

**Regla dura: el material de USA y el de México no se mezclan.** Ni copys, ni kits, ni
mockups.

### Los 5 MD fuente

Todos en `docs/`, versión `xending-usa-master-v2.0`, `scope: USA; Texas y California`.

| MD | `branch_id` | Activos | Aprob. ES | Pend. ES | Aprob. EN-US | Prefijos de ID |
|---|---|---|---|---|---|---|
| `01_xending_usa_plataforma_multidivisa_master_v2.md` | `PLATAFORMA_MULTIDIVISA` | 47 | 43 | 4 | 0 | `INT-`, `MULTI-`, `VEL-` |
| `02_xending_usa_velocidad_mismo_dia_master_v2.md` | `VELOCIDAD` | 37 | 35 | 2 | 0 | `VEL-` |
| `03_xending_usa_costos_ahorro_master_v2.md` | `COSTOS_AHORRO` | 70 | 70 | 0 | 0 | `FX-`, otros |
| `04_xending_usa_masivos_automatizacion_master_v2.md` | `MASIVOS_AUTOMATIZACION` | 64 | 59 | 5 | 0 | `VEL-`, otros |
| `05_xending_usa_coberturas_forwards_opciones_master_v2.md` | `COBERTURAS_FORWARDS` | 45 | 15 | 30 | 0 | `OPC-`, otros |
| **Total** | | **263** | **222** | **41** | **0** | |

Estructura de cada MD: secciones 1–17 son la capa común (idénticas en los cinco), 18 en
adelante es el conocimiento de la rama, y después el banco completo.

**Los prefijos de ID no indican rama.** El usuario reubicó piezas conservando su ID:
`VEL-32/34/38/39/45` viven en Masivos, `VEL-37/42/43` en Plataforma. La rama es el MD
donde está el registro, no su prefijo.

---

## 2. Decisiones ya tomadas — no reabrir

| Decisión | Resultado |
|---|---|
| ¿Tenant separado o solo cambiar el logo? | **Tenant separado.** Los registries de kits resuelven por slug de rama sin mirar tenant, así que sin separación los mockups se mezclan |
| ¿Hermano o hijo de Xending? | **Hermano.** Sin `parent_business_id`. Heredar exigiría volver recursivas las políticas RLS (la membresía es por negocio) para heredar ~15 filas estáticas. Cuando duela, se promueve a `business_id IS NULL`, que es el patrón que ya usa `template_registry` |
| ¿Sistema visual propio? | **No. Compartido.** El §10 de los MD ("empresarial premium, fondo claro, materiales reales, navy para texto") describe el `white-xending-v2` que ya existe. Nivel 1 + nivel 2: mismas reglas visuales globales, distinto repertorio de objetos por rama |
| ¿OPC-13 a OPC-15 bloqueados? | **Liberados.** Entran como `proposed` normal |
| ¿Compliance distinto? | Los absolutos van al tenant; las muletillas del §5 al copy kit por rama. Ver §5 de este doc |
| ¿EN-US? | **Sin decidir.** Ver §7 |

---

## 3. Ya está hecho

### 3.1 Seed del tenant — `supabase/migrations/seed_20260908_xending_usa_tenant.sql`

**Escrito, sin aplicar.**

UUIDs fijos, sin colisión con `xending` (`...0001`) ni `xending_capital` (`...0002`):

| Entidad | Prefijo |
|---|---|
| Tenant | `a0000000-0000-0000-0000-000000000003` |
| Categorías | `cd000000-…` |
| Ramas | `bd000000-…` |
| Verticales | `ed000000-…` |
| Canales | `c3000000-…` |
| Ángulos | `a3000000-…` |
| Master prompt | `dd000000-…` |

Contenido: tenant `xending-usa` con la paleta y tipografía de Xending (mismo sistema
visual), 2 categorías, 5 ramas, 8 verticales del §7, 7 canales, 6 ángulos, y un master
prompt v1 con la capa común de los §1–§17.

Tres cosas deliberadas:

- **`disclaimer` y `short_disclaimer` en NULL.** El §8 saca el disclaimer del copy y lo
  monta en la capa de publicación, y la razón social de la entidad USA no está en los
  MD. Inventarla sería justo lo que los MD prohíben.
- **`strategic_config = '{}'` en las 5 ramas.** La columna es NOT NULL. Va vacía porque
  toda la capa editorial vive en el copy kit; sembrar contenido ahí lo pondría a
  competir con el kit, que es el error que cometieron las ramas de México.
- **Sin `prompt_kit`.** Misma razón.

Pendiente tras aplicar, y no se resuelve desde el SQL:
1. `logo_url` — se sube desde `BusinessAdminPage`
2. `disclaimer` — requiere la ficha legal de la entidad USA
3. **Insertar en `user_business_memberships`**, o RLS oculta el tenant entero

### 3.2 Guard de mercado — `supabase/functions/_shared/branchSlug.ts`

**Hecho.** Tres cambios:

- Salieron los alias `"cuenta-multidivisa-usa": "cuenta-multidivisa"` y
  `"velocidad-same-day": "velocidad"`, que mapeaban nombres de USA sobre kits de México.
- `MARKET_SUFFIXES = ["usa"]` + `hasMarketSuffix()`.
- Corte antes de la coincidencia laxa: un slug con sufijo de mercado que no resuelva
  exacto devuelve `null` en vez de caer en el regex. Sin esto, `costos-ahorro-usa` caía
  en `/costo|ahorro/` y recibía el kit de México, **sin error y sin aviso**.

Consecuencia hoy: los 5 slugs `-usa` **no** están en `BRANCH_KIT_SLUGS`, así que
`getCopyKit` lanza con la lista de kits disponibles y `generate-carousel-plan` responde
400. Es el comportamiento correcto hasta que los kits existan.

---

## 4. Pendiente — el trabajo real

### 4.1 Ingest de los 263 copys a `copy_bank_items`

Hay que escribir un parser MD → SQL seed. Los cinco MD tienen formato regular.

**Estructura de cada registro:**

```markdown
### FX-01

**Estado ES:** APROBADO
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO
**Tratamiento:** CONSERVADO
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Rodamientos por cientos. El tipo de cambio también se refleja en el costo por pieza.

**Apoyo:** Una segunda cotización permite comparar cuántos dólares necesitas para liquidar el pedido en yenes.

**CTA:** Reduce tus costos

#### English — US · pendiente de aprobación
**Headline:** Hundreds of bearings. The exchange rate affects the cost of every piece.

**Supporting copy:** A second quote shows how many dollars you'll need to pay the yen invoice.

**CTA:** Lower your payment costs

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Costos y ahorro |
| Subfamilia actual | CONVERSION_Y_COSTO |
| Ángulo | Escala por pieza |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Rodamientos |
| País / destino del escenario | Japón |
| Moneda de factura o fondeo | JPY |
| Empresa que paga | — |
| Visual hook | Rodamiento individual que se repite en cajas junto a factura en yenes. |
| Validación interna | BASE_USUARIO; VALIDAR_DESTINO_MONEDA; VALIDAR_COMPARATIVO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | ... |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Tipo de cambio y conversión |
| Archivo / referencia histórica | ... |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
```

Notas del parser:
- Los `**Campo:**` de estado terminan en dos espacios (salto de línea markdown).
- `—` significa vacío en la ficha, no el carácter literal.
- Separador entre registros: `---` en línea propia.
- El bloque EN-US puede faltar o estar marcado como heredado; nunca está aprobado.

**Mapeo a `copy_bank_items`:**

| Columna | Origen |
|---|---|
| `business_id` | `a0000000-0000-0000-0000-000000000003` |
| `branch_slug` | El slug `-usa` de la rama del MD (tabla en §6) |
| `headline` | `**Titular:**` |
| `subcopy` | `**Apoyo:**` |
| `cta` | `**CTA:**` (el del bloque Español) |
| `industry` | Ficha → `Industria / contexto` |
| `corridor` | Derivar de `País / destino del escenario` + `Moneda de factura` |
| `angle_label` | Ficha → `Ángulo` |
| `angle_tag` | Slug del ángulo, contra los `angles` del copy kit de la rama |
| `status` | Ver mapeo abajo |
| `source` | `'seed'` |
| `kit_version` | La del copy kit USA de la rama |

**Mapeo de estados:**

| Estado ES en el MD | `status` |
|---|---|
| `APROBADO` | `seed` |
| `POR REVISAR`, `MEJORADO`, `REUBICADO` | `proposed` |
| `DESCARTAR`, `HISTORIAL` | `archived` |

**Tres cosas que van a morder:**

1. **No hay columna para el ID original.** `VEL-01`, `FX-03`, `OPC-13` no tienen dónde
   vivir, y los MD se referencian entre sí por ID en los reacomodos. Hace falta una
   columna `legacy_id` o una convención. **Decidir antes de escribir el parser.**

2. **Índice único que puede rechazar filas:**
   ```sql
   create unique index copy_bank_items_headline_unique_idx
     on public.copy_bank_items (business_id, branch_slug, coalesce(corridor, ''), lower(headline))
     where status in ('approved', 'seed');
   ```
   Dos titulares iguales en la misma rama + corredor colisionan. Correr una pasada de
   detección antes del insert.

3. **`angle_tag` alimenta la matemática de cuotas** en `analyzeCopyBank.computeBankState`.
   Si no coincide con los `angles` del copy kit, las cuotas salen mal. O sea: **el copy
   kit de la rama tiene que existir antes del ingest**, no después.

### 4.2 Cinco copy kits USA

`supabase/functions/_shared/copy-kits/{velocidad,costos-ahorro,plataforma-multidivisa,masivos,coberturas}-usa.json`

Referencia de forma: los 4 kits de México en ese mismo directorio. El tipo es `CopyKit`
en `_shared/buildCopyPromptV2.ts`.

Después: registrar los 5 slugs en `BRANCH_KIT_SLUGS` (`branchSlug.ts`) y añadirlos al
mapa `KITS` de `copyKitRegistry.ts`.

**`masivos` no tiene equivalente en México.** Se escribe desde cero con los §18–§23 del
MD 04: los cuatro mecanismos que nunca deben confundirse (carga masiva, compras
recurrentes, integración ERP, cargo ACH).

`banned_phrases` es **error duro por substring** en `validateCopyV2`. Aquí van las
muletillas del §5 (ejecución, orquestación, flujo operacional, rail, cutoff, pagos
elegibles, ventana operativa, fragmentar tesorería), no en el tenant.

### 4.3 Cinco scene kits USA

`supabase/functions/_shared/scene-kits/*-usa.ts`, tipo `SceneKit` en `scene-kits/types.ts`.
Registrar en `sceneKitRegistry.ts`.

**Esto es lo que evita que se mezclen los mockups.** `getSceneKit(branchSlugOrName)` no
recibe `businessId` y no tiene override por base de datos: resuelve solo por slug. Sin
scene kits propios, una rama USA recibe el repertorio de objetos de México.

Campos: `physicalWorld` (objetos, un objeto por entrada), `dataSurfaces`,
`changeMarkers` (aquí van los pares A-contra-B), `bannedProps`, `bannedPropTokens`,
`figurePolicy`. El §10 de los MD da la dirección; el §7 da el repertorio de objetos por
industria.

Hay un guard en `carousel-prompt-smoke.test.ts` que rechaza conectores de par en
`physicalWorld`.

### 4.4 Rutas narrativas y léxico

- `_shared/carouselStoryRegistry.ts` — `STORY_ROUTES[].branchSlugs`. Las 26 actuales
  están etiquetadas con los slugs de México. Varias son trasladables en mecánica
  (`second_quote`, `supplier_waiting`, `cutoff_hour`), pero el registry guarda **texto**:
  hay que reescribirlas con vocabulario USA, no reusar la entrada.
- `_shared/carouselLanguageLexicon.ts` — `BRANCH_REWRITES`, con las muletillas del §5 y
  las equivalencias de CTA ES→EN del propio MD (*Protege tu margen → Protect your
  margins*, y la prohibición explícita de *"protect your costs"* y *"lock today's spot
  rate"*).

---

## 5. Dónde va cada prohibición

Tres capas, y confundirlas rompe cosas.

| Capa | Dónde | Qué va | Enforcement |
|---|---|---|---|
| Tenant | `business_tenants.compliance_rules.forbidden_terms` | Absolutos: garantizado, sin riesgo, rendimiento asegurado, costos ocultos, ahorro garantizado, y la paja en inglés (seamlessly, unlock, empower, revolutionize, financial journey, vendor/vendors) | Substring duro. Se suma a las de la rama en `generate-carousel-plan` |
| Rama · texto | `copy_kit.banned_phrases` | Muletillas del §5, específicas de rama | **Substring duro** en `validateCopyV2` |
| Rama · visual | `scene_kit.bannedProps` + `bannedPropTokens` | §10: no dibujar porcentajes, cotizaciones, saldos. Fronteras entre ramas | Validador de plan |

`required_qualifiers` va **vacío** para USA, a diferencia de México. El §8 dice que el
copy público no lleva disclaimers y que el control del claim vive en los metadatos.

---

## 6. Tabla de ramas

| MD | Nombre en `commercial_branches` | `slug` | UUID | Copy kit a crear |
|---|---|---|---|---|
| 01 | Plataforma de Pagos y Cuenta Multidivisa | `plataforma-multidivisa-usa` | `bd000000-…-0001` | `plataforma-multidivisa-usa.json` |
| 02 | Velocidad / Mismo Día | `velocidad-usa` | `bd000000-…-0002` | `velocidad-usa.json` |
| 03 | Costos y Ahorro | `costos-ahorro-usa` | `bd000000-…-0003` | `costos-ahorro-usa.json` |
| 04 | Pagos Masivos y Automatización | `masivos-usa` | `bd000000-…-0004` | `masivos-usa.json` |
| 05 | Coberturas, Forwards y Opciones | `coberturas-usa` | `bd000000-…-0005` | `coberturas-usa.json` |

Las 6 ramas de México, para no confundirlas: `velocidad-mismo-dia`, `costos-ahorro`,
`cuenta-multidivisa`, `coberturas`, `control-operativo-pagos`, `banco-vs-xending`. Las
dos últimas no resuelven ningún kit.

---

## 7. La decisión abierta: EN-US

`copy_bank_items` **no tiene eje de idioma**. Los 5 MD traen el inglés como propuesta no
aprobada (`approved_en_us: 0` en los cinco), y el §11 dice que el estado EN es
independiente del ES.

Dos caminos:

**A. Columnas en la misma fila** — `headline_en`, `subcopy_en`, `cta_en`, `editorial_en_status`.
Una pieza, dos idiomas, estados independientes. Precedente:
`20260901_add_copy_bank_business_side.sql` agregó un eje así.

**B. Filas separadas** con una columna `language`. Duplica el índice único y obliga a
emparejar filas para saber que son la misma pieza.

Inclinación: **A**, porque el §11 trata la pieza como una sola con dos estados. Pero no
está decidido, y el parser necesita saberlo.

---

## 8. Orden sugerido

1. Aplicar el seed del tenant + insertar la membresía
2. Decidir EN-US y la columna del ID original
3. Escribir los 5 copy kits (los `angle_tag` del ingest dependen de ellos)
4. Registrar los slugs en `BRANCH_KIT_SLUGS` y en `copyKitRegistry.KITS`
5. Parser MD → seed, con la pasada de detección de titulares duplicados
6. Los 5 scene kits
7. Registrar en `sceneKitRegistry`
8. Rutas narrativas y léxico

Después del 4, `generate-carousel-plan` deja de dar 400 en las ramas USA. Antes del 4,
que dé 400 es lo correcto.

---

## 9. Contexto adicional

- `docs/architecture/PROMPT_LAYERS_MAP.md` — qué pantalla usa qué función y las cuatro
  clases de prompt. El §5 lista las costuras abiertas.
- `docs/architecture/CAROUSEL_PROMPT_STACK_AS_IS.md` — auditoría del stack de carrusel.
  El §14 resuelve precedencia por capa; el §15 documenta contradicciones reales
  observadas en outputs.
- **Generación vieja, no mantener ni migrar:** el Home (`XendingDesignPage`), el
  Asistente de Campaña (`CampaignWizardPage`) y `generate-ideas`. La generación vigente
  es Design Studio y su cadena de carrusel.
