# Alcance de esta carpeta

Esta carpeta es un paquete de referencia visual y una demo aislada; no es la aplicación productiva.

Antes de integrar, leer README.md y docs/PROMPT_CODEX.md. Respetar las instrucciones del repositorio anfitrión; no reemplazar sus AGENTS.md ni su steering.

No copiar package.json, index.html, main.tsx o App.tsx sobre archivos homónimos del producto. El controlador local y los datos demo no deben reemplazar autenticación, tenencia, servicios, rutas, generación ni persistencia.

No llevar scripts/build-offline.mjs a la arquitectura de producción: genera una vista HTML de demostración, no un motor de React.

No renombrar ScoryDesign ni fusionarlo con Scory compliance, Market o agentes. No instalar dependencias en el proyecto real sin verificar necesidad y aprobación.

El PDF es referencia documental del recorrido. Las PNG elegidas son referencia estética. Cuando discrepan con el código actual, registrar y resolver con el usuario, no cambiar comportamiento silenciosamente.

En la fase inicial, inspección y plan solamente; después de aprobación, implementar solo navegación, cabecera e Inicio. Entregar captura y pruebas antes de la siguiente pantalla.
