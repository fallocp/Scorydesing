import { useCallback, useEffect, useState } from 'react';
import type { DesignBrandContext, DesignBrandReader } from './designBrandContext';

type Status = 'idle' | 'loading' | 'ready' | 'error';
interface State { businessId: string; reader?: DesignBrandReader; context: DesignBrandContext | null; status: Status; error: string }

/** Business and reader changes invalidate old values synchronously, before effects run. No QueryClient is needed. */
export function useDesignBrandContext(businessId: string, reader?: DesignBrandReader) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<State>({ businessId: '', context: null, status: 'idle', error: '' });
  const refresh = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    let active = true;
    if (!reader || !businessId) {
      setState({ businessId, reader, context: null, status: 'idle', error: '' });
      return () => { active = false; };
    }
    setState({ businessId, reader, context: null, status: 'loading', error: '' });
    void reader.read(businessId).then(context => {
      if (!active) return;
      if (context && context.business_id !== businessId) throw new Error('design_brand_invalid_response');
      setState({ businessId, reader, context, status: 'ready', error: '' });
    }).catch(() => {
      if (active) setState({ businessId, reader, context: null, status: 'error', error: 'No se pudo cargar la identidad de este negocio. Puedes volver a intentarlo.' });
    });
    return () => { active = false; };
  }, [businessId, reader, version]);
  const current = state.businessId === businessId && state.reader === reader;
  return { context: current ? state.context : null, status: current ? state.status : reader && businessId ? 'loading' as const : 'idle' as const,
    error: current ? state.error : '', refresh };
}
