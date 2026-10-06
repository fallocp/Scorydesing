import { useState } from 'react';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useBusinessTenants } from '@/hooks/useBusinessTenants';
import { useDesignStore } from '@/store/designStore';

/** Business switching shared by every Crear y editar page; pages remount per actor and business. */
export function useBusinessSwitch() {
  const { setActiveBusiness } = useActiveBusiness();
  const { data: businesses } = useBusinessTenants();
  const setBrand = useDesignStore(state => state.setBrand);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState('');
  async function switchBusiness(id: string) {
    const business = businesses?.find(item => item.id === id);
    if (!business || switching) return;
    setSwitching(true); setSwitchError('');
    try {
      await setActiveBusiness(business);
      if (business.slug === 'xending' || business.slug === 'xending_capital') setBrand(business.slug);
    } catch { setSwitchError('No se pudo cambiar de negocio. Selecciona nuevamente el negocio para continuar.'); }
    finally { setSwitching(false); }
  }
  return { switching, switchError, switchBusiness };
}
