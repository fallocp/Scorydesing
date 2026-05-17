/**
 * Sistema de logging de auditoría
 * Registra todas las acciones críticas para compliance y seguridad
 */

export enum AuditEventType {
  // Autenticación
  AUTH_LOGIN = 'AUTH_LOGIN',
  AUTH_LOGOUT = 'AUTH_LOGOUT',
  AUTH_FAILED = 'AUTH_FAILED',
  AUTH_TOKEN_REFRESH = 'AUTH_TOKEN_REFRESH',
  
  // Cotizaciones
  QUOTE_REQUESTED = 'QUOTE_REQUESTED',
  QUOTE_RECEIVED = 'QUOTE_RECEIVED',
  QUOTE_EXPIRED = 'QUOTE_EXPIRED',
  QUOTE_CANCELLED = 'QUOTE_CANCELLED',
  
  // Órdenes y transacciones
  ORDER_CREATED = 'ORDER_CREATED',
  ORDER_SUBMITTED = 'ORDER_SUBMITTED',
  ORDER_COMPLETED = 'ORDER_COMPLETED',
  ORDER_FAILED = 'ORDER_FAILED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  
  // Operaciones financieras
  TRADE_EXECUTED = 'TRADE_EXECUTED',
  PAYMENT_INITIATED = 'PAYMENT_INITIATED',
  PAYMENT_COMPLETED = 'PAYMENT_COMPLETED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  
  // Acceso a datos
  DATA_ACCESS = 'DATA_ACCESS',
  DATA_EXPORT = 'DATA_EXPORT',
  DATA_MODIFICATION = 'DATA_MODIFICATION',
  
  // Seguridad
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  
  // Sistema
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  SYSTEM_STARTUP = 'SYSTEM_STARTUP',
  SYSTEM_SHUTDOWN = 'SYSTEM_SHUTDOWN',
  
  // Compliance
  KYC_CHECK = 'KYC_CHECK',
  AML_ALERT = 'AML_ALERT',
  REGULATORY_REPORT = 'REGULATORY_REPORT'
}

export enum AuditSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface AuditEvent {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  severity: AuditSeverity;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  partnerId?: string;
  customerId?: string;
  
  // Datos del evento
  action: string;
  resource?: string;
  resourceId?: string;
  
  // Detalles adicionales
  details: Record<string, any>;
  
  // Datos sensibles (hasheados)
  sensitiveData?: Record<string, string>;
  
  // Resultado
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  
  // Contexto
  requestId?: string;
  correlationId?: string;
  
  // Metadatos
  environment: 'development' | 'staging' | 'production';
  version: string;
}

/**
 * Logger de auditoría
 */
export class AuditLogger {
  private static instance: AuditLogger;
  private events: AuditEvent[] = [];
  private maxEvents: number = 10000;
  private environment: 'development' | 'staging' | 'production';
  
  private constructor() {
    this.environment = import.meta.env.PROD ? 'production' : 'development';
    console.log(`🔍 AuditLogger inicializado en modo: ${this.environment}`);
  }

  public static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  /**
   * Registra un evento de auditoría
   */
  public logEvent(
    eventType: AuditEventType,
    action: string,
    context: {
      severity?: AuditSeverity;
      userId?: string;
      sessionId?: string;
      ipAddress?: string;
      userAgent?: string;
      partnerId?: string;
      customerId?: string;
      resource?: string;
      resourceId?: string;
      details?: Record<string, any>;
      sensitiveData?: Record<string, any>;
      success?: boolean;
      errorCode?: string;
      errorMessage?: string;
      requestId?: string;
      correlationId?: string;
    } = {}
  ): void {
    try {
      const event: AuditEvent = {
        id: this.generateEventId(),
        timestamp: new Date(),
        eventType,
        severity: context.severity || this.determineSeverity(eventType),
        userId: context.userId,
        sessionId: context.sessionId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        partnerId: context.partnerId,
        customerId: context.customerId,
        action,
        resource: context.resource,
        resourceId: context.resourceId,
        details: context.details || {},
        sensitiveData: context.sensitiveData ? this.hashSensitiveData(context.sensitiveData) : undefined,
        success: context.success !== undefined ? context.success : true,
        errorCode: context.errorCode,
        errorMessage: context.errorMessage,
        requestId: context.requestId,
        correlationId: context.correlationId,
        environment: this.environment,
        version: '1.0.0' // TODO: Obtener de package.json
      };

      // Agregar a la cola de eventos
      this.events.push(event);
      
      // Mantener solo los últimos N eventos en memoria
      if (this.events.length > this.maxEvents) {
        this.events = this.events.slice(-this.maxEvents);
      }

      // Log inmediato para eventos críticos
      if (event.severity === AuditSeverity.CRITICAL || event.severity === AuditSeverity.HIGH) {
        this.logToConsole(event);
      }

      // En producción, enviar a sistema de logging externo
      if (this.environment === 'production') {
        this.sendToExternalLogger(event);
      }

    } catch (error) {
      console.error('❌ Error logging audit event:', error);
    }
  }

