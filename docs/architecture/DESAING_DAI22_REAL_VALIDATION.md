# DAI-22 — Validación real del piloto

Estado: en curso. Esta etapa contrasta la aplicación y los servicios reales; las pruebas simuladas anteriores conservan su valor, pero no sustituyen esta evidencia ni la aceptación visual de Fai.

## Alcance autorizado

Se mantiene el negocio Xending de desarrollo, la cuenta Fai, US$5 totales, cuatro salidas de imagen y el sublímite textual/visión de US$1. No se renuevan ventanas ni se amplían cuotas. Las lecturas, recuperación y reutilización de archivos guardados no generan imágenes. La comparación administrativa de dos imágenes continúa bloqueada porque sólo queda una salida.

El acceso administrativo `desaing-pilot` y el servidor JWT `desaing-server` tienen ventanas distintas. La consulta administrativa real devuelve `expired:true` para su permiso original de dos horas; eso no demuestra el vencimiento del servidor JWT, configurado posteriormente. Cada capacidad debe verificarse por su propia ruta.

## Evidencia obtenida

- Consulta administrativa autenticada HTTP 200: revisión 11, tres trabajos de imagen, US$3 reservados y tres costos sin liquidar. [Estado real](../../artifacts/desaing-lab/real-validation-pilot-status.json).
- Lectura nueva de los dos PNG privados por el endpoint administrativo: ambos devuelven HTTP 200 y son idénticos byte a byte a los archivos históricos, con el hash de su versión. Esto prueba la ruta administrativa y Storage; no se presenta como lectura con JWT del usuario.
- Reenvío de la solicitud exacta de dirección B ya aprobada: `reused:true`, revisión 11 y auditoría sin cambios. No aprueba medium ni crea una dirección nueva. [Recuperación real](../../artifacts/desaing-lab/real-validation-direction-replay.json).
- Los PNG low B y medium conservan sus hashes, dimensiones y parentesco. Sus dos composiciones HTML mantienen exactamente el documento de referencia al retirar la única imagen incrustada: siete textos editables, mismo CSS y misma región. [Revisión técnica](../../artifacts/desaing-lab/pilot-current-technical-review.json).
- La inspección visual encuentra conservación del encuadre y paleta de B, con cambios discretos en detalles. No equivale a la aprobación final del usuario ni garantiza geometría perfecta.
- La conciliación histórica mantiene el costo total desconocido. `usage:null` significa que no hay uso interpretable en el recibo normalizado; no prueba por sí solo que el proveedor haya omitido el dato. No se liberan reservas usando una estimación parcial. [Revisión contable](./DESAING_PILOT_COST_RECONCILIATION_REVIEW.md).

## Aprobación de B y preparación de la prueba HTML

Fai aprobó explícitamente B medium en el chat: «si la apruebo sigue con la prueba html». Se registró esa decisión mediante el endpoint administrativo existente: HTTP 200, revisión 11 → 12 y estado `approved` para la versión `d6c0e418…490258`, con sus tres reservas de imagen y el saldo textual intactos. [Recibo de aprobación](../../artifacts/desaing-lab/real-html-medium-review-result.json). No se renovó la ventana ni se generó otra imagen.

La prueba HTML está preparada sobre la portada completa de 800×450 mostrada a Fai, con diez bloques de texto literal y el PNG del avión existente como pieza reutilizable. La [preparación](../../artifacts/desaing-lab/real-html-preparation.json) distingue la captura completa de la pieza medium original; prevé registrar esa referencia en Supabase y una única llamada de visión a OpenAI bajo la reserva existente de US$0.25. La revisión automática de permisos rechazó el inicio por exigir consentimiento explícito del contenido y destino externo; se solicitó esa confirmación. En ese punto no se inició el navegador de esta prueba, no se importó la referencia ni se llamó al modelo.

La validación de cinco ideas emplea un único encargo congelado y, si la sesión/capacidad lo admiten, una sola inferencia textual bajo la reserva existente de US$0.25. No autoriza renders ni cinco imágenes. Su resultado, intento y recuperación deben quedar registrados antes de marcar ese caso como verificado.

El [request](../../artifacts/desaing-lab/real-validation-exploration-request.json) y su [preparación](../../artifacts/desaing-lab/real-validation-exploration-preparation.json) conservan el texto literal de la portada, el avión y la paleta, con un destino propio de validación. La preparación registra su estado inicial **no enviado**; la ejecución posterior, si ocurre, debe documentarse mediante su recibo independiente.

`node scripts/desaing/real-exploration-smoke.mjs --execute` abre el login normal y verifica actor, negocio, política y capacidad antes de admitir ese único request. El marcador local de envío y el historial remoto impiden repetir una ejecución incierta. Sólo después de un éxito confirmado se permite comprobar la recuperación idempotente del mismo request. La vista aislada emplea el componente real de cinco ideas con acciones deshabilitadas; no acredita la creación completa de un documento en Diseño libre.

