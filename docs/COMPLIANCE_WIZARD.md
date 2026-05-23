# Compliance Wizard

## ¿Qué es?

El Compliance Wizard es un **agente de configuración asistida por IA** que ayuda a los clientes de SCORY Design a crear y mantener sus reglas de compliance para contenido publicitario. Funciona como un chat conversacional que guía al usuario paso a paso, sin necesidad de conocimientos técnicos ni regulatorios previos.

Las reglas que configura el usuario alimentan al **Claim Validator** — el sistema que revisa automáticamente cada pieza de contenido antes de publicarse.

---

## ¿Qué problema resuelve?

| Sin Compliance Wizard | Con Compliance Wizard |
|---|---|
| El cliente no sabe qué reglas necesita | La IA pregunta sobre su industria y regulador, y propone reglas |
| Configurar reglas requiere un técnico | El usuario configura todo por chat en lenguaje natural |
| Si una regla es muy estricta, no sabe cómo ajustarla | El sistema le avisa y propone ajustes quirúrgicos |
| No hay historial de cambios | Cada cambio queda versionado con rollback disponible |
| Las reglas se quedan estáticas | El sistema detecta patrones y sugiere mejoras proactivamente |

---

## Alcances

### Lo que SÍ hace

- Genera reglas de compliance personalizadas basadas en industria y regulador
- Permite iterar reglas por chat ("agrega esto", "quita aquello", "relaja el límite")
- Muestra un panel visual con las reglas organizadas por categoría
- Versiona cada cambio con posibilidad de rollback
- Detecta patrones en validaciones pasadas y sugiere nuevas reglas
- Recibe retroalimentación cuando el usuario no está de acuerdo con un rechazo
- Muestra un resumen proactivo de cómo están funcionando las reglas

### Lo que NO hace

- No aplica cambios automáticamente — siempre requiere aprobación del usuario
- No reemplaza asesoría legal — es una herramienta de configuración, no un abogado
- No accede a datos de otros clientes — aislamiento total por tenant
- No se "re-entrena" — usa el mismo modelo de IA para todos, personalizado por contexto

---

## Flujo del usuario

### Primera vez (sin reglas configuradas)

```
┌─────────────────────────────────────────────────────────┐
│  1. El usuario abre el Compliance Wizard                │
│                                                         │
│  2. El wizard pregunta:                                 │
│     → "¿En qué industria opera tu negocio?"             │
│     → "¿Qué regulador aplica?"                         │
│     → "¿Hay términos que sabes que NO puedes usar?"     │
│                                                         │
│  3. La IA genera un set de reglas sugeridas:            │
│     • Términos prohibidos (ej: "rendimiento garantizado")│
│     • Calificadores requeridos (ej: "Sujeto a CNBV")   │
│     • Valores máximos (ej: rendimiento_anual ≤ 15%)    │
│                                                         │
│  4. El usuario revisa en el panel visual                │
│                                                         │
│  5. Itera por chat: "agrega X", "quita Y", "cambia Z"  │
│                                                         │
│  6. Cuando está conforme → "Aprobar reglas"             │
│     → Se activa la validación automática                │
└─────────────────────────────────────────────────────────┘
```

### Visitas posteriores (con reglas existentes)

```
┌─────────────────────────────────────────────────────────┐
│  1. El usuario abre el Compliance Wizard                │
│                                                         │
│  2. Ve un banner: "Desde tu última visita: 5 rechazos   │
│     de alto riesgo, 2 disputas pendientes.              │
│     ¿Quieres ajustar algo?"                            │
│                                                         │
│  3. Opciones:                                           │
│     a) "Ajustar reglas" → inicia iteración por chat     │
│     b) "Buscar sugerencias" → el sistema propone        │
│        nuevas reglas basadas en patrones detectados      │
│     c) "Ver historial" → rollback a versión anterior    │
│     d) "Ahora no" → cierra el banner                   │
│                                                         │
│  4. Si ajusta → nueva versión con el "por qué" guardado │
└─────────────────────────────────────────────────────────┘
```

### Loop de retroalimentación (desde el Claim Validator)

```
┌─────────────────────────────────────────────────────────┐
│  1. El Claim Validator rechaza una pieza de contenido   │
│                                                         │
│  2. El usuario ve el rechazo y no está de acuerdo       │
│                                                         │
│  3. Clic en "No estoy de acuerdo" → escribe por qué    │
│     (ej: "Este contenido es legítimo porque...")        │
│                                                         │
│  4. La disputa se registra                              │
│                                                         │
│  5. Próxima vez que entre al Wizard:                    │
│     → Ve el resumen con las disputas pendientes         │
│     → Puede ajustar la regla que causó el problema      │
│     → El ajuste se guarda como nueva versión            │
└─────────────────────────────────────────────────────────┘
```

