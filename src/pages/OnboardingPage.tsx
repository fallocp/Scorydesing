/**
 * OnboardingPage — Hosts the 8-step OnboardingWizard.
 *
 * Route: /onboarding
 * First-run experience for new deployments. Redirects to onboarding when
 * no tenants exist.
 *
 * Requirements: 14.1, 14.10, 14.11
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { useBusinessTenants } from '@/hooks/useBusinessTenants';

function OnboardingPage() {
  const navigate = useNavigate();
  const { data: tenants, isLoading } = useBusinessTenants();

  // If tenants already exist, redirect to main design page
  useEffect(() => {
    if (!isLoading && tenants && tenants.length > 0) {
      navigate('/', { replace: true });
    }
  }, [isLoading, tenants, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <OnboardingWizard />
    </div>
  );
}

export default OnboardingPage;