## Cinco ideas reales y recuperación

El request congelado se ejecutó una vez con la sesión normal de Fai. El servidor devolvió exactamente cinco ideas para la portada, guardó un único intento `completed` y conservó el mismo resultado al reenviar la solicitud confirmada. El segundo envío no creó otro intento ni cambió el saldo. [Recibo de la prueba](../../artifacts/desaing-lab/real-exploration-smoke-result.json).

El uso registrado fue de 990 tokens de entrada y 1694 de salida. La estimación conservadora del servidor es **US$0.008366**, frente a la reserva inicial de US$0.25; no es una factura. Permanecen US$3 reservados para las tres imágenes históricas, y US$0.991634 disponibles del sublímite de texto/visión. La revisión de imágenes continúa en 11, queda una salida y no hubo aprobación de medium, montaje, publicación ni modificación del negocio.

La comprobación del servidor pasó cinco verificaciones. La primera vista aislada falló durante su preparación y su recibo conserva ese resultado. Después se corrigió la vista local usando imports de React resueltos por Vite y el resultado ya guardado: el componente real mostró las cinco tarjetas completas con acciones deshabilitadas y pasó tres verificaciones, sin login, consultas remotas ni otra llamada al modelo. [Captura completa](../../artifacts/desaing-lab/real-exploration-five-ideas.png), [evidencia local](../../artifacts/desaing-lab/real-exploration-offline-ui-result.json) y [cierre textual](../../artifacts/desaing-lab/real-validation-exploration-release.json). El recorrido completo de creación de un documento sigue pendiente.

La revisión de contenido encuentra cinco variantes dentro del avión y la paleta fijados. Las ideas 3 y 4 se diferencian más por distribución y espacio; 1 y 2 son cercanas. La 5 propone integrar avión y texto, cuya legibilidad deberá revisarse al producirla. Las instrucciones conservan las restricciones en texto; todavía no prueban fidelidad de una nueva imagen ni de su HTML. No se eligió ni aprobó una dirección nueva.

## Historial del acceso y comprobación JWT real

El primer intento mostró el formulario porque no había contraseña de autologin configurada. No hubo solicitudes a Auth ni rechazo de credenciales. Ese resultado `blocked_login` permanece intacto como [historial previo al acceso](../../artifacts/desaing-lab/real-read-prelogin-result.json), junto con el [formulario](../../artifacts/desaing-lab/real-read-login.png) y el [cierre administrativo anterior](../../artifacts/desaing-lab/real-validation-readonly-release.json). No se reejecutó ni se cambió la fecha de aquel cierre.

Después, Fai introdujo su contraseña habitual directamente en el navegador interactivo. El acceso normal de Supabase y `getUser` confirmaron el actor esperado; no se modificó AuthGate ni se usaron accesos administrativos, enlaces temporales o contraseñas nuevas. La sesión permaneció en memoria y el perfil temporal fue eliminado (`profile_removed:true`). El helper administrativo preparado se retiró sin ejecutarse.

El [recorrido real](../../artifacts/desaing-lab/real-read-smoke-result.json) pasó **siete comprobaciones**: identidad por Auth; negocio mediante RLS; motor JWT y capacidad de generación; capacidad y lectura administrativa del prompt; biblioteca e historial de materiales y base de onboarding; PNG medium privado con SHA-256/dimensiones; e igualdad del estado final. Revisión 11, tres trabajos y una salida disponible se conservaron. Hubo cero llamadas al proveedor y cero mutaciones de aplicación.

La selección de negocio se fijó sólo en Zustand y la escritura `set_active_business` fue bloqueada. La lista de evidencia aprobada del prompt estaba vacía; medium sigue `needs_review`. La [captura de onboarding](../../artifacts/desaing-lab/real-read-onboarding-desktop.png) todavía mostraba la recuperación del borrador, por lo que acredita la captura, no el recorrido visual cargado. Los campos `engine.policy` y `engine.usage` nulos del recibo proceden de una proyección incorrecta del harness; no demuestran ausencia de política o cuota. Se conserva el artefacto original.

El [nuevo cierre autenticado](../../artifacts/desaing-lab/real-validation-authenticated-release.json) valida los siete casos, archivos y capturas, y compara las consultas SQL posteriores al login con las anteriores: negocio, conteos y estado financiero permanecen iguales. Conserva el historial previo sin sustituirlo. La capacidad JWT respondió durante el recorrido; este recibo no proporciona una nueva fecha exacta de expiración. No se prorrogó ninguna ventana ni se aprobó visualmente una imagen.

El cierre completo sigue pendiente de resultados reales del planificador y de visión/HTML, aprobación visual de Fai, concurrencia de escrituras y recuperación remota, y evidencia de costo atribuible. La solicitud textual preparada no se envió durante este recorrido de lectura. Queda un bloque agrupado de validación real; el frontend de producción no se considera desplegado por haber actualizado el servidor de desarrollo.
