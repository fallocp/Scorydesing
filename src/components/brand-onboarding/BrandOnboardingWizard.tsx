/**
 * BrandOnboardingWizard — Multi-step wizard for brand identity extraction.
 *
 * Allows users to upload brand materials (PDF, images), triggers AI extraction
 * via the brand-onboarding Edge Function, and presents extracted data with
 * confidence scores for user confirmation/correction.
 *
 * Requirements: 4.1, 4.2, 5.1, 5.2, 5.3, 5.4
 */

import { useState, useCallback, useRef } from 'react';
import {
  Upload, FileImage, Loader2, CheckCircle2, AlertTriangle,
  Pencil, X, Plus, Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { invokeWithRetry } from '@/lib/supabase-retry';
import { cn } from '@/lib/utils';

import type {
  FileCategory,
  ExtractedBrand,
  FieldConfidence,
  Suggestion,
  BrandOnboardingResponse,
} from '../../../supabase/functions/_shared/brand-onboarding-types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type WizardStep = 'upload' | 'extracting' | 'confirmation';

interface UploadedFileEntry {
  file: File;
  category: FileCategory;
  storagePath?: string;
  publicUrl?: string;
}

interface BrandOnboardingWizardProps {
  businessId: string;
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/svg+xml',
];

const CATEGORY_OPTIONS: { value: FileCategory; label: string }[] = [
  { value: 'brand_book', label: 'Brand Book / Manual de marca' },
  { value: 'logo', label: 'Logo' },
  { value: 'business_card', label: 'Tarjeta de presentación' },
  { value: 'stationery', label: 'Papelería' },
  { value: 'website_screenshot', label: 'Screenshot web' },
  { value: 'social_screenshot', label: 'Screenshot redes' },
  { value: 'other', label: 'Otro' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getConfidenceBg(confidence: number): string {
  if (confidence >= 0.9) return 'bg-green-100 text-green-800 border-green-200';
  if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  return 'bg-red-100 text-red-800 border-red-200';
}

function getConfidenceIcon(confidence: number) {
  if (confidence >= 0.9) return '🟢';
  if (confidence >= 0.6) return '🟡';
  return '🔴';
}

function inferCategory(file: File): FileCategory {
  if (file.type === 'application/pdf') return 'brand_book';
  if (file.type === 'image/svg+xml') return 'logo';
  if (file.name.toLowerCase().includes('logo')) return 'logo';
  if (file.name.toLowerCase().includes('tarjeta') || file.name.toLowerCase().includes('card')) return 'business_card';
  return 'other';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function BrandOnboardingWizard({ businessId }: BrandOnboardingWizardProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Wizard state
  const [step, setStep] = useState<WizardStep>('upload');
  const [files, setFiles] = useState<UploadedFileEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Extraction state
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Confirmation state
  const [extractedBrand, setExtractedBrand] = useState<ExtractedBrand | null>(null);
  const [fieldConfidence, setFieldConfidence] = useState<Record<string, FieldConfidence>>({});
  const [overallConfidence, setOverallConfidence] = useState(0);
  const [needsUserInput, setNeedsUserInput] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  // Inline editing state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  // Loading states
  const [isUploading, setIsUploading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: File Upload
  // ─────────────────────────────────────────────────────────────────────────

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (f) => ACCEPTED_TYPES.includes(f.type)
    );
    if (droppedFiles.length === 0) {
      toast({ title: 'Formato no soportado', description: 'Acepta PDF, PNG, JPG o SVG.', variant: 'destructive' });
      return;
    }
    const entries: UploadedFileEntry[] = droppedFiles.map((file) => ({
      file,
      category: inferCategory(file),
    }));
    setFiles((prev) => [...prev, ...entries]);
  }, [toast]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected) return;
    const validFiles = Array.from(selected).filter(
      (f) => ACCEPTED_TYPES.includes(f.type)
    );
    const entries: UploadedFileEntry[] = validFiles.map((file) => ({
      file,
      category: inferCategory(file),
    }));
    setFiles((prev) => [...prev, ...entries]);
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateFileCategory = useCallback((index: number, category: FileCategory) => {
    setFiles((prev) => prev.map((f, i) => i === index ? { ...f, category } : f));
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Upload to Supabase Storage & Start Extraction
  // ─────────────────────────────────────────────────────────────────────────

  const startExtraction = useCallback(async () => {
    if (files.length === 0) return;
    setIsUploading(true);
    setStep('extracting');
    setExtractionProgress(10);

    try {
      // Upload files to Supabase Storage
      const uploadedUrls: string[] = [];
      const categories: FileCategory[] = [];

      for (let i = 0; i < files.length; i++) {
        const entry = files[i];
        const ext = entry.file.name.split('.').pop() || 'bin';
        const storagePath = `${businessId}/${Date.now()}-${i}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('brand-assets')
          .upload(storagePath, entry.file, {
            contentType: entry.file.type,
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Error subiendo ${entry.file.name}: ${uploadError.message}`);
        }

        const { data: urlData } = supabase.storage
          .from('brand-assets')
          .getPublicUrl(storagePath);

        uploadedUrls.push(urlData.publicUrl);
        categories.push(entry.category);

        // Update progress during upload phase (10-50%)
        setExtractionProgress(10 + Math.round(((i + 1) / files.length) * 40));
      }

      // Call Edge Function to start extraction
      setExtractionProgress(55);

      const response = await invokeWithRetry<BrandOnboardingResponse>(
        'brand-onboarding',
        {
          body: {
            action: 'start',
            business_id: businessId,
            file_urls: uploadedUrls,
            file_categories: categories,
          },
        }
      );

      setExtractionProgress(90);

      if (response.status === 'failed') {
        throw new Error(response.error || 'La extracción falló');
      }

      // Store results
      setSessionId(response.session_id);
      setExtractedBrand(response.extracted_brand || null);
      setFieldConfidence(response.field_confidence || {});
      setOverallConfidence(response.extracted_brand?.extraction_metadata?.overall_confidence || 0);
      setNeedsUserInput(response.needs_user_input || []);
      setSuggestions(response.suggestions || []);

      setExtractionProgress(100);

      // Move to confirmation step
      setTimeout(() => setStep('confirmation'), 500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast({ title: 'Error en extracción', description: message, variant: 'destructive' });
      setStep('upload');
    } finally {
      setIsUploading(false);
    }
  }, [files, businessId, toast]);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Confirm / Correct
  // ─────────────────────────────────────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    if (!sessionId) return;
    setIsConfirming(true);

    try {
      const corrections = Object.keys(editValues).length > 0 ? editValues : undefined;
      const action = corrections ? 'correct' : 'confirm';

      await invokeWithRetry<BrandOnboardingResponse>(
        'brand-onboarding',
        {
          body: {
            action,
            business_id: businessId,
            session_id: sessionId,
            ...(corrections && { corrections }),
          },
        }
      );

      toast({ title: '¡Marca guardada!', description: 'La identidad de marca se guardó correctamente.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast({ title: 'Error al guardar', description: message, variant: 'destructive' });
    } finally {
      setIsConfirming(false);
    }
  }, [sessionId, businessId, editValues, toast]);

  const handleUploadMore = useCallback(() => {
    setStep('upload');
  }, []);

  const startEditing = useCallback((field: string, currentValue: string) => {
    setEditingField(field);
    setEditValues((prev) => ({ ...prev, [field]: currentValue }));
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingField(null);
  }, []);

  const saveEdit = useCallback((field: string) => {
    setEditingField(null);
    // editValues already has the updated value
  }, []);

  // Check if minimum fields are present
  const hasMinimumFields = extractedBrand
    ? Boolean(
        extractedBrand.colors?.primary &&
        extractedBrand.colors?.secondary &&
        extractedBrand.colors?.accent &&
        extractedBrand.fonts?.display
      )
    : false;

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Step 1 — Upload
  // ─────────────────────────────────────────────────────────────────────────

  const renderUploadStep = () => (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">Subir materiales de marca</h2>
        <p className="text-sm text-muted-foreground">
          Sube tu brand book (PDF) o materiales como logo, tarjetas, screenshots.
          El sistema extraerá automáticamente tu identidad de marca.
        </p>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleFileDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/50'
        )}
        role="button"
        aria-label="Zona de carga de archivos"
      >
        <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm font-medium">
          Arrastra archivos aquí o haz clic para seleccionar
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF, PNG, JPG, SVG — Máximo 10MB por archivo
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.svg"
          onChange={handleFileSelect}
          className="hidden"
          aria-hidden="true"
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Archivos seleccionados ({files.length})</h3>
          <div className="space-y-2">
            {files.map((entry, idx) => (
              <div
                key={`${entry.file.name}-${idx}`}
                className="flex items-center gap-3 p-3 rounded-md border bg-muted/30"
              >
                <FileImage className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{entry.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(entry.file.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <select
                  value={entry.category}
                  onChange={(e) => updateFileCategory(idx, e.target.value as FileCategory)}
                  className="text-xs border rounded px-2 py-1 bg-background"
                  aria-label={`Categoría de ${entry.file.name}`}
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFile(idx)}
                  aria-label={`Eliminar ${entry.file.name}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Start button */}
      <div className="flex justify-end">
        <Button
          onClick={startExtraction}
          disabled={files.length === 0 || isUploading}
          className="gap-2"
        >
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Iniciar extracción
        </Button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Step 2 — Extracting
  // ─────────────────────────────────────────────────────────────────────────

  const renderExtractingStep = () => (
    <div className="flex flex-col items-center justify-center py-16 space-y-6">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">Extrayendo identidad de marca...</h2>
        <p className="text-sm text-muted-foreground">
          Analizando tus materiales con IA. Esto puede tomar unos segundos.
        </p>
      </div>
      <div className="w-full max-w-sm space-y-2">
        <Progress value={extractionProgress} className="h-2" />
        <p className="text-xs text-center text-muted-foreground">
          {extractionProgress < 50
            ? 'Subiendo archivos...'
            : extractionProgress < 90
            ? 'Analizando contenido...'
            : 'Finalizando...'}
        </p>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Step 3 — Confirmation
  // ─────────────────────────────────────────────────────────────────────────

  const renderConfirmationStep = () => {
    if (!extractedBrand) return null;

    const colorsConf = fieldConfidence['colors']?.confidence ?? 0;
    const fontsConf = fieldConfidence['fonts']?.confidence ?? 0;
    const disclaimerConf = fieldConfidence['disclaimer']?.confidence ?? 0;
    const complianceConf = fieldConfidence['compliance_rules']?.confidence ?? 0;

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <h2 className="text-xl font-semibold">Extracción completada</h2>
          <Badge className={cn('ml-auto', getConfidenceBg(overallConfidence))}>
            {getConfidenceIcon(overallConfidence)} Confianza general: {Math.round(overallConfidence * 100)}%
          </Badge>
        </div>

        {/* Logo */}
        {extractedBrand.logo_url && (
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="shrink-0">
                <img
                  src={extractedBrand.logo_url}
                  alt="Logo extraído"
                  className="h-16 w-16 object-contain rounded border bg-white p-1"
                />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Logo</p>
              </div>
              <Badge className={getConfidenceBg(fieldConfidence['logo_url']?.confidence ?? 0.95)}>
                {Math.round((fieldConfidence['logo_url']?.confidence ?? 0.95) * 100)}%
              </Badge>
            </CardContent>
          </Card>
        )}

        {/* Colors */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Colores</p>
              <div className="flex items-center gap-2">
                <Badge className={getConfidenceBg(colorsConf)}>
                  {getConfidenceIcon(colorsConf)} {Math.round(colorsConf * 100)}%
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startEditing('colors', JSON.stringify(extractedBrand.colors))}
                  aria-label="Editar colores"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {editingField === 'colors' ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Primario</label>
                    <Input
                      value={editValues['colors.primary'] || extractedBrand.colors.primary}
                      onChange={(e) => setEditValues((prev) => ({ ...prev, 'colors.primary': e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Secundario</label>
                    <Input
                      value={editValues['colors.secondary'] || extractedBrand.colors.secondary}
                      onChange={(e) => setEditValues((prev) => ({ ...prev, 'colors.secondary': e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Acento</label>
                    <Input
                      value={editValues['colors.accent'] || extractedBrand.colors.accent}
                      onChange={(e) => setEditValues((prev) => ({ ...prev, 'colors.accent': e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={cancelEditing}>Cancelar</Button>
                  <Button size="sm" onClick={() => saveEdit('colors')}>
                    <Save className="h-3.5 w-3.5 mr-1" /> Guardar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex gap-2">
                  {[extractedBrand.colors.primary, extractedBrand.colors.secondary, extractedBrand.colors.accent].map(
                    (color) => (
                      <div key={color} className="flex items-center gap-1.5">
                        <div
                          className="w-6 h-6 rounded border"
                          style={{ backgroundColor: color }}
                          aria-label={`Color ${color}`}
                        />
                        <span className="text-xs font-mono">{color}</span>
                      </div>
                    )
                  )}
                </div>
                {extractedBrand.colors.extended && extractedBrand.colors.extended.length > 0 && (
                  <div className="flex gap-1 ml-2">
                    {extractedBrand.colors.extended.map((color) => (
                      <div
                        key={color}
                        className="w-4 h-4 rounded border"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Fonts */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Tipografías</p>
              <div className="flex items-center gap-2">
                <Badge className={getConfidenceBg(fontsConf)}>
                  {getConfidenceIcon(fontsConf)} {Math.round(fontsConf * 100)}%
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startEditing('fonts', '')}
                  aria-label="Editar tipografías"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {editingField === 'fonts' ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Display</label>
                    <Input
                      value={editValues['fonts.display'] || extractedBrand.fonts.display}
                      onChange={(e) => setEditValues((prev) => ({ ...prev, 'fonts.display': e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Body</label>
                    <Input
                      value={editValues['fonts.body'] || extractedBrand.fonts.body}
                      onChange={(e) => setEditValues((prev) => ({ ...prev, 'fonts.body': e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Mono</label>
                    <Input
                      value={editValues['fonts.mono'] || extractedBrand.fonts.mono}
                      onChange={(e) => setEditValues((prev) => ({ ...prev, 'fonts.mono': e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={cancelEditing}>Cancelar</Button>
                  <Button size="sm" onClick={() => saveEdit('fonts')}>
                    <Save className="h-3.5 w-3.5 mr-1" /> Guardar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">Display:</span>
                  <p className="font-medium">{editValues['fonts.display'] || extractedBrand.fonts.display}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Body:</span>
                  <p className="font-medium">{editValues['fonts.body'] || extractedBrand.fonts.body}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Mono:</span>
                  <p className="font-medium">{editValues['fonts.mono'] || extractedBrand.fonts.mono}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Disclaimer */}
        {(extractedBrand.disclaimer || needsUserInput.includes('disclaimer')) && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Disclaimer</p>
                <div className="flex items-center gap-2">
                  <Badge className={getConfidenceBg(disclaimerConf)}>
                    {getConfidenceIcon(disclaimerConf)} {Math.round(disclaimerConf * 100)}%
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEditing('disclaimer', extractedBrand.disclaimer || '')}
                    aria-label="Editar disclaimer"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {editingField === 'disclaimer' ? (
                <div className="space-y-2">
                  <Input
                    value={editValues['disclaimer'] ?? extractedBrand.disclaimer ?? ''}
                    onChange={(e) => setEditValues((prev) => ({ ...prev, disclaimer: e.target.value }))}
                    className="text-xs"
                    placeholder="Texto del disclaimer..."
                  />
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={cancelEditing}>Cancelar</Button>
                    <Button size="sm" onClick={() => saveEdit('disclaimer')}>
                      <Save className="h-3.5 w-3.5 mr-1" /> Guardar
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  "{editValues['disclaimer'] || extractedBrand.disclaimer || '—'}"
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Compliance Rules */}
        {(extractedBrand.compliance_rules || needsUserInput.includes('compliance_rules')) && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Reglas de Compliance</p>
                <div className="flex items-center gap-2">
                  <Badge className={getConfidenceBg(complianceConf)}>
                    {getConfidenceIcon(complianceConf)} {Math.round(complianceConf * 100)}%
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEditing('compliance_rules', '')}
                    aria-label="Editar reglas de compliance"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {editingField === 'compliance_rules' ? (
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Términos prohibidos (separados por coma)</label>
                    <Input
                      value={
                        editValues['compliance_rules.forbidden_terms'] ??
                        (extractedBrand.compliance_rules?.forbidden_terms?.join(', ') || '')
                      }
                      onChange={(e) => setEditValues((prev) => ({
                        ...prev,
                        'compliance_rules.forbidden_terms': e.target.value,
                      }))}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Calificadores requeridos (separados por coma)</label>
                    <Input
                      value={
                        editValues['compliance_rules.required_qualifiers'] ??
                        (extractedBrand.compliance_rules?.required_qualifiers?.join(', ') || '')
                      }
                      onChange={(e) => setEditValues((prev) => ({
                        ...prev,
                        'compliance_rules.required_qualifiers': e.target.value,
                      }))}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={cancelEditing}>Cancelar</Button>
                    <Button size="sm" onClick={() => saveEdit('compliance_rules')}>
                      <Save className="h-3.5 w-3.5 mr-1" /> Guardar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  {extractedBrand.compliance_rules?.forbidden_terms &&
                    extractedBrand.compliance_rules.forbidden_terms.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground">Términos prohibidos:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {extractedBrand.compliance_rules.forbidden_terms.map((term) => (
                          <Badge key={term} variant="destructive" className="text-xs">
                            {term}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {extractedBrand.compliance_rules?.required_qualifiers &&
                    extractedBrand.compliance_rules.required_qualifiers.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground">Calificadores:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {extractedBrand.compliance_rules.required_qualifiers.map((q) => (
                          <Badge key={q} variant="secondary" className="text-xs">
                            {q}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Missing fields / Suggestions */}
        {needsUserInput.length > 0 && (
          <Card className="border-yellow-200 bg-yellow-50/50">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <p className="text-sm font-medium text-yellow-800">No pudimos detectar:</p>
              </div>
              <ul className="space-y-1 pl-6">
                {needsUserInput.map((field) => {
                  const suggestion = suggestions.find((s) => s.field === field);
                  return (
                    <li key={field} className="text-sm text-yellow-700">
                      • <span className="font-mono text-xs">{field}</span>
                      {suggestion && (
                        <span className="text-muted-foreground"> — {suggestion.message}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Low confidence warning */}
        {overallConfidence < 0.5 && (
          <Card className="border-red-200 bg-red-50/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <p className="text-sm text-red-800">
                  La confianza general es baja. Recomendamos subir materiales adicionales para mejorar la extracción.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3 pt-4 border-t">
          <Button
            onClick={handleConfirm}
            disabled={!hasMinimumFields || isConfirming}
            className="gap-2"
          >
            {isConfirming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Confirmar y guardar
          </Button>

          {overallConfidence < 0.7 && (
            <Button variant="outline" onClick={handleUploadMore} className="gap-2">
              <Plus className="h-4 w-4" />
              Subir más materiales
            </Button>
          )}

          {!hasMinimumFields && (
            <p className="text-xs text-muted-foreground ml-auto">
              Faltan campos mínimos: colores primario, secundario, acento y font display.
            </p>
          )}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Main Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileImage className="h-5 w-5" />
            Brand Onboarding
          </CardTitle>
        </CardHeader>
        <CardContent>
          {step === 'upload' && renderUploadStep()}
          {step === 'extracting' && renderExtractingStep()}
          {step === 'confirmation' && renderConfirmationStep()}
        </CardContent>
      </Card>
    </div>
  );
}
