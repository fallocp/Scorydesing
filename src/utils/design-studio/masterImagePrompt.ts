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
/**
 * Nombres visibles de los tres medios, en un solo lugar.
 *
 * La imagen individual y el carrusel eligen el MISMO valor, pero cada pantalla lo
 * llamaba distinto — "Inf Rutas y Mapas" en la etapa de imagen y "Financiero" en
 * el carrusel — así que era imposible saber si eran el mismo control o dos cosas
 * diferentes. Con los dos selectores tan separados en la página, eso se convierte
 * en cambiar el chip equivocado y generar con el medio anterior.
 */
export const DESIGN_IMAGE_TYPE_OPTIONS: {
  value: 'foto' | 'infografia' | 'financiero';
  label: string;
  hint: string;
}[] = [
  {
    value: 'infografia',
    label: 'Infografía 3D',
    hint: 'Iconografía 3D Xending, acentos turquesa y coral. Es el que trae el sistema visual completo.',
  },
  {
    value: 'foto',
    label: 'Fotografía',
    hint: 'Excepción fotográfica natural: foto real, con el sistema visual relajado a propósito.',
  },
  {
    value: 'financiero',
    label: 'Financiero',
    hint: 'Visualización financiera: dashboards, gráficas y ruta de la operación.',
  },
];

/** Etiqueta corta de un medio, para resúmenes de "esto es lo que se va a generar". */
export function designImageTypeLabel(imageType: string | null | undefined): string {
  return DESIGN_IMAGE_TYPE_OPTIONS.find((o) => o.value === imageType)?.label ?? 'sin definir';
}

/**
 * Opciones de "Fondo", compartidas por los dos flujos por la misma razón que los
 * medios: el valor entra a `resolveMasterImagePromptSelection`, así que las dos
 * pantallas tienen que ofrecer exactamente el mismo conjunto.
 */
export const DESIGN_BACKGROUND_OPTIONS: { value: string; label: string }[] = [
  { value: 'white-xending-v2', label: 'Blanco Xending V2' },
  { value: 'white-2', label: 'Blanco 2.0' },
  { value: 'white-classic', label: 'Blanco V1' },
  { value: 'dark-navy', label: 'Navy' },
];

/** Etiqueta corta de un fondo, para los mismos resúmenes. */
export function designBackgroundLabel(background: string | null | undefined): string {
  return DESIGN_BACKGROUND_OPTIONS.find((o) => o.value === background)?.label ?? 'sin definir';
}
