/**
 * ESLint flat config.
 *
 * El script `lint` de package.json existía desde antes pero ESLint nunca estuvo
 * instalado ni configurado, así que este es el primer lint real del proyecto.
 *
 * Alcance deliberadamente reducido a `src/`:
 *
 * - `supabase/functions/**` es Deno: importa por URL, usa el global `Deno` y su
 *   propio resolver. Lintearlo con esta configuración produce cientos de errores
 *   de import que no son defectos.
 * - `renderer/**` es un servicio Node aparte, con su propio package.json.
 * - `dist/`, `node_modules/` y los tipos generados de Supabase no se revisan.
 *
 * Sin `--max-warnings 0` en este primer paso: una base que nunca pasó por lint
 * arroja demasiados avisos y el umbral bloquearía todo commit desde el inicio.
 * Se sube cuando el conteo esté controlado.
 */

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'renderer/**',
      'supabase/functions/**',
      'src/integrations/supabase/types.ts',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      /**
       * Aviso, no error: el código existente usa `any` en las consultas a las
       * tablas que faltan en los tipos generados de Supabase. Convertirlo en
       * error ahora bloquearía el trabajo antes de regenerar esos tipos.
       */
      '@typescript-eslint/no-explicit-any': 'warn',
      /**
       * Aviso por ahora. Son 72 hallazgos mecánicos y ninguno cambia
       * comportamiento; se limpian por archivo y entonces pasa a 'error'.
       * El prefijo `_` ya se usa en el código para lo intencionalmente sin uso.
       */
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'all', caughtErrorsIgnorePattern: '^_' },
      ],
      /**
       * Reglas nuevas de eslint-plugin-react-hooks 7, que no existían cuando se
       * escribió este código. Marcan patrones reales que conviene revisar
       * (`set-state-in-effect` sobre todo), pero son 76 hallazgos repartidos por
       * toda la app y arreglarlos es un trabajo propio, no parte de esta branch.
       *
       * Quedan como aviso para que sean visibles y medibles sin bloquear. Se
       * suben a 'error' por regla, a medida que se limpian.
       */
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/static-components': 'warn',
      /**
       * Aviso hasta que se decida subir `lib` a ES2022 en tsconfig.app.json.
       * La regla pide preservar el error original con `new Error(msg, { cause })`,
       * y ese segundo argumento no existe en el `lib` actual (ES2020), así que
       * cumplirla hoy produce un error de tipos.
       */
      'preserve-caught-error': 'warn',
    },
  },
);
