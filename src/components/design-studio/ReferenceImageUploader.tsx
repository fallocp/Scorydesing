import { useState, useCallback, useRef } from 'react';
import { Upload, X, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { validateReferenceFile } from '@/utils/design-studio/fileValidator';

interface ReferenceImageUploaderProps {
  onFileSelect: (file: File | null) => void;
  onDescriptionChange: (desc: string) => void;
  preview: string | null;
  description: string;
  disabled?: boolean;
}

export function ReferenceImageUploader({
  onFileSelect,
  onDescriptionChange,
  preview,
  description,
  disabled = false,
}: ReferenceImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const handleFile = useCallback(
    (file: File) => {
      setErrors([]);
      const result = validateReferenceFile(file);

      if (!result.isValid) {
        setErrors(result.errors);
        return;
      }

      onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile, disabled]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setIsDragOver(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleRemove = () => {
    onFileSelect(null);
    setErrors([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      {!preview && (
        <div>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !disabled && fileInputRef.current?.click()}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled}
            onKeyDown={(e) => {
              if (disabled) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors',
              disabled
                ? 'cursor-not-allowed opacity-50 border-muted-foreground/15'
                : 'cursor-pointer',
              !disabled && isDragOver
                ? 'border-[#2ED4C7] bg-[#2ED4C7]/5'
                : !disabled
                  ? 'border-muted-foreground/25 hover:border-muted-foreground/50'
                  : ''
            )}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                Arrastra una imagen aquí o haz clic para explorar
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PNG, JPG, WEBP o PDF — máx 10MB
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.pdf"
              onChange={handleFileInput}
              className="hidden"
              disabled={disabled}
              aria-label="Subir imagen de referencia"
            />
          </div>

          {/* Validation errors */}
          {errors.length > 0 && (
            <div className="mt-2 space-y-1">
              {errors.map((error, i) => (
                <p key={i} className="text-sm text-destructive">
                  {error}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Image preview */}
      {preview && (
        <div className="space-y-3">
          <div className="relative max-w-md">
            <img
              src={preview}
              alt="Vista previa de imagen de referencia"
              className="w-full rounded-lg border"
            />
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7"
              onClick={handleRemove}
              disabled={disabled}
              aria-label="Eliminar imagen de referencia"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
            <span>Imagen de referencia cargada</span>
          </div>
        </div>
      )}

      {/* Adaptation description */}
      <div className="space-y-2">
        <Label htmlFor="reference-description">
          Descripción de adaptación (opcional)
        </Label>
        <Textarea
          id="reference-description"
          placeholder="Ej: Quiero algo así pero con mi branding, más oscuro..."
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          disabled={disabled}
          rows={3}
        />
      </div>
    </div>
  );
}
