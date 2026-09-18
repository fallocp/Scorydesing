# DesAIng — Laboratorio visual local

Fecha: 17 de septiembre de 2026. Entrega inicial DAI-04 con composición HTML de prueba.

El laboratorio ya permite recorrer idea → cinco propuestas → aprobación de dirección → versión media → revisión final → montaje → edición → exportación. Usa dibujos raster de muestra y registra **cero llamadas reales a IA**. La apariencia de esos dibujos no sirve para evaluar calidad de modelos.

## Abrirlo

```powershell
npm run dev:desaing
```

Abrir `http://127.0.0.1:3011/experiments/desaing/` en el mismo equipo. El servidor escucha sólo en localhost; este enlace no da acceso desde un iPad u otro dispositivo. Para probarlo remotamente hace falta preparar un preview separado.

La entrada `experiments/desaing/index.html` usa `src/desaing-lab.tsx` y `vite.desaing.config.ts`. No carga `App`, `AuthGate`, Supabase ni las variables de entorno de la aplicación. Su compilación es independiente:

```powershell
npm run build:desaing
```

## Qué puede probarse

- Contextos de onboarding, presentaciones y diseño libre, con los modos ejecutar/explorar y conservación de la instrucción. Son contextos de la simulación; todavía no ingieren PDFs ni documentos reales.
- Un borrador o cinco candidatos con estados independientes. En “Pruebas de recuperación” se puede simular éxito, fallo parcial o interrupción.
- Aprobar una dirección sin producir otra imagen; solicitar explícitamente una versión media y revisarla por separado.
- Aprobar una pieza, colocarla en HTML y cambiar título, subtítulo, posición y tamaño sin crear otra imagen.
- Reutilizar una versión aprobada en presentación, portada o página. Cambiar de formato recupera el documento ya guardado de ese formato, si existe.
- Recargar el navegador y recuperar imágenes, metadatos, selección, composiciones y estados. Continuar pendientes no repite los candidatos fallidos o inciertos.
- Exportar el mismo HTML que se previsualiza, con PNG incorporados y capas de texto independientes.

La UI sigue el flujo de concepto y revisión de `ImageConceptStudio`. Ese componente llama directamente a servicios remotos, por lo que no se importó entero al laboratorio. Se reutilizan los contratos, adaptador, catálogo, estado y reglas experimentales. El compositor toma el patrón de escena y texto de News, con una plantilla propia sin marca ni URLs firmadas de Xending.

## Persistencia verificada en navegador

La primera comprobación con dos pestañas detectó que localStorage podía entregar una copia anterior aunque se usara Web Locks. Se sustituyó ese backend por **una transacción readwrite de IndexedDB** que lee el estado actual, valida/reserva y escribe el estado nuevo antes de devolver éxito.

- `localJournal.ts`: transacciones del diario serializado, con confirmación en `oncomplete` y rechazo en `onabort`.
- `localDesignStore.ts`: validación de dominio y adopción del estado anterior, si existía en localStorage. El valor antiguo se conserva como respaldo; IndexedDB pasa a ser la fuente activa.
- `labImages.ts`: guarda los PNG en IndexedDB mediante claves inmutables. Si faltan bytes al recuperar, muestra el error y no regenera silenciosamente.
- `labSession.ts`: modo, espacio, instrucción, selección e historial de revisiones del documento.

La revisión también detectó cambios desde una pestaña obsoleta. Montar y editar ahora reciben el documento y la revisión **mostrados al usuario**, y los verifican dentro de la transacción; otra pestaña no puede redirigir silenciosamente el cambio a una portada distinta.

El almacenamiento de bytes y el diario son transacciones separadas: un fallo después de guardar el PNG puede dejar un archivo local sin registro. No se habilitan envíos reales a partir de esta arquitectura; aún faltan almacenamiento y trabajos de servidor, conciliación y limpieza de archivos huérfanos.

## Composición y límites

`labComposition.ts` genera HTML desde metadatos tipados. Mantiene IDs de documento/elementos, revisión, referencias exactas a versiones y geometría. El mismo render se usa para iframe y exportación. El iframe está aislado; el HTML escapa texto, bloquea scripts/red y admite sólo data URLs raster con firma PNG/JPEG/WebP.

Esta entrega usa una plantilla controlada. **No importa ni modifica todavía el HTML arbitrario de Presentaciones**, no captura automáticamente una región de una presentación existente y no exporta PNG/PDF. No se atribuye a las imágenes simuladas comprensión visual del lienzo.

## Verificación

Resultado: **10 suites, 214 pruebas aprobadas**, TypeScript estricto y `npm run build:desaing` correctos. La comprobación real de navegador terminó con `success: true` y cero llamadas a proveedores.

```powershell
npm test -- supabase/functions/_shared/desaing/__tests__ src/lib/desaing/__tests__
node scripts/desaing/browser-smoke.mjs
```

El smoke test usa Chrome headless con un perfil temporal, inicia Vite si hace falta y cierra los procesos que creó. No requiere instalar Playwright ni Puppeteer. `DESAING_TEST_CHROME` permite indicar otra ruta de Chrome.

La prueba real de navegador comprobó:

1. entrada aislada y cinco candidatos;
2. aprobación de dirección sin nueva ejecución, medium mediante request de edición preparado con la imagen base y revisión final separada;
3. PNG persistidos, montaje, cambio de título y recuperación tras recarga;
4. coincidencia exacta entre el archivo descargado y el HTML de preview, sin nuevas ejecuciones al editar/exportar;
5. pantalla de tablet sin desbordamiento horizontal, con revisión de capturas;
6. dos pestañas intentando reservar la misma operación: sólo una reserva nueva;
7. ausencia de solicitudes HTTP externas y de excepciones no manejadas.

Evidencia local en `artifacts/desaing-lab/`: `smoke-result.json`, `desktop.png`, `tablet.png` y `composition.html`. El directorio está excluido de Git. La prueba en viewport de tablet se ejecutó en Chrome de escritorio, no en Safari/iPad físico.

El build aislado valida el laboratorio; el bloqueo previo del build general de la aplicación sigue pendiente y no se considera resuelto por esta entrega.

## Siguiente bloque

Preparar Presentaciones para consumir el flujo compartido: IDs y revisiones estables, captura y región del HTML existente, biblioteca por negocio, referencias reales, montaje y exportación del documento activo. Después conectar ejecución real con autorización de servidor, idempotencia durable y presupuesto definido. La ingesta de PDFs/documentos y la evaluación visual de modelos siguen siendo tareas distintas.
