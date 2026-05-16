import { useState } from 'react';
import { ImageIcon, Link2, Download, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBrandAssets } from '@/hooks/useBrandAssets';
import { useDesignStore } from '@/store/designStore';
import type { CopyIdea, DesignImage, StrategyBranch } from '@/types/xendingDesign';

export interface BuiltPiece {
  copyIdea: CopyIdea;
  image: DesignImage | null;
  imageUrl: string;
}

interface PieceBuilderProps {
  branch: StrategyBranch;
  onPiecesReady: (pieces: BuiltPiece[]) => void;
}

export function PieceBuilder({ branch, onPiecesReady }: PieceBuilderProps) {
  const selectedBrand = useDesignStore((s) => s.selectedBrand);
  const { data: stockImages } = useBrandAssets(
    selectedBrand ? { brand: selectedBrand } : null
  );

  // Each copy idea gets paired with an image
  const [pairings, setPairings] = useState<Record<number, string>>({});

  const images = stockImages ?? [];

  const handleSelectImage = (copyIndex: number, imageId: string) => {
    setPairings((prev) => ({ ...prev, [copyIndex]: imageId }));
  };

  const allPaired = branch.copyIdeas.every((_, i) => pairings[i]);

  const handleConfirm = () => {
    const pieces: BuiltPiece[] = branch.copyIdeas.map((idea, i) => {
      const img = images.find((im) => im.id === pairings[i]) || null;
      return {
        copyIdea: idea,
        image: img,
        imageUrl: img?.storagePath || '',
      };
    });
    onPiecesReady(pieces);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Armar Piezas</h2>
        <p className="text-sm text-muted-foreground">
          Asigna una imagen a cada copy para crear las piezas finales.
        </p>
      </div>

      <div className="space-y-4">
        {branch.copyIdeas.map((idea, index) => {
          const selectedImageId = pairings[index];
          const selectedImage = images.find((im) => im.id === selectedImageId);

          return (
            <Card key={index} className={selectedImageId ? 'border-green-500/40' : ''}>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Copy side */}
                  <div className="space-y-2">
                    <Badge variant="secondary" className="text-xs">
                      Copy {index + 1}
                    </Badge>
                    <h3 className="font-semibold text-foreground">{idea.headline}</h3>
                    <p className="text-sm text-muted-foreground">{idea.subcopy}</p>
                    <p className="text-sm font-medium text-[#2ED4C7]">{idea.cta}</p>
                  </div>

                  {/* Image side */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Link2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">
                        Imagen asignada
                      </span>
                    </div>

                    {images.length > 0 ? (
                      <Select
                        value={selectedImageId || ''}
                        onValueChange={(val) => handleSelectImage(index, val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar imagen..." />
                        </SelectTrigger>
                        <SelectContent>
                          {images.map((img) => (
                            <SelectItem key={img.id} value={img.id}>
                              <span className="flex items-center gap-2">
                                <img
                                  src={img.storagePath}
                                  alt=""
                                  className="h-6 w-6 rounded object-cover"
                                />
                                <span className="truncate text-xs">
                                  {img.description.slice(0, 50)}
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No hay imágenes en tu biblioteca. Genera algunas primero en el Stock Generator.
                      </p>
                    )}

                    {/* Preview */}
                    {selectedImage && (
                      <img
                        src={selectedImage.storagePath}
                        alt={selectedImage.description}
                        className="w-full max-w-[200px] rounded-lg border"
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Confirm button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {Object.keys(pairings).length} de {branch.copyIdeas.length} piezas emparejadas
        </p>
        <Button
          onClick={handleConfirm}
          disabled={!allPaired}
          className="bg-green-600 hover:bg-green-700"
        >
          <Check className="h-4 w-4 mr-2" />
          Confirmar Piezas ({branch.copyIdeas.length})
        </Button>
      </div>
    </div>
  );
}
