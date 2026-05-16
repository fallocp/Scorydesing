import { useState, useCallback, useRef } from 'react';
import { Upload, X, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

interface UploadedImage {
  file: File;
  previewUrl: string;
  description: string;
  tags: string;
}

export function ManualImageUpload() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return 'Tipo de archivo inválido. Por favor sube solo imágenes PNG, JPG o WebP.';
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `Archivo demasiado grande. El tamaño máximo es ${MAX_SIZE_MB}MB.`;
    }
    return null;
  };

  const handleFile = useCallback(
    (file: File) => {
      const error = validateFile(file);
      if (error) {
        toast({ title: 'Error de subida', description: error, variant: 'destructive' });
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      setUploadedImage({ file, previewUrl, description: '', tags: '' });
    },
    [toast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

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
    if (uploadedImage) {
      URL.revokeObjectURL(uploadedImage.previewUrl);
    }
    setUploadedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      {!uploadedImage && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors',
            isDragOver
              ? 'border-[#2ED4C7] bg-[#2ED4C7]/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          )}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              Arrastra una imagen aquí o haz clic para explorar
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PNG, JPG o WebP — máx {MAX_SIZE_MB}MB
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp"
            onChange={handleFileInput}
            className="hidden"
            aria-label="Subir archivo de imagen"
          />
        </div>
      )}

      {/* Preview and metadata form */}
      {uploadedImage && (
        <div className="space-y-4">
          {/* Image preview */}
          <div className="relative max-w-md">
            <img
              src={uploadedImage.previewUrl}
              alt="Vista previa de subida"
              className="w-full rounded-lg border"
            />
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7"
              onClick={handleRemove}
              aria-label="Eliminar imagen subida"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* File info */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
            <span>{uploadedImage.file.name}</span>
            <span>({(uploadedImage.file.size / 1024 / 1024).toFixed(1)}MB)</span>
          </div>

          {/* Metadata form */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="image-description">Descripción</Label>
              <Textarea
                id="image-description"
                placeholder="Describe el contenido de la imagen..."
                value={uploadedImage.description}
                onChange={(e) =>
                  setUploadedImage((prev) =>
                    prev ? { ...prev, description: e.target.value } : null
                  )
                }
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="image-tags">Etiquetas (separadas por coma)</Label>
              <Input
                id="image-tags"
                placeholder="ej., contenedores, logística, corporativo"
                value={uploadedImage.tags}
                onChange={(e) =>
                  setUploadedImage((prev) =>
                    prev ? { ...prev, tags: e.target.value } : null
                  )
                }
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
