/**
 * AuthGate — Bypass de autenticación para desarrollo.
 *
 * Hace auto-login con las credenciales de .env al montar la app.
 * Muestra un loader mientras autentica. Si falla, muestra un form
 * básico de email/password como fallback.
 *
 * Reemplazar con sistema de auth propio cuando esté listo.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    // Check if there's already an active session
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setStatus('authenticated');
      return;
    }

    // Try auto-login with env credentials
    const email = import.meta.env.VITE_AUTH_EMAIL;
    const password = import.meta.env.VITE_AUTH_PASSWORD;

    if (email && password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error) {
        setStatus('authenticated');
        return;
      }
      console.warn('Auto-login failed:', error.message);
    }

    setStatus('unauthenticated');
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F3F0]">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 border-2 border-[#2ED4C7] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Conectando...</p>
        </div>
      </div>
    );
  }

  if (status === 'authenticated') {
    return <>{children}</>;
  }

  return <LoginFallback onSuccess={() => setStatus('authenticated')} error={error} setError={setError} />;
}

/** Fallback login form */
function LoginFallback({
  onSuccess,
  error,
  setError,
}: {
  onSuccess: () => void;
  error: string | null;
  setError: (e: string | null) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      onSuccess();
    }
  }, [email, password, onSuccess, setError]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F3F0]">
      <div className="w-full max-w-sm space-y-6 p-8 bg-white rounded-xl shadow-lg">
        <div className="text-center">
          <h1 className="text-xl font-bold text-[#0F1419]">ScoryDesign</h1>
          <p className="text-sm text-muted-foreground mt-1">Inicia sesión para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full bg-[#0F1419] hover:bg-[#1a2332] text-white"
            disabled={loading}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  );
}
