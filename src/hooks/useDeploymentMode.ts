/**
 * Hook that reads the deployment mode from the VITE_DEPLOYMENT_MODE env var.
 *
 * Returns 'single' or 'multi'. Defaults to 'single' when the env var is not
 * set, which hides the business switcher and tenant management UI.
 *
 * Requirements: 17.9, 17.10
 */

import type { DeploymentMode } from '@/types/xendingDesign';

/**
 * Returns the current deployment mode.
 *
 * - `'single'` — standalone deployment, business switcher hidden.
 * - `'multi'`  — central deployment, business switcher visible.
 */
export function useDeploymentMode(): DeploymentMode {
  const raw = import.meta.env.VITE_DEPLOYMENT_MODE as string | undefined;
  return raw === 'multi' ? 'multi' : 'single';
}
