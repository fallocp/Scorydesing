import { useNavigate } from 'react-router-dom';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { usePresentationDesignService } from '@/components/presentations/PresentationDesignContext';
import { MaterialsPanel } from '@/components/desaing/MaterialsPanel';
import './FreeDesignPage.css';

export default function MaterialsPage() {
  const { activeBusinessId } = useActiveBusiness(), service = usePresentationDesignService(), navigate = useNavigate();
  return <main className="fd-page"><button className="fd-link" onClick={() => navigate('/')}>Volver a Inicio</button>
    <h1>Materiales de referencia</h1><p>Documentación e ideas para revisar y reutilizar en tus diseños.</p>
    {activeBusinessId && service?.client.materials ? <MaterialsPanel key={activeBusinessId} businessId={activeBusinessId}
      client={service.client} onClose={() => navigate('/')} />
      : <p>{activeBusinessId ? 'La biblioteca de materiales todavía no está habilitada en este entorno.' : 'Selecciona un negocio para abrir sus materiales.'}</p>}
  </main>;
}
