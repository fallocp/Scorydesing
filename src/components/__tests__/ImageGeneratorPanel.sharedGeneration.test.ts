import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import type { SharedDesignImageResult } from '@/lib/desaing/sharedImageGeneration';

const fixture = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0, deps: null as unknown[] | null, effect: null as (() => void) | null,
  brand: 'xending', business: 'business-a', actor: 'actor-a',
  generate: vi.fn(), recover: vi.fn(), save: vi.fn(), acknowledge: vi.fn(), toast: vi.fn(),
  events: [] as string[],
}));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = fixture.cursor++;
    if (!(index in fixture.values)) fixture.values[index] = initial;
    return [fixture.values[index], (value: unknown) => { fixture.values[index] = value; }];
  },
  useRef: (initial: unknown) => {
    const index = fixture.cursor++;
    if (!(index in fixture.values)) fixture.values[index] = { current: initial };
    return fixture.values[index];
  },
  useEffect: (effect: () => void, deps: unknown[]) => {
    if (!fixture.deps || deps.some((value, index) => value !== fixture.deps![index])) {
      fixture.deps = deps; fixture.effect = effect;
    }
  },
}));
vi.mock('@/hooks/useGenerateImage', () => ({ useGenerateImage: () => ({
  mutateAsync: fixture.generate, isPending: false,
  imageSettings: { model: 'gpt-image-2.5-flare', quality: 'medium' }, setImageSettings: vi.fn(),
}) }));
vi.mock('@/store/designStore', () => ({ useDesignStore: (selector: (state: unknown) => unknown) => selector({ selectedBrand: fixture.brand }) }));
vi.mock('@/hooks/useActiveBusiness', () => ({ useActiveBusiness: () => ({ activeBusinessId: fixture.business }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: fixture.actor ? { id: fixture.actor } : null }) }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: fixture.toast }) }));
vi.mock('@/utils/imageStock/saveImageToLibrary', () => ({ saveImageToLibrary: fixture.save }));
vi.mock('@/lib/desaing/sharedImageGeneration', () => ({
  acknowledgeSharedDesignImage: fixture.acknowledge, recoverSharedDesignImage: fixture.recover,
}));
import { ImageGeneratorPanel } from '../ImageGeneratorPanel';

const result = {
  imageBase64: btoa('fake rendered image'), operation_key: 'operation-a', business_id: 'business-a', actor_id: 'actor-a',
  promptUsed: { promptFinal: 'Exact compiled globe prompt', negativeInstructions: '' },
  scope: { businessId: 'business-a', process: 'stock', slotKey: 'standalone-image:current:v0',
    library: { brand: 'xending', collection: 'generated', description: 'Original globe' } },
} as unknown as SharedDesignImageResult;

function nodes(tree: ReactNode): ReactElement<Record<string, any>>[] {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  const element = tree as ReactElement<Record<string, any>>;
  return [element, ...nodes(element.props?.children)];
}
function text(tree: ReactNode): string {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (!tree || typeof tree !== 'object') return '';
  return Array.isArray(tree) ? tree.map(text).join('') : text((tree as ReactElement<Record<string, any>>).props?.children);
}
function render() {
  fixture.cursor = 0;
  return ImageGeneratorPanel();
}
function button(label: string) {
  const node = nodes(render()).find(node => typeof node.props?.onClick === 'function' && text(node) === label);
  expect(node, `button ${label}`).toBeTruthy();
  return node!.props;
}
function mount() {
  render(); fixture.effect?.(); fixture.effect = null;
  const field = nodes(render()).find(node => node.props?.id === 'image-prompt')!;
  field.props.onChange({ target: { value: 'Original globe' } });
}
beforeEach(() => {
  vi.clearAllMocks();
  fixture.values = []; fixture.cursor = 0; fixture.deps = null; fixture.effect = null;
  fixture.brand = 'xending'; fixture.business = 'business-a'; fixture.actor = 'actor-a'; fixture.events = [];
  fixture.generate.mockResolvedValue({ imageBase64: result.imageBase64, results: [result], promptUsed: result.promptUsed });
  fixture.recover.mockResolvedValue(result);
  fixture.save.mockImplementation(async () => { fixture.events.push('save'); return 'https://saved.test/image.png'; });
  fixture.acknowledge.mockImplementation(async () => { fixture.events.push('ack'); });
});

