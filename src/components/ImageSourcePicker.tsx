import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImageIcon, Sparkles, Upload } from 'lucide-react';
import { StockImageBrowser } from './StockImageBrowser';
import { ImageGeneratorPanel } from './ImageGeneratorPanel';
import { ManualImageUpload } from './ManualImageUpload';

export function ImageSourcePicker() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Seleccionar Imagen</h2>
        <p className="text-sm text-muted-foreground">
          Elige una imagen de tu biblioteca stock, genera una nueva, o sube manualmente.
        </p>
      </div>

      <Tabs defaultValue="stock" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="stock" className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Explorar Stock</span>
            <span className="sm:hidden">Stock</span>
          </TabsTrigger>
          <TabsTrigger value="generate" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Generar Nueva</span>
            <span className="sm:hidden">Generar</span>
          </TabsTrigger>
          <TabsTrigger value="upload" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Subir Manual</span>
            <span className="sm:hidden">Subir</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4">
          <StockImageBrowser />
        </TabsContent>

        <TabsContent value="generate" className="mt-4">
          <ImageGeneratorPanel />
        </TabsContent>

        <TabsContent value="upload" className="mt-4">
          <ManualImageUpload />
        </TabsContent>
      </Tabs>
    </div>
  );
}
