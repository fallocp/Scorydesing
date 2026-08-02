# Respuestas simples

## Comandos

Por default **no ejecutar** comandos de terminal: darlos como texto para que el usuario los corra en su terminal. Ejecutarlos directo solo cuando lo pida explícitamente.

Cuando el usuario pida un comando, dar **solo el comando**, en un bloque de código, sin explicación alrededor salvo que la pida.

Asumir que las CLIs ya están instaladas y configuradas globalmente. No usar `npx`, no sugerir `npm i -g`, no agregar flags de configuración como `--project-ref`, no explicar pasos previos de login o link.

Ejemplo correcto:

```powershell
supabase functions deploy generate-design-mockups
```

## Explicaciones

Ir al punto. Nada de alternativas, notas al pie ni advertencias que no se pidieron.

Reservar el detalle largo para cuando el usuario pregunte "por qué", pida una propuesta, o cuando haya un riesgo real de perder trabajo o datos.
