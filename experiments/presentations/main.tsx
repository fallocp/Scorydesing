import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PresentationsPage from '@/pages/PresentationsPage';
import FreeDesignPage from '@/pages/FreeDesignPage';
import MaterialsPage from '@/pages/MaterialsPage';
import OnboardingPage from '@/pages/OnboardingPage';
import { Toaster } from '@/components/ui/toaster';
import '@/index.css';
import { seedDraft, TEST_BUSINESS_ID, TEST_DRAFT_KEY, TEST_OTHER_BUSINESS_ID } from './fixture';
import { cloudCalls } from './mockSupabase';
import { PresentationDesignProvider } from '@/components/presentations/PresentationDesignContext';
import { createDesignServerClient } from '@/lib/desaing/serverClient';
import type { ExplorationPlanner, ExplorationRequest, ExplorationResult } from '../../supabase/functions/_shared/desaing/explorationContracts';
import { openExplorationStore } from '@/lib/desaing/explorationStore';
import { openVisualProposalStore } from '@/lib/desaing/visualProposalStore';
import { ProductionHarness } from './ProductionHarness';
import { PromptAdminPanel } from '@/components/desaing/PromptAdminPanel';

const productionEnabled = import.meta.env.PRESENTATIONS_TEST_PUBLIC_PRODUCTION === 'true';
const promptAdminEnabled = import.meta.env.PRESENTATIONS_TEST_PUBLIC_PROMPT_ADMIN === 'true';
const productionOrigin = 'https://local-generation.invalid';
/** Keep logical HTTPS URLs visible to the authentic client validator; transport only the exact test origin over loopback. */
const productionFetch: typeof fetch = async (input, init) => {
  const source = new URL(input instanceof Request ? input.url : String(input));
  if (source.origin !== productionOrigin) throw Error('production_harness_external_transport_blocked');
  const destination = `${location.origin}${source.pathname}${source.search}`;
  return fetch(input instanceof Request ? new Request(destination, input) : destination, init);
};
const designClient = createDesignServerClient({ endpoint: `${productionEnabled ? productionOrigin : location.origin}/functions/v1/desaing-server`,
  ...(productionEnabled ? { fetch: productionFetch } : {}),
  getSession: async () => ({ actorId: 'c402a035-1ae3-42b8-ad5d-604dc03ba7cc', accessToken: 'local-design-session' }),
});
const explorationEnabled = import.meta.env.PRESENTATIONS_TEST_PUBLIC_EXPLORATION === 'true';
const planner: ExplorationPlanner = {
  async plan(request: ExplorationRequest) {
    const response = await fetch('/__desaing-explore', { method: 'POST', headers: {
      authorization: 'Bearer local-design-session', 'content-type': 'application/json' }, body: JSON.stringify(request) });
    if (!response.ok) throw new Error('exploration_response_unknown');
    return await response.json() as ExplorationResult;
  },
  async recover(requestKey: string) {
    const response = await fetch(`/__desaing-explore/recover?request_key=${encodeURIComponent(requestKey)}`, {
      headers: { authorization: 'Bearer local-design-session' } });
    if (!response.ok) throw new Error('exploration_response_unknown');
    return await response.json() as ExplorationResult | null;
  },
};

seedDraft();
Object.assign(window, { __presentationHarness: {
  businessId: TEST_BUSINESS_ID,
  otherBusinessId: TEST_OTHER_BUSINESS_ID,
  draftKey: TEST_DRAFT_KEY,
  cloudCalls,
  designClient,
  ...(import.meta.env.PRESENTATIONS_TEST_PUBLIC_PROPOSALS === 'true' ? { async readVisualProposals(documentId: string, slideId: string) {
    const store = await openVisualProposalStore({ actor_id: 'c402a035-1ae3-42b8-ad5d-604dc03ba7cc', business_id: TEST_BUSINESS_ID,
      session_id: `presentation:${documentId}:${slideId}` });
    try { return await store.read(); } finally { store.close(); }
  } } : {}),
  ...(explorationEnabled ? { async readExploration(documentId: string, slideId: string) {
    const store = await openExplorationStore({ actor_id: 'c402a035-1ae3-42b8-ad5d-604dc03ba7cc', business_id: TEST_BUSINESS_ID,
      session_id: `presentation:${documentId}:${slideId}` });
    try {
      const record = await store.read(); if (!record) return null;
      const blob = record.value.capture;
      const digest = blob ? await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()) : null;
      return { ...record, value: { ...record.value, capture: null },
        capture_bytes: blob?.size ?? 0, capture_sha256: digest ? Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') : null };
    } finally { store.close(); }
  } } : {}),
} });
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const app = (
  <QueryClientProvider client={queryClient}>
    <PresentationDesignProvider value={{ client: designClient, simulation: import.meta.env.PRESENTATIONS_TEST_PUBLIC_GENERATION !== 'true',
      ...(explorationEnabled ? { exploration: import.meta.env.PRESENTATIONS_TEST_PUBLIC_DURABLE_EXPLORATION === 'true'
        ? { createPlanner: (businessId: string) => designClient.exploration!(businessId), simulation: true }
        : { planner, simulation: true } } : {}) }}><BrowserRouter>{import.meta.env.PRESENTATIONS_TEST_PUBLIC_WORKSPACE === 'true'
          ? <Routes><Route path="/free-design" element={<FreeDesignPage />} /><Route path="/materials" element={<MaterialsPage />} />
            {import.meta.env.PRESENTATIONS_TEST_PUBLIC_ONBOARDING === 'true' && <Route path="/onboarding" element={<OnboardingPage />} />}
            {productionEnabled && <Route path="/production" element={<ProductionHarness />} />}
            {promptAdminEnabled && <Route path="/prompt-admin" element={<main className="mx-auto max-w-6xl p-6"><PromptAdminPanel client={designClient} businessId={TEST_BUSINESS_ID} /></main>} />}
            <Route path="*" element={<PresentationsPage />} /></Routes>
          : <PresentationsPage />}<Toaster /></BrowserRouter></PresentationDesignProvider>
  </QueryClientProvider>
);
ReactDOM.createRoot(document.getElementById('root')!).render(explorationEnabled ? <React.StrictMode>{app}</React.StrictMode> : app);