describe('standalone image result lifecycle', () => {
  it('keeps a failed approval save available for retry and acknowledges only after persistence', async () => {
    mount();
    await button('Generar Imagen').onClick();
    expect(fixture.generate).toHaveBeenCalledWith(expect.objectContaining({ generationKey: 'current',
      libraryContext: { brand: 'xending', collection: 'generated', description: 'Original globe' } }));
    fixture.save.mockRejectedValueOnce(new Error('Disconnected'));
    await button('Aprobar y Guardar').onClick();
    expect(fixture.acknowledge).not.toHaveBeenCalled();
    expect(button('Aprobar y Guardar').disabled).toBe(false);
    expect(button('Generar Imagen').disabled).toBe(true);
    await button('Aprobar y Guardar').onClick();
    expect(fixture.save).toHaveBeenLastCalledWith(expect.objectContaining({ generation: result, promptUsed: result.promptUsed.promptFinal }));
    expect(fixture.events).toEqual(['save', 'ack']);
    expect(text(render())).toContain('Imagen aprobada y guardada');
  });

  it('rejects the current result explicitly before freeing the slot for a new generation', async () => {
    mount(); await button('Generar Imagen').onClick();
    fixture.acknowledge.mockRejectedValueOnce(new Error('Session changed'));
    await button('Rechazar y Reintentar').onClick();
    expect(button('Generar Imagen').disabled).toBe(true);
    expect(nodes(render()).some(node => node.props?.alt === 'Vista previa de imagen generada')).toBe(true);
    await button('Rechazar y Reintentar').onClick();
    expect(button('Generar Imagen').disabled).toBe(false);
    expect(fixture.save).not.toHaveBeenCalled();
  });

  it('recovers a pending image without rendering and saves its frozen description after prompt edits', async () => {
    mount();
    const field = nodes(render()).find(node => node.props?.id === 'image-prompt')!;
    field.props.onChange({ target: { value: 'Edited new prompt' } });
    await button('Recuperar imagen pendiente').onClick();
    expect(fixture.generate).not.toHaveBeenCalled();
    expect(fixture.recover).toHaveBeenCalledWith({ actorId: 'actor-a', businessId: 'business-a', process: 'stock', slotKey: 'standalone-image:current:v0' });
    await button('Aprobar y Guardar').onClick();
    expect(fixture.save).toHaveBeenCalledWith(expect.objectContaining({ description: 'Original globe', generation: result }));
  });

  it('ignores a late result after changing brand and business', async () => {
    mount();
    let finish!: (value: unknown) => void;
    fixture.generate.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const generating = button('Generar Imagen').onClick();
    fixture.brand = 'xending_capital'; fixture.business = 'business-b';
    render(); fixture.effect?.(); fixture.effect = null;
    finish({ imageBase64: result.imageBase64, results: [result], promptUsed: result.promptUsed });
    await generating;
    expect(nodes(render()).some(node => node.props?.alt === 'Vista previa de imagen generada')).toBe(false);
    expect(fixture.save).not.toHaveBeenCalled(); expect(fixture.acknowledge).not.toHaveBeenCalled();
  });

  it('hides the previous actor image and prompt before effects, while retaining the original pending operation', async () => {
    mount(); await button('Generar Imagen').onClick();
    expect(nodes(render()).some(node => node.props?.alt === 'Vista previa de imagen generada')).toBe(true);
    fixture.actor = 'actor-b';
    const switched = render();
    expect(nodes(switched).some(node => node.props?.alt === 'Vista previa de imagen generada')).toBe(false);
    expect(nodes(switched).find(node => node.props?.id === 'image-prompt')?.props.value).toBe('');
    expect(fixture.acknowledge).not.toHaveBeenCalled();
    fixture.effect?.(); fixture.effect = null;
    // Returning to actor A must explicitly recover; the old result was cleared.
    fixture.actor = 'actor-a'; render(); fixture.effect?.(); fixture.effect = null;
    expect(nodes(render()).some(node => node.props?.alt === 'Vista previa de imagen generada')).toBe(false);
    await button('Recuperar imagen pendiente').onClick();
    expect(nodes(render()).some(node => node.props?.alt === 'Vista previa de imagen generada')).toBe(true);
    expect(fixture.generate).toHaveBeenCalledOnce();
  });

  it('ignores generation completed for a different actor in the same business', async () => {
    mount();
    let finish!: (value: unknown) => void;
    fixture.generate.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const generating = button('Generar Imagen').onClick();
    fixture.actor = 'actor-b'; render(); fixture.effect?.(); fixture.effect = null;
    finish({ imageBase64: result.imageBase64, results: [result], promptUsed: result.promptUsed });
    await generating;
    expect(nodes(render()).some(node => node.props?.alt === 'Vista previa de imagen generada')).toBe(false);
    expect(fixture.save).not.toHaveBeenCalled(); expect(fixture.acknowledge).not.toHaveBeenCalled();
  });

  it('keeps the result and blocks settings while rejection acknowledgement is unresolved or fails', async () => {
    mount(); await button('Generar Imagen').onClick();
    let fail!: (error: Error) => void;
    fixture.acknowledge.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    const rejecting = button('Rechazar y Reintentar').onClick();
    const settings = nodes(render()).find(node => node.props?.value?.model === 'gpt-image-2.5-flare');
    expect(settings?.props.disabled).toBe(true);
    expect(button('Aprobar y Guardar').disabled).toBe(true);
    expect(button('Rechazar y Reintentar').disabled).toBe(true);
    fail(new Error('Acknowledgement not delivered')); await rejecting;
    expect(nodes(render()).some(node => node.props?.alt === 'Vista previa de imagen generada')).toBe(true);
    expect(button('Rechazar y Reintentar').disabled).toBe(false);
    expect(button('Generar Imagen').disabled).toBe(true);
  });
});