  /**
   * Métodos de conveniencia para eventos comunes
   */
  public logAuthentication(
    success: boolean, 
    userId?: string, 
    ipAddress?: string, 
    errorMessage?: string
  ): void {
    this.logEvent(
      success ? AuditEventType.AUTH_LOGIN : AuditEventType.AUTH_FAILED,
      success ? 'Usuario autenticado exitosamente' : 'Fallo de autenticación',
      {
        severity: success ? AuditSeverity.LOW : AuditSeverity.MEDIUM,
        userId,
        ipAddress,
        success,
        errorMessage,
        details: { loginAttempt: true }
      }
    );
  }

  public logQuoteRequest(
    partnerId: string,
    customerId: string,
    fromCurrency: string,
    toCurrency: string,
    amount: number,
    success: boolean,
    errorMessage?: string
  ): void {
    this.logEvent(
      AuditEventType.QUOTE_REQUESTED,
      'Solicitud de cotización',
      {
        severity: AuditSeverity.LOW,
        partnerId,
        customerId,
        success,
        errorMessage,
        details: {
          currencyPair: `${fromCurrency}/${toCurrency}`,
          amount,
          timestamp: new Date().toISOString()
        }
      }
    );
  }

  public logOrderSubmission(
    orderId: string,
    partnerId: string,
    customerId: string,
    amount: number,
    currency: string,
    success: boolean,
    errorMessage?: string
  ): void {
    this.logEvent(
      success ? AuditEventType.ORDER_SUBMITTED : AuditEventType.ORDER_FAILED,
      success ? 'Orden enviada exitosamente' : 'Fallo al enviar orden',
      {
        severity: success ? AuditSeverity.MEDIUM : AuditSeverity.HIGH,
        partnerId,
        customerId,
        resourceId: orderId,
        success,
        errorMessage,
        details: {
          amount,
          currency,
          orderType: 'FX_TRADE'
        }
      }
    );
  }

  public logSecurityViolation(
    violation: string,
    ipAddress?: string,
    userAgent?: string,
    details?: Record<string, any>
  ): void {
    this.logEvent(
      AuditEventType.SECURITY_VIOLATION,
      `Violación de seguridad: ${violation}`,
      {
        severity: AuditSeverity.HIGH,
        ipAddress,
        userAgent,
        success: false,
        details: {
          violationType: violation,
          ...details
        }
      }
    );
  }

  public logDataAccess(
    resource: string,
    resourceId: string,
    userId?: string,
    action: string = 'READ'
  ): void {
    this.logEvent(
      AuditEventType.DATA_ACCESS,
      `Acceso a datos: ${action}`,
      {
        severity: AuditSeverity.LOW,
        userId,
        resource,
        resourceId,
        details: {
          accessType: action,
          timestamp: new Date().toISOString()
        }
      }
    );
  }

  /**
   * Obtiene eventos de auditoría con filtros
   */
  public getEvents(filters: {
    eventType?: AuditEventType;
    severity?: AuditSeverity;
    userId?: string;
    partnerId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  } = {}): AuditEvent[] {
    let filteredEvents = [...this.events];

    if (filters.eventType) {
      filteredEvents = filteredEvents.filter(e => e.eventType === filters.eventType);
    }

    if (filters.severity) {
      filteredEvents = filteredEvents.filter(e => e.severity === filters.severity);
    }

    if (filters.userId) {
      filteredEvents = filteredEvents.filter(e => e.userId === filters.userId);
    }

    if (filters.partnerId) {
      filteredEvents = filteredEvents.filter(e => e.partnerId === filters.partnerId);
    }

    if (filters.startDate) {
      filteredEvents = filteredEvents.filter(e => e.timestamp >= filters.startDate!);
    }

    if (filters.endDate) {
      filteredEvents = filteredEvents.filter(e => e.timestamp <= filters.endDate!);
    }

    // Ordenar por timestamp descendente (más recientes primero)
    filteredEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filters.limit) {
      filteredEvents = filteredEvents.slice(0, filters.limit);
    }

