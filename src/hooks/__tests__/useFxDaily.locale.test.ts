/**
 * useFxDaily: el locale viaja en el body de generate-fx-daily y el mensaje del
 * servidor en respuestas no-2xx (error.context) llega al estado `error`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  states: [] as unknown[], cursor: 0, invoke: vi.fn(),
}));
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const i = f.cursor++;
    if (!(i in f.states)) f.states[i] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    return [f.states[i], (next: unknown) => {
      f.states[i] = typeof next === 'function' ? (next as (prev: unknown) => unknown)(f.states[i]) : next;
    }];
  },
  useRef: (initial: unknown) => { const i = f.cursor++; return f.states[i] ?? (f.states[i] = { current: initial }); },
  useCallback: (callback: unknown) => callback, useEffect: vi.fn(),
}));
vi.mock('../useActiveBusiness', () => ({ useActiveBusiness: () => ({ activeBusinessId: 'business-a' }) }));
vi.mock('../useDesignMockups', () => ({ useSaveMockup: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: f.invoke } } }));
vi.mock('@/utils/design-studio/buildFxDailyHtml', () => ({ buildFxDailyHtml: vi.fn() }));
vi.mock('@/utils/xendingDesign/canvasRenderer', () => ({ renderHtmlToPng: vi.fn() }));

import { useFxDaily } from '../useFxDaily';

function renderHook<T>(hook: () => T): T { f.cursor = 0; return hook(); }
const render = () => renderHook(useFxDaily);

const okResponse = {
  data: {
    report: { headline: 'H', commentary: [], drivers: [], escenarios: [], en_la_mira: [] },
    headline_options: [{ value: 'H', source: 'alternative' }],
    image_prompt: 'prompt',
  },
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks(); f.states = []; f.cursor = 0;
  f.invoke.mockResolvedValue(okResponse);
});

describe('useFxDaily locale', () => {
  it("por defecto envía locale 'es'", async () => {
    render().setRawInput('# MD');
    expect(await render().processMd()).toBe(true);
    expect(f.invoke).toHaveBeenCalledWith('generate-fx-daily', {
      body: { business_id: 'business-a', raw_input: '# MD', locale: 'es' },
    });
  });

  it("tras setLocale('en') envía locale 'en'", async () => {
    const hook = render();
    hook.setRawInput('# MD');
    hook.setLocale('en');
    expect(render().locale).toBe('en');
    expect(await render().processMd()).toBe(true);
    expect(f.invoke.mock.calls[0][1].body.locale).toBe('en');
  });

  it('muestra el message del servidor en un 422', async () => {
    const message = 'La versión en inglés no pasó la validación: X';
    f.invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        context: new Response(JSON.stringify({ error: 'en_validation_failed', message }), { status: 422 }),
      }),
    });
    render().setRawInput('# MD');
    expect(await render().processMd()).toBe(false);
    expect(render().error).toBe(message);
  });

  it('reset conserva el idioma elegido', () => {
    render().setLocale('en');
    render().reset();
    expect(render().locale).toBe('en');
  });
});