---

## Interfaz de usuario

La pantalla se divide en dos paneles:

### Panel izquierdo: Chat conversacional

- Mensajes del usuario (derecha, color primario)
- Mensajes del asistente (izquierda, fondo gris)
- Reglas generadas se muestran inline con badges de colores
- Cambios se muestran como diff visual (verde = agregado, rojo = eliminado)
- Banner de retroalimentación cuando hay issues pendientes
- Input de texto con envío por Enter

### Panel derecho: Panel estructurado

- **Términos Prohibidos** — lista editable (clic para editar, X para eliminar, + para agregar)
- **Calificadores Requeridos** — misma mecánica
- **Valores Máximos** — pares clave-valor editables
- **Botones de acción** — "Aprobar reglas" y "Desactivar validación"
- Sincronización en tiempo real con el chat

---

## Tipos de reglas

| Tipo | Qué hace | Ejemplo |
|------|----------|---------|
| **Términos Prohibidos** | Bloquea contenido que contenga estas palabras/frases | "rendimiento garantizado", "sin riesgo", "mejor que el banco" |
| **Calificadores Requeridos** | Exige que ciertos disclaimers acompañen el contenido | "Producto regulado por CNBV", "Rendimientos pasados no garantizan futuros" |
| **Valores Máximos** | Limita cifras numéricas en claims publicitarios | rendimiento_anual ≤ 15%, tasa_mensual ≤ 2% |

---

## Versionamiento

Cada vez que se aprueban reglas (o se acepta una sugerencia, o se hace rollback), se crea una **versión inmutable**:

- Número secuencial (v1, v2, v3...)
- Snapshot completo de las reglas en ese momento
- Resumen del cambio ("por qué" se modificó)
- Fecha, hora y quién lo hizo
- Mínimo 10 versiones retenidas por tenant

**Rollback**: El usuario puede restaurar cualquier versión anterior. Esto NO elimina el historial — crea una nueva versión con el snapshot restaurado.

---

## Sugerencias proactivas

El sistema analiza el historial de validaciones y detecta patrones:

1. Consulta las últimas 50 validaciones del tenant
2. Filtra solo las de alto riesgo
3. Agrupa por razón de rechazo
4. Si un patrón aparece 3+ veces → genera una sugerencia

**Ejemplo**: Si "mejor que el banco" fue rechazado 5 veces, el sistema sugiere agregar "mejor que.*banco" como término prohibido.

El usuario puede:
- **Aceptar** → la regla se agrega y se crea nueva versión
- **Rechazar** → el patrón no se vuelve a sugerir

---

## Seguridad y aislamiento

- Autenticación por JWT de Supabase
- Validación de membresía en el tenant antes de cualquier operación
- Row Level Security (RLS) en todas las tablas
- Un usuario solo ve y modifica las reglas de SU negocio
- Errores genéricos que no revelan si un tenant existe
- Datos de otros tenants nunca se incluyen en respuestas ni en contexto de IA

---

## Arquitectura técnica (para desarrolladores)

### Backend

| Módulo | Archivo | Responsabilidad |
|--------|---------|-----------------|
| Entry Point | `supabase/functions/compliance-wizard/index.ts` | CORS, auth, routing por action |
| Session Manager | `sessionManager.ts` | Crear/recuperar sesiones, historial de mensajes |
| Question Engine | `questionEngine.ts` | Preguntas guiadas, extracción de respuestas |
| Rule Generator | `ruleGenerator.ts` | Generación inicial de reglas vía OpenAI |
| Rule Iterator | `ruleIterator.ts` | Iteración por feedback + computeDiff |
| Version Persister | `versionPersister.ts` | Persistir, rollback, historial de versiones |
| Pattern Detector | `patternDetector.ts` | Sugerencias proactivas basadas en validaciones |
| Token Manager | `tokenManager.ts` | Resumen de historial cuando excede tokens |
| Generic Agent | `_shared/assistedConfigAgent.ts` | Patrón reutilizable para otros agentes |

### Frontend

