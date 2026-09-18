import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { BrandSetupPanel } from '@/components/desaing/BrandSetupPanel';
import { usePresentationDesignService } from '@/components/presentations/PresentationDesignContext';
import { useBusinessTenants } from '@/hooks/useBusinessTenants';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useDesignStore } from '@/store/designStore';
import type { BusinessTenant } from '@/types/xendingDesign';
import './FreeDesignPage.css';

function OnboardingPage() {
  const navigate = useNavigate(), [parameters] = useSearchParams(), queryClient = useQueryClient();
  const { data: tenants, isLoading, isError, refetch } = useBusinessTenants();
  const { activeBusinessId, setActiveBusiness } = useActiveBusiness();
  const service = usePresentationDesignService();
  const current = tenants?.find(tenant => tenant.id === activeBusinessId) ?? (tenants?.length === 1 ? tenants[0] : null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) return <main className="fd-page"><h1>Configurar marca</h1><p>No se pudieron comprobar tus negocios.</p>
    <button className="fd-button" onClick={() => void refetch()}>Volver a consultar</button></main>;

  if (parameters.get('mode') === 'business' || tenants?.length === 0) return <div className="min-h-screen bg-background">
    {!!tenants?.length && <button className="fd-link" onClick={() => navigate('/onboarding')}>Volver a la marca actual</button>}
    <OnboardingWizard onComplete={async businessId => {
      await queryClient.invalidateQueries({ queryKey: ['business-tenants'] });
      const fresh = await refetch();
      const created = (fresh.data as BusinessTenant[] | undefined)?.find(tenant => tenant.id === businessId);
      if (!created) throw new Error('El negocio se activó; vuelve a consultar tus negocios para continuar con su marca.');
      await setActiveBusiness(created); navigate('/onboarding', { replace: true });
    }} />
  </div>;

  return <main className="fd-page">
    <div className="fd-toolbar"><button className="fd-link" onClick={() => navigate('/')}>Volver a Inicio</button>
      <button className="fd-button" onClick={() => navigate('/onboarding?mode=business')}>Crear otro negocio</button></div>
    {current?.id && service?.client.onboarding ? <BrandSetupPanel key={current.id} service={service} businessId={current.id} onClose={() => navigate('/')}
      onSaved={async receipt => {
        if ((await service.client.session()).actorId !== receipt.actor_id) return;
        await Promise.all([queryClient.invalidateQueries({ queryKey: ['business-tenants'] }),
          queryClient.invalidateQueries({ queryKey: ['business-config', receipt.business_id] })]);
        const fresh = await refetch();
        if ((await service.client.session()).actorId !== receipt.actor_id) return;
        const saved = fresh.data?.find(tenant => tenant.id === receipt.business_id);
        if (saved) useDesignStore.setState(state => state.activeBusiness?.id === receipt.business_id ? { activeBusiness: saved } : {});
      }} />
      : <><h1>Configurar marca</h1><p>{current ? 'La configuración creativa de marca todavía no está habilitada en este entorno.' : 'Elige el negocio cuya marca quieres configurar.'}</p></>}
    {!current && !!tenants?.length && <div className="fd-toolbar">{tenants.map(tenant => <button key={tenant.id} className="fd-button"
      onClick={() => void setActiveBusiness(tenant)}>{tenant.name}</button>)}</div>}
  </main>;
}

export default OnboardingPage;
