/** Shared, controlled typography for generated compositions and the existing editor. */
export const DESIGN_FONT_OPTIONS = [
  { family: 'Raleway', value: "'Raleway', sans-serif", google: 'Raleway:wght@300;400;500;600;700;800', fallback: 'sans-serif' },
  { family: 'Montserrat', value: "'Montserrat', sans-serif", google: 'Montserrat:wght@400;500;600;700;800', fallback: 'sans-serif' },
  { family: 'Poppins', value: "'Poppins', sans-serif", google: 'Poppins:wght@400;500;600;700;800', fallback: 'sans-serif' },
  { family: 'Inter', value: "'Inter', sans-serif", google: 'Inter:wght@400;500;600;700;800', fallback: 'sans-serif' },
  { family: 'Fraunces', value: "'Fraunces', serif", google: 'Fraunces:ital,opsz,wght@0,9..144,400..800;1,9..144,400..800', fallback: 'serif' },
  { family: 'Playfair Display', value: "'Playfair Display', serif", google: 'Playfair+Display:ital,wght@0,400..800;1,400..800', fallback: 'serif' },
  { family: 'Sora', value: "'Sora', sans-serif", google: 'Sora:wght@400;500;600;700;800', fallback: 'sans-serif' },
  { family: 'Manrope', value: "'Manrope', sans-serif", google: 'Manrope:wght@400;500;600;700;800', fallback: 'sans-serif' },
  { family: 'Work Sans', value: "'Work Sans', sans-serif", google: 'Work+Sans:wght@400;500;600;700;800', fallback: 'sans-serif' },
  { family: 'Roboto', value: "'Roboto', sans-serif", google: 'Roboto:wght@400;500;600;700;800', fallback: 'sans-serif' },
  { family: 'Lato', value: "'Lato', sans-serif", google: 'Lato:wght@400;700;900', fallback: 'sans-serif' },
  { family: 'JetBrains Mono', value: "'JetBrains Mono', monospace", google: 'JetBrains+Mono:wght@400;500;600;700;800', fallback: 'monospace' },
  { family: 'Georgia', value: 'Georgia, serif', google: null, fallback: 'serif' },
  { family: 'Arial', value: 'Arial, Helvetica, sans-serif', google: null, fallback: 'sans-serif' },
  { family: 'Trebuchet MS', value: "'Trebuchet MS', sans-serif", google: null, fallback: 'sans-serif' },
  { family: 'Verdana', value: 'Verdana, sans-serif', google: null, fallback: 'sans-serif' },
] as const;
export type DesignFontFamily = typeof DESIGN_FONT_OPTIONS[number]['family'];
