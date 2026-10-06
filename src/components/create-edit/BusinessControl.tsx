import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useBusinessTenants } from '@/hooks/useBusinessTenants';
import { useDeploymentMode } from '@/hooks/useDeploymentMode';

export function BusinessControl({ switching, switchBusiness }: { switching: boolean; switchBusiness: (id: string) => Promise<void> }) {
  const deployment = useDeploymentMode();
  const { activeBusiness, activeBusinessId } = useActiveBusiness();
  const { data: businesses, isLoading, isError } = useBusinessTenants();
  if (deployment !== 'multi' && activeBusinessId) return <span>{activeBusiness?.name}</span>;
  return <label><span>Negocio</span><select aria-label="Negocio activo" value={activeBusinessId ?? ''} disabled={isLoading || switching || isError}
    onChange={event => void switchBusiness(event.target.value)}><option value="" disabled>{isLoading ? 'Cargando negocios…' : isError ? 'No se pudieron cargar los negocios' : 'Seleccionar negocio'}</option>
    {activeBusinessId && !businesses?.some(item => item.id === activeBusinessId) && <option value={activeBusinessId}>{activeBusiness?.name}</option>}
    {businesses?.filter(item => item.id).map(item => <option key={item.id} value={item.id!}>{item.name}</option>)}</select></label>;
}
