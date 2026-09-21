export type ViewName = 'home' | 'create' | 'library' | 'editor' | 'brand' | 'icons';
export type PieceType = 'image' | 'carousel' | 'presentation' | 'free';
export type Tone = 'blue' | 'violet' | 'green' | 'orange' | 'navy' | 'neutral';
export type GlyphName = 'home' | 'create' | 'library' | 'presentation' | 'pen' | 'brand' | 'projects' | 'templates' | 'trash' | 'image' | 'carousel' | 'news' | 'chart' | 'arrow' | 'back' | 'chevron' | 'search' | 'bell' | 'settings' | 'attach' | 'check' | 'close' | 'menu' | 'spark' | 'download' | 'more' | 'grid' | 'folder' | 'document' | 'copy' | 'upload' | 'expand';
export interface DemoAsset { id: string; title: string; kind: PieceType; src: string; note: string; }
export interface DemoReference { id: string; name: string; src: string; role: string; }
export interface DemoState {
  view: ViewName; step: number; piece: PieceType; formatId: string;
  idea: string; headline: string; body: string; cta: string; textMode: string;
  query: string; filter: string; selectedAsset: string; references: DemoReference[];
  instruction: string; slide: number; editorHeadline: string; editorBody: string;
  notice: string; menuOpen: boolean; resultVisible: boolean;
}
export interface FormatOption { id: string; label: string; dimensions: string; ratio: string; }
