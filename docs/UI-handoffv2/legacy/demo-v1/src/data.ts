import { demoAssets } from './demo-assets';
import type { DemoAsset, DemoState, FormatOption, GlyphName, PieceType, Tone } from './types';
export const BRAND_NAME = 'ScoryDesign'; // Provisional. Do not rename repository or modules.
export const pieces: { id: PieceType; label: string; description: string; icon: GlyphName; tone: Tone }[] = [
  { id: 'image', label: 'Imagen', description: 'Una idea, una pieza visual con intención.', icon: 'image', tone: 'blue' },
  { id: 'carousel', label: 'Carrusel', description: 'Una secuencia de imágenes que cuenta tu historia.', icon: 'carousel', tone: 'violet' },
  { id: 'presentation', label: 'Presentación', description: 'Tus ideas, en una presentación profesional.', icon: 'presentation', tone: 'green' },
  { id: 'free', label: 'Diseño libre', description: 'Explora formatos y compón con libertad.', icon: 'pen', tone: 'orange' },
];
// Catalog explicitly stated in the supplied PDF (not social-network specifications).
export const imageFormats: FormatOption[] = [
  { id: 'ig-post', label: 'Instagram Post', dimensions: '1080 × 1080', ratio: '1 / 1' },
  { id: 'ig-story', label: 'Instagram Story', dimensions: '1080 × 1920', ratio: '9 / 16' },
  { id: 'facebook', label: 'Facebook', dimensions: '1200 × 628', ratio: '1200 / 628' },
  { id: 'linkedin', label: 'LinkedIn', dimensions: '1200 × 628', ratio: '1200 / 628' },
  { id: 'banner', label: 'Banner', dimensions: '1920 × 1080', ratio: '16 / 9' },
];
export function formatsFor(piece: PieceType): FormatOption[] {
  if (piece === 'carousel') return [{ id: 'carousel-square', label: 'Carrusel cuadrado', dimensions: '1024 × 1024', ratio: '1 / 1' }];
  if (piece === 'free') return [
    { id:'free-wide', label:'Horizontal', dimensions:'1280 × 720', ratio:'16 / 9' },
    { id:'free-portrait', label:'Vertical', dimensions:'1088 × 1408', ratio:'1088 / 1408' },
    { id:'free-square', label:'Cuadrado', dimensions:'1024 × 1024', ratio:'1 / 1' },
  ];
  return imageFormats;
}
export const assets: DemoAsset[] = [
  { id:'cables', title:'Cables industriales', kind:'image', src:demoAssets.cable, note:'Ejemplo de imagen' },
  { id:'campaign', title:'Campaña de importación', kind:'carousel', src:demoAssets.campaign, note:'Ejemplo de carrusel' },
  { id:'presentation', title:'Presentación comercial', kind:'presentation', src:demoAssets.reel, note:'Ejemplo de presentación' },
  { id:'proposal', title:'Portada de propuesta', kind:'free', src:demoAssets.building, note:'Ejemplo de diseño libre' },
];
export const initialState: DemoState = {
  view:'home', step:0, piece:'image', formatId:'ig-story', idea:'',
  headline:'Cableado en dólares. Producción en pesos.',
  body:'Pagos internacionales para tu próxima importación.', cta:'Cotiza tu próximo pago',
  textMode:'bank', query:'', filter:'all', selectedAsset:'cables',
  references:[{ id:'example', name:'cables-referencia.webp', src:demoAssets.cable, role:'Producto' }],
  instruction:'Conservar el producto y usar una composición más limpia.',
  slide:0, editorHeadline:'Cableado en dólares.\nProducción en pesos.',
  editorBody:'Tu contenido, tu marca y una composición que se adapta a tu idea.',
  notice:'', menuOpen:false, resultVisible:false,
};
export const stepLabels=['Pieza','Formato','Texto','Referencias','Resumen'];
export const referenceRoles=['Producto','Estilo','Composición','Texto','Marca'];
export const slideTitles=['Portada','Contexto','La propuesta','Cómo funciona','Cierre'];
