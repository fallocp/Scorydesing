import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthGate } from "./components/AuthGate";
import ScoryDesignPage from "./pages/XendingDesignPage";
import OnboardingPage from "./pages/OnboardingPage";
import CampaignWizardPage from "./pages/CampaignWizardPage";
import ContentLibraryPage from "./pages/ContentLibraryPage";
import ContentCalendarPage from "./pages/ContentCalendarPage";
import AssetLibraryPage from "./pages/AssetLibraryPage";
import StockGeneratorPage from "./pages/StockGeneratorPage";
import BrandPalettePage from "./pages/BrandPalettePage";
import BusinessAdminPage from "./pages/BusinessAdminPage";
import BulletinPage from "./pages/BulletinPage";
import PresentationsPage from "./pages/PresentationsPage";
import ComplianceWizardPage from "./pages/ComplianceWizardPage";
import DesignStudioPage from "./pages/DesignStudioPage";

function App() {
  return (
    <>
      <Toaster position="top-right" richColors />
      <AuthGate>
        <Routes>
          <Route path="/" element={<ScoryDesignPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/campaign" element={<CampaignWizardPage />} />
          <Route path="/xending-design/campaign" element={<CampaignWizardPage />} />
          <Route path="/content-library" element={<ContentLibraryPage />} />
          <Route path="/content-calendar" element={<ContentCalendarPage />} />
          <Route path="/xending-design/calendar" element={<ContentCalendarPage />} />
          <Route path="/assets" element={<AssetLibraryPage />} />
          <Route path="/stock-generator" element={<StockGeneratorPage />} />
          <Route path="/brand-palette" element={<BrandPalettePage />} />
          <Route path="/admin" element={<BusinessAdminPage />} />
          <Route path="/admin/business" element={<BusinessAdminPage />} />
          <Route path="/bulletin" element={<BulletinPage />} />
          <Route path="/presentations" element={<PresentationsPage />} />
          <Route path="/compliance" element={<ComplianceWizardPage />} />
          <Route path="/design-studio" element={<DesignStudioPage />} />
          <Route path="/xending-design/pipeline" element={<CampaignWizardPage />} />
          <Route path="/library" element={<ContentLibraryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthGate>
    </>
  );
}

export default App;
