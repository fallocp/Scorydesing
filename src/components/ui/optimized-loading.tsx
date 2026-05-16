/**
 * Componentes de loading optimizados para mejor UX
 */

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

// Loading genérico optimizado
export const OptimizedLoading: React.FC<{ 
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}> = ({ message = 'Cargando...', size = 'md' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6', 
    lg: 'h-8 w-8'
  };

  return (
    <div className="flex items-center justify-center p-4">
      <div className="flex items-center space-x-2">
        <div className={`animate-spin rounded-full border-2 border-primary border-t-transparent ${sizeClasses[size]}`} />
        <span className="text-sm text-muted-foreground">{message}</span>
      </div>
    </div>
  );
};

// Loading skeleton para QuickQuote
export const QuickQuoteLoading: React.FC = () => (
  <Card className="p-6 bg-blue-50 border-blue-200">
    <div className="flex items-center space-x-2 mb-4">
      <Skeleton className="h-5 w-5 rounded" />
      <Skeleton className="h-6 w-32" />
    </div>
    
    <Skeleton className="h-4 w-full mb-6" />
    
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <div className="space-y-3">
        <Skeleton className="h-4 w-16" />
        <div className="flex space-x-2 p-4 bg-blue-100 border border-blue-300 rounded-lg">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 flex-1" />
        </div>
      </div>
      
      <div className="space-y-3">
        <Skeleton className="h-4 w-16" />
        <div className="flex space-x-2 p-4 bg-blue-100 border border-blue-300 rounded-lg">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 flex-1" />
        </div>
      </div>
    </div>
    
    <div className="mb-6">
      <Skeleton className="h-4 w-32 mb-2" />
      <Skeleton className="h-10 w-full" />
    </div>
    
    <Skeleton className="h-10 w-full" />
  </Card>
);

// Loading skeleton para Dashboard
export const DashboardLoading: React.FC = () => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-6 w-24" />
    </div>
    
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="p-6">
          <div className="flex items-center justify-between mb-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-4 rounded" />
          </div>
          <Skeleton className="h-8 w-16 mb-1" />
          <Skeleton className="h-3 w-24" />
        </Card>
      ))}
    </div>
    
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="p-6">
        <Skeleton className="h-6 w-32 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center space-x-3">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </Card>
      
      <Card className="p-6">
        <Skeleton className="h-6 w-32 mb-4" />
        <Skeleton className="h-48 w-full" />
      </Card>
    </div>
  </div>
);

// Loading skeleton para operaciones
export const OperationsLoading: React.FC = () => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-10 w-32" />
    </div>
    
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="p-4">
          <Skeleton className="h-4 w-20 mb-2" />
          <Skeleton className="h-6 w-12" />
        </Card>
      ))}
    </div>
    
    <Card>
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      
      <div className="p-4">
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center space-x-4 p-3 border rounded">
              <Skeleton className="h-10 w-10 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <div className="text-right space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </Card>
  </div>
);

// Loading skeleton para formularios
export const FormLoading: React.FC = () => (
  <Card className="p-6">
    <Skeleton className="h-6 w-48 mb-6" />
    
    <div className="space-y-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      
      <div className="flex justify-end space-x-2">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  </Card>
);

// HOC para lazy loading con skeleton personalizado
export const withLoadingSkeleton = <P extends object>(
  Component: React.ComponentType<P>,
  LoadingSkeleton: React.ComponentType = OptimizedLoading
) => {
  return React.forwardRef<any, P>((props, ref) => (
    <React.Suspense fallback={<LoadingSkeleton />}>
      <Component {...props} ref={ref} />
    </React.Suspense>
  ));
};