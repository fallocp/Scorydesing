/**
 * Maps the visible Design Studio "Fondo" choice to an exact, reproducible
 * master-image-prompt snapshot.
 *
 * Lives here rather than inside a page because both the single-image flow and
 * the carousel flow need the same mapping — two copies would drift and silently
 * render the two flows under different visual systems.
 */

import type { MasterImagePromptVersion } from '@/types/design-studio';

export type MasterImageBackgroundStyle = 'navy' | 'light_cream' | 'white' | 'white_2';

export interface MasterImagePromptSelection {
  backgroundStyle: MasterImageBackgroundStyle;
  masterPromptVersion: MasterImagePromptVersion;
}

/**
 * Legacy values stay readable so restored sessions remain reproducible, even
 * though they are no longer offered as new choices.
 */
export function resolveMasterImagePromptSelection(
  background: string | null,
): MasterImagePromptSelection {
  switch (background) {
    case 'white-classic':
    case 'white-minimal': // legacy value: the former "Blanco" option
      return { backgroundStyle: 'white', masterPromptVersion: 'v1' };
    case 'white-2':
      return { backgroundStyle: 'white_2', masterPromptVersion: 'v2' };
    case 'dark-navy':
    case 'color-turquoise': // legacy value previously fell back to navy
      return { backgroundStyle: 'navy', masterPromptVersion: 'v2' };
    case 'light-cream': // restored legacy sessions remain reproducible on V2
      return { backgroundStyle: 'light_cream', masterPromptVersion: 'v2' };
    case 'white-xending-v2':
    default:
      return { backgroundStyle: 'white', masterPromptVersion: 'v2' };
  }
}

/**
 * Medium keys differ between the UI and the image agent: the UI calls the
 * financial/route variant `financiero`, the master prompt calls it `mapa_rutas`.
 */
export function imageTypeToPromptVariant(
  imageType: 'foto' | 'infografia' | 'financiero',
): 'fotografia' | 'infografia' | 'mapa_rutas' {
  switch (imageType) {
    case 'foto': return 'fotografia';
    case 'infografia': return 'infografia';
    case 'financiero': return 'mapa_rutas';
  }
}