    return filteredEvents;
  }

  /**
   * Genera reporte de auditoría
   */
  public generateAuditReport(
    startDate: Date,
    endDate: Date
  ): {
    summary: {
      totalEvents: number;
      eventsByType: Record<string, number>;
      eventsBySeverity: Record<string, number>;
      successRate: number;
    };
    events: AuditEvent[];
  } {
    const events = this.getEvents({ startDate, endDate });
    
    const eventsByType: Record<string, number> = {};
    const eventsBySeverity: Record<string, number> = {};
    let successfulEvents = 0;

    for (const event of events) {
      // Contar por tipo
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
      
      // Contar por severidad
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
      
      // Contar exitosos
      if (event.success) {
        successfulEvents++;
      }
    }

    const successRate = events.length > 0 ? (successfulEvents / events.length) * 100 : 0;

    return {
      summary: {
        totalEvents: events.length,
        eventsByType,
        eventsBySeverity,
        successRate
      },
      events
    };
  }

  /**
   * Métodos privados
   */
  private generateEventId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private determineSeverity(eventType: AuditEventType): AuditSeverity {
    const severityMap: Record<AuditEventType, AuditSeverity> = {
      [AuditEventType.AUTH_FAILED]: AuditSeverity.MEDIUM,
      [AuditEventType.SECURITY_VIOLATION]: AuditSeverity.HIGH,
      [AuditEventType.RATE_LIMIT_EXCEEDED]: AuditSeverity.MEDIUM,
      [AuditEventType.SUSPICIOUS_ACTIVITY]: AuditSeverity.HIGH,
      [AuditEventType.SYSTEM_ERROR]: AuditSeverity.HIGH,
      [AuditEventType.ORDER_FAILED]: AuditSeverity.HIGH,
      [AuditEventType.PAYMENT_FAILED]: AuditSeverity.HIGH,
      [AuditEventType.AML_ALERT]: AuditSeverity.CRITICAL,
      // Eventos de baja severidad por defecto
      [AuditEventType.AUTH_LOGIN]: AuditSeverity.LOW,
      [AuditEventType.QUOTE_REQUESTED]: AuditSeverity.LOW,
      [AuditEventType.DATA_ACCESS]: AuditSeverity.LOW,
      [AuditEventType.ORDER_CREATED]: AuditSeverity.MEDIUM,
      [AuditEventType.TRADE_EXECUTED]: AuditSeverity.MEDIUM,
      [AuditEventType.KYC_CHECK]: AuditSeverity.MEDIUM,
      // Agregar más mapeos según sea necesario
    } as any;

    return severityMap[eventType] || AuditSeverity.LOW;
  }

  private hashSensitiveData(data: Record<string, any>): Record<string, string> {
    const hashed: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(data)) {
      // Crear hash simple (en producción usar crypto más robusto)
      const hash = btoa(String(value)).substring(0, 16);
      hashed[key] = `hash_${hash}`;
    }
    
    return hashed;
  }

  private logToConsole(event: AuditEvent): void {
    const severity = event.severity === AuditSeverity.CRITICAL ? '🚨' : 
                    event.severity === AuditSeverity.HIGH ? '⚠️' : 
                    event.severity === AuditSeverity.MEDIUM ? '📋' : '📝';
    
    console.log(`${severity} AUDIT [${event.eventType}] ${event.action}`, {
      id: event.id,
      timestamp: event.timestamp.toISOString(),
      success: event.success,
      userId: event.userId,
      partnerId: event.partnerId,
      details: event.details
    });
  }

  private async sendToExternalLogger(event: AuditEvent): Promise<void> {
    // En producción, enviar a servicio de logging externo
    // Por ejemplo: Supabase, CloudWatch, Datadog, etc.
    try {
      // TODO: Implementar envío a sistema externo
      console.log('📤 Sending audit event to external logger:', event.id);
    } catch (error) {
      console.error('❌ Failed to send audit event to external logger:', error);
    }
  }
}

// Instancia singleton
export const auditLogger = AuditLogger.getInstance();