/**
 * Error Boundary optimizado para mejor UX
 * Maneja errores de manera elegante sin romper toda la aplicación
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { auditLogger, AuditEventType } from '@/security/AuditLogger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetOnPropsChange?: boolean;
  resetKeys?: Array<string | number>;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  private resetTimeoutId: number | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Generar ID único para el error
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('🚨 ErrorBoundary caught an error:', error, errorInfo);
    
    // Log del error en el sistema de auditoría
    auditLogger.logEvent(
      AuditEventType.SYSTEM_ERROR,
      'Error boundary activated',
      {
        success: false,
        errorCode: error.name,
        errorMessage: error.message,
        details: {
          componentStack: errorInfo.componentStack,
          errorStack: error.stack?.substring(0, 1000), // Limitar stack trace
          errorId: this.state.errorId
        }
      }
    );

    this.setState({
      error,
      errorInfo
    });

    // Callback personalizado
    this.props.onError?.(error, errorInfo);

    // Auto-reset después de 30 segundos
    this.resetTimeoutId = window.setTimeout(() => {
      this.handleReset();
    }, 30000);
  }

  componentDidUpdate(prevProps: Props) {
    const { resetOnPropsChange, resetKeys } = this.props;
    const { hasError } = this.state;

    // Reset automático cuando cambian las props críticas
    if (hasError && resetOnPropsChange && resetKeys) {
      const hasResetKeyChanged = resetKeys.some((key, index) => {
        const prevKey = (prevProps.resetKeys || [])[index];
        return key !== prevKey;
      });

      if (hasResetKeyChanged) {
        this.handleReset();
      }
    }
  }

  componentWillUnmount() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
  }

  handleReset = () => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
      this.resetTimeoutId = null;
    }

    console.log('🔄 ErrorBoundary: Resetting error state');
    
    // Log del reset
    auditLogger.logEvent(
      AuditEventType.SYSTEM_ERROR,
      'Error boundary reset',
      {
        success: true,
        details: {
          errorId: this.state.errorId,
          resetType: 'manual'
        }
      }
    );

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null
    });
  };

  render() {
    if (this.state.hasError) {
      // Usar fallback personalizado si se proporciona
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Fallback por defecto
      return (
        <Card className="p-6 m-4">
          <div className="flex items-center space-x-3 mb-4">
            <AlertTriangle className="h-6 w-6 text-red-500" />
            <h2 className="text-lg font-semibold text-red-700">
              Algo salió mal
            </h2>
          </div>

          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <p>Se produjo un error inesperado en esta sección.</p>
              <p>El error ha sido registrado automáticamente.</p>
            </div>

            {/* Mostrar detalles del error solo en desarrollo */}
            {import.meta.env.DEV && this.state.error && (
              <details className="bg-gray-50 p-3 rounded text-xs">
                <summary className="cursor-pointer font-medium mb-2">
                  Detalles técnicos (desarrollo)
                </summary>
                <div className="space-y-2">
                  <div>
                    <strong>Error:</strong> {this.state.error.message}
                  </div>
                  <div>
                    <strong>ID:</strong> {this.state.errorId}
                  </div>
                  {this.state.error.stack && (
                    <div>
                      <strong>Stack:</strong>
                      <pre className="mt-1 text-xs bg-white p-2 rounded overflow-auto max-h-32">
                        {this.state.error.stack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            <div className="flex space-x-3">
              <Button onClick={this.handleReset} className="flex items-center space-x-2">
                <RefreshCw className="h-4 w-4" />
                <span>Reintentar</span>
              </Button>
              
              <Button 
                variant="outline" 
                onClick={() => window.location.reload()}
              >
                Recargar Página
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              ID del error: {this.state.errorId}
            </div>
          </div>
        </Card>
      );
    }

    return this.props.children;
  }
}

// HOC para envolver componentes con error boundary
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode,
  onError?: (error: Error, errorInfo: ErrorInfo) => void
) => {
  const WrappedComponent = React.forwardRef<any, P>((props, ref) => (
    <ErrorBoundary fallback={fallback} onError={onError}>
      <Component {...props} ref={ref} />
    </ErrorBoundary>
  ));

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
};

// Error boundary específico para componentes FX
export const FXErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    fallback={
      <Card className="p-4 bg-red-50 border-red-200">
        <div className="flex items-center space-x-2 text-red-700">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-medium">Error en componente FX</span>
        </div>
        <p className="text-xs text-red-600 mt-2">
          Este componente de cotización encontró un error. 
          Intenta recargar la página o contacta soporte.
        </p>
      </Card>
    }
    onError={(error, errorInfo) => {
      // Log específico para errores FX
      auditLogger.logEvent(
        AuditEventType.SYSTEM_ERROR,
        'FX component error',
        {
          success: false,
          errorCode: error.name,
          errorMessage: error.message,
          details: {
            componentType: 'FX',
            componentStack: errorInfo.componentStack?.substring(0, 500)
          }
        }
      );
    }}
  >
    {children}
  </ErrorBoundary>
);