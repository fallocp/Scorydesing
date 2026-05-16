import { useState, useEffect } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean; // true if user is admin, master_admin, or has master admin email
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    isAdmin: false
  });

  useEffect(() => {
    let mounted = true;

    // Get initial session once
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;

        const user = session?.user ?? null;
        const isMasterAdmin = user?.email === 'rcabanas@xendinglobal.com' ||
          user?.email === 'admin@xendinglobal.com' ||
          user?.email === 'masteradmin@xendinglobal.com';

        setState({
          user,
          session,
          loading: false,
          isAdmin: !!isMasterAdmin
        });
      } catch (error) {
        console.error('Auth init error:', error);
        if (mounted) {
          setState(prev => ({ ...prev, loading: false }));
        }
      }
    };

    // Set up auth listener (simplified)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;

        const user = session?.user ?? null;
        const isMasterAdmin = user?.email === 'rcabanas@xendinglobal.com' ||
          user?.email === 'admin@xendinglobal.com' ||
          user?.email === 'masteradmin@xendinglobal.com';

        setState({
          user,
          session,
          loading: false,
          isAdmin: !!isMasterAdmin
        });
      }
    );

    initAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, fullName?: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName
          }
        }
      });

      if (error) {
        toast.error(error.message);
        return { error };
      }

      toast.success('¡Cuenta creada! Revisa tu correo para confirmar tu cuenta.');
      return { error: null };
    } catch (error) {
      const errorMessage = 'Error al crear cuenta';
      toast.error(errorMessage);
      return { error: { message: errorMessage } as AuthError };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        toast.error(error.message);
        return { error };
      }

      toast.success('¡Bienvenido!');
      return { error: null };
    } catch (error) {
      const errorMessage = 'Error al iniciar sesión';
      toast.error(errorMessage);
      return { error: { message: errorMessage } as AuthError };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        toast.error(error.message);
        return { error };
      }

      // Clear remembered credentials on sign out
      localStorage.removeItem('xending_remembered_email');
      localStorage.removeItem('xending_remember_me');

      toast.success('Sesión cerrada');
      return { error: null };
    } catch (error) {
      const errorMessage = 'Error al cerrar sesión';
      toast.error(errorMessage);
      return { error: { message: errorMessage } as AuthError };
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?mode=reset`
      });

      if (error) {
        toast.error(error.message);
        return { error };
      }

      toast.success('Se ha enviado un enlace de recuperación a tu correo electrónico');
      return { error: null };
    } catch (error) {
      const errorMessage = 'Error al enviar correo de recuperación';
      toast.error(errorMessage);
      return { error: { message: errorMessage } as AuthError };
    }
  };

  return {
    ...state,
    signUp,
    signIn,
    signOut,
    resetPassword
  };
}