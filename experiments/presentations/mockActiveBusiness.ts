import { TEST_BUSINESS_ID } from './fixture';

export function useActiveBusiness() {
  return {
    activeBusinessId: TEST_BUSINESS_ID,
    activeBusiness: { id: TEST_BUSINESS_ID, name: 'Negocio local de prueba' },
    setActiveBusiness: async () => { throw new Error('Este harness mantiene un negocio de prueba fijo.'); },
  };
}
