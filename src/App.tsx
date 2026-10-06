import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthGate } from "./components/AuthGate";
import { useInitActiveBusiness } from "./hooks/useInitActiveBusiness";
import ScoryDesignPage from "./pages/XendingDesignPage";
import OnboardingPage from "./pages/OnboardingPage";
import ContentLibraryPage from "./pages/ContentLibraryPage";
import ContentCalendarPage from "./pages/ContentCalendarPage";
import AssetLibraryPage from "./pages/AssetLibraryPage";
import BrandPalettePage from "./pages/BrandPalettePage";
import BusinessAdminPage from "./pages/BusinessAdminPage";
import PresentationsPage from "./pages/PresentationsPage";
import FreeDesignPage from "./pages/FreeDesignPage";
import MaterialsPage from "./pages/MaterialsPage";
import DesignStudioPage from "./pages/DesignStudioPage";
import CreateEditPage from "./pages/CreateEditPage";
import CreateDesignPage from "./pages/CreateDesignPage";
import { CreateEntryHandoff } from "./components/create-edit/CreateEntryHandoff";

function App() {
  return (
    <>
      <Toaster position="top-right" richColors />
      <AuthGate>
        <AuthenticatedApp />
      </AuthGate>
    </>
  );
}

/**
 * Rendered only after authentication. Inicializa el negocio activo (auto-select
 * + rehidratación de la sesión) antes de exponer las rutas.
 */
function AuthenticatedApp() {
  useInitActiveBusiness();
  return (
    <><CreateEntryHandoff /><Routes>
      <Route path="/create" element={<CreateEditPage />} />
      <Route path="/create/design" element={<CreateDesignPage />} />
      <Route path="/" element={<ScoryDesignPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/content-library" element={<ContentLibraryPage />} />
      <Route path="/content-calendar" element={<ContentCalendarPage />} />
      <Route path="/xending-design/calendar" element={<ContentCalendarPage />} />
      <Route path="/assets" element={<AssetLibraryPage />} />
      <Route path="/brand-palette" element={<BrandPalettePage />} />
      <Route path="/admin" element={<BusinessAdminPage />} />
      <Route path="/admin/business" element={<BusinessAdminPage />} />
      <Route path="/presentations" element={<PresentationsPage />} />
      <Route path="/free-design" element={<FreeDesignPage />} />
      <Route path="/materials" element={<MaterialsPage />} />
      <Route path="/design-studio" element={<DesignStudioPage />} />
      <Route path="/library" element={<ContentLibraryPage />} />
      {/*
        Aquí vivían `/campaign`, `/xending-design/campaign` y
        `/xending-design/pipeline`, las tres apuntando a `CampaignWizardPage`:
        el "Asistente de Campaña" (StrategyPlanner → CopyWorkstation →
        PipelineProgressPanel), la generación anterior a Design Studio.

        Se desrutearon junto con sus cinco entradas de UI: la tarjeta "Nueva
        Campaña" y el botón "Continuar diseño" del Home, el botón "Crear Piezas"
        de `IdeasPanel`, el "Guardar y editar" de Boletín Express y el "Continuar
        pipeline" de `ContentLibraryTable`.

        La generación vive en Design Studio (`/design-studio`): imágenes,
        carruseles, guiones, News y el kit FX, sobre copy kits y compliance.

        El código de las páginas y componentes sigue en el repo a propósito: esto
        es el paso reversible antes del borrado. Con las rutas fuera,
        `generate-ideas` queda sin llamador, y con él las compuertas de
        `resolveKitSlug` y el contexto legacy de `prompt_kit`/`strategic_config`.

        También salieron `/bulletin` (BulletinPage), `/stock-generator`
        (Image Stock, cuyo código exclusivo se retiró después) y `/compliance` (ComplianceWizardPage), con sus tarjetas
        del Home: herramientas fuera de uso. Nadie más navegaba a esas tres rutas,
        así que no quedaron botones muertos.

        Las reglas de compliance no se perdieron: se editan en el Admin Panel →
        tab Compliance (`ComplianceRulesEditor`), sobre la misma columna
        `business_tenants.compliance_rules` que ya consumía el backend.
      */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes></>
  );
}

export default App;
