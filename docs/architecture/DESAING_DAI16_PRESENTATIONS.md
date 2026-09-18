# DesAIng — Primera integración con Presentaciones

Fecha: 2026-09-17. Rama de trabajo: `experimental/desaing`.

Esta entrega conecta el montaje local de piezas con la pantalla existente de Presentaciones. Es una parte de DAI-16/20; todavía no conecta generación real de imágenes ni completa onboarding, cinco propuestas en las pantallas finales o diseño libre.

## Comportamiento

- **Añadir imágenes montadas** abre la biblioteca local del negocio. Permite seleccionar PNG, JPEG o WebP, revisar la composición y ajustar región/proporción. La selección previa no escribe una imagen; el botón Montar importa y coloca la versión elegida.
- Los archivos se validan por firma y decodificación: máximo 8 MB y 24 megapíxeles. Las versiones son inmutables, con metadatos en el catálogo compartido y bytes en IndexedDB.
- El HTML conserva sus textos, estilos y elementos editables. La imagen montada lleva píxeles embebidos; reutilizarla o exportarla no genera otra imagen. La biblioteca queda en ese navegador/origen; no es todavía una biblioteca sincronizada con servidor.
- Preview y montaje usan el mismo constructor de HTML. Las coordenadas pertenecen al viewport del slide. El editor visual actualiza geometría e identidad de los montajes; sustituir los píxeles retira la identidad anterior. Ediciones manuales/IA que alteran la estructura o CSS sin medición conservan el HTML y retiran la trazabilidad del montaje que ya no se puede verificar.
- **Exportar Todo** ahora exporta el array activo, incluidos cambios, duplicados, orden y montajes. Antes utilizaba las plantillas originales. Cada slide conserva su tamaño y CSS en un iframe sin scripts.
- Cada slide tiene ID y revisión persistentes; la migración añade campos al JSON existente. Duplicar produce otra identidad y conserva referencias a las mismas versiones de imágenes.
- Resultados asíncronos se aplican al slide/revisión original. Se rechazan cambios obsoletos. La copia/movimiento conserva el origen si cambió mientras esperaba.
- Un proyecto se valida antes de cambiar su dueño en memoria. Un borrador inválido permanece intacto en el almacenamiento y muestra un aviso; no se reemplaza silenciosamente por las plantillas.

## Aislamiento y compatibilidad

Los borradores nuevos se separan por negocio. El borrador global anterior se recupera una sola vez en el primer negocio que lo abra; las claves originales se conservan. Esto recupera un formato anterior que no registraba negocio, sin convertirlo en una prueba de pertenencia.

Las consultas de Presentaciones y de la biblioteca del editor añaden el filtro del negocio; las carpetas y subidas usan su prefijo. Los iconos históricos de la carpeta global `brand-icons/` no se trasladaron ni borraron. Su migración requiere identificar primero al negocio propietario. El filtrado del cliente no sustituye políticas RLS/Storage de servidor, cuya validación remota sigue pendiente.

El HTML pasa por DOMPurify y una CSP que bloquea scripts, navegación, formularios y conexiones. Se conserva exclusivamente la configuración JSON inerte del editor; sus textos, CSS, SVG y CTA visual siguen disponibles. El visor escala el lienzo desde la aplicación, sin ejecutar el JavaScript de una plantilla. Los recursos HTTPS ya existentes, como fuentes o fotografías externas, conservan esa dependencia: el deck completo no se presenta como totalmente offline.

El flujo vigente de imagen + feedback → HTML sigue usando sus hooks y función actuales. El montaje no selecciona ni invoca un modelo. No hubo llamadas de pago, cambios remotos de datos, migraciones ni despliegue.

## Compilación general

Se resolvieron los 85 diagnósticos encontrados antes de esta entrega: interfaces de las librerías instaladas, imports, fixtures y tipos Supabase contrastados con las migraciones locales. Se añadieron los campos de autoría obligatorios en dos inserts y serialización explícita de JSON. No se relajó TypeScript ni se ocultaron errores.

`npm run build` pasó. Vite conserva avisos de tamaño del bundle e importación dinámica/estática del cliente Supabase; no bloquearon la compilación. La correspondencia de tipos con el esquema desplegado no se verificó remotamente.

## Verificación

Las suites seleccionadas incluyen contratos DesAIng, adaptadores, estado local, compositor, documentos de Presentaciones, serialización, inserts autenticados y las regresiones afectadas de Design Studio/templates. **21 suites, 286 pruebas aprobadas.**

La prueba de navegador se ejecuta sobre `PresentationsPage` y el editor reales, con un negocio de prueba, IndexedDB real y servicios de nube simulados. El harness rechaza operaciones remotas y bloquea tráfico HTTP externo. No abre cuentas ni carga el `.env` de la aplicación.

**Resultado: aprobado, diez comprobaciones del recorrido.** Incluyen migración de IDs, montaje, recarga, biblioteca por negocio, duplicado, exportación exacta, rechazo de raster falso y HTML ejecutable, edición de texto en el editor real y reconciliación de geometría/copias/sustitución de imágenes. El resultado registró cero intentos HTTP externos, llamadas de proveedor, escrituras remotas o excepciones sin manejar. Se revisaron visualmente las capturas de escritorio y tablet.

La inspección de capturas detectó que una URL Blob del padre podía fallar dentro del iframe con origen opaco. La vista previa ahora usa los bytes de la imagen como data URL, igual que el montaje. También se retiró el desenfoque del fondo del modal, que afectaba el dibujo del iframe en Chrome; las capturas finales muestran texto e imagen nítidos.

Comando reproducible: `node scripts/desaing/presentation-smoke.mjs`. Inicia y cierra su Vite en `127.0.0.1:3012` y Chrome headless. Evidencia local: `artifacts/desaing-lab/presentations-smoke-result.json`, capturas `presentations-*.png` y el HTML exportado. Estos artefactos se excluyen de Git.

Pendiente de validar con servicios reales: guardado/autorización multiusuario, concurrencia entre pestañas y servidor, RLS/Storage, renderer PNG/PDF y evaluación visual de resultados generados por IA. Los controles de revisión de esta entrega cubren el estado de la pestaña; no equivalen a concurrencia transaccional de Supabase.

## Siguiente bloque

Implementar los trabajos y almacenamiento de servidor de DAI-06/09 con autenticación, permisos por negocio, límites de consumo e idempotencia. Después conectar la generación de una pieza al destino HTML seleccionado, conservando un solo ejecutor de imagen por operación y la revisión antes del montaje. El catálogo y el montaje local de esta entrega proporcionan el punto de integración; aún no autorizan gastos ni activan proveedores por sí mismos.

Referencias: [plan técnico](./DESAING_EXPERIMENTAL_PLAN.md), [laboratorio DAI-04](./DESAING_DAI04_VISUAL_LAB.md), [DOMPurify](https://github.com/cure53/DOMPurify).