| Componente | Archivo | Responsabilidad |
|-----------|---------|-----------------|
| Página | `src/pages/ComplianceWizardPage.tsx` | Layout split-panel |
| Chat | `src/components/compliance-wizard/ComplianceChat.tsx` | Panel conversacional |
| Panel | `ComplianceStructuredPanel.tsx` | Edición visual de reglas |
| Versiones | `ComplianceVersionHistory.tsx` | Historial con rollback |
| Sugerencias | `ComplianceSuggestions.tsx` | Tarjetas de sugerencias proactivas |
| Acciones | `ComplianceActions.tsx` | Botones aprobar/desactivar |
| Feedback | `ComplianceFeedbackBanner.tsx` | Banner de retroalimentación |
| Disputa | `DisputeButton.tsx` | Botón "No estoy de acuerdo" |
| Store | `src/store/complianceWizardStore.ts` | Estado global (Zustand) |
| Tipos | `src/types/compliance-wizard.ts` | Interfaces TypeScript |

### Base de datos

| Tabla | Propósito |
|-------|-----------|
| `compliance_sessions` | Sesiones de conversación |
| `compliance_messages` | Mensajes individuales del chat |
| `compliance_rule_versions` | Historial inmutable de versiones |
| `compliance_rejected_suggestions` | Sugerencias rechazadas (no re-sugerir) |
| `validation_history` | Historial de validaciones del Claim Validator |
| `validation_disputes` | Disputas del usuario contra rechazos |
| `business_tenants.compliance_rules` | Reglas activas del tenant |
| `business_tenants.claim_validation_enabled` | Flag de activación |

### Acciones del endpoint

Todas las operaciones se hacen via `POST /compliance-wizard` con un campo `action`:

| Action | Qué hace |
|--------|----------|
| `start` | Inicia/reanuda sesión, retorna modo guided o existing |
| `answer` | Responde pregunta guiada, avanza o genera reglas |
| `iterate` | Procesa feedback del usuario, regenera reglas |
| `approve` | Persiste reglas, activa validación, crea versión |
| `rollback` | Restaura versión anterior |
| `disable` | Desactiva validación sin borrar reglas |
| `suggest` | Detecta patrones y genera sugerencias |
| `accept_suggestion` | Acepta sugerencia, persiste como nueva versión |
| `reject_suggestion` | Rechaza sugerencia, no se vuelve a mostrar |
| `panel_edit` | Edición directa desde panel (sin chat) |
| `dispute` | Registra disputa contra un rechazo |
| `feedback_summary` | Retorna resumen de actividad reciente |

---

## Patrón reutilizable: Assisted Configuration Agent

La arquitectura del Compliance Wizard está diseñada para reutilizarse en otros procesos de configuración:

- **Brand Voice Agent** — configurar tono y estilo de comunicación
- **Visual System Agent** — configurar paleta, tipografías, layouts
- **Content Strategy Agent** — configurar pilares de contenido

El módulo genérico (`_shared/assistedConfigAgent.ts`) define:

```typescript
interface AgentConfig {
  targetSchema: { name, fields[] }     // Qué se configura
  guidedQuestions: GuidedQuestion[]     // Preguntas iniciales
  generationPrompt: string             // Prompt de generación
  iterationPrompt: string              // Prompt de iteración
  persistenceTarget: { table, field }  // Dónde se guarda
  versionTable: string                 // Tabla de versiones
}
```

Para crear un nuevo agente, solo se necesita definir un nuevo `AgentConfig` — la lógica de sesión, iteración, versionado y UI se reutiliza.

---

## Preguntas frecuentes

**¿Puedo deshacer un cambio?**
Sí. Cada cambio crea una versión. Ve al historial de versiones y haz clic en "Restaurar" en cualquier versión anterior.

**¿Qué pasa si desactivo la validación?**
Las reglas se conservan pero no se aplican. Puedes reactivar en cualquier momento aprobando las reglas de nuevo.

**¿El sistema cambia mis reglas solo?**
No. Siempre requiere tu aprobación. Las sugerencias son solo eso — sugerencias que tú aceptas o rechazas.

**¿Qué pasa si no estoy de acuerdo con un rechazo?**
Usa el botón "No estoy de acuerdo" junto al contenido rechazado. Tu feedback se registra y la próxima vez que entres al Wizard te mostrará un resumen para que ajustes la regla.

**¿Necesito saber de regulación para usarlo?**
No. El wizard te pregunta tu industria y regulador, y genera reglas apropiadas. Tú solo revisas y ajustas en lenguaje natural.

**¿Otros clientes pueden ver mis reglas?**
No. Cada tenant tiene sus propias reglas aisladas. Ni siquiera la IA tiene acceso a reglas de otros clientes.
