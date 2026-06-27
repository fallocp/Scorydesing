# Visual System — Sistema Visual Xending

Especificación completa del sistema visual compartido por ambas marcas. Todos los templates y piezas generadas DEBEN seguir estas reglas.

> **Alcance:** este documento define la **capa HTML de render** (fondos CSS, mesh
> gradient, tipografía y layout que el template engine aplica sobre la imagen). NO
> define la dirección de arte de la imagen generada por IA. El estilo `navy` de la
> imagen (dark premium graphite) vive en el bloque `### navy` de
> `MASTER_IMAGE_PROMPT_FALLBACK` (`supabase/functions/generate-design-image/index.ts`).

---

## Paleta de Colores

### Colores Principales
| Nombre | Hex | Uso |
|--------|-----|-----|
| **Turquoise** | `#2ED4C7` | Color primario, CTAs, acentos, elementos interactivos |
| **Coral** | `#FF7A4A` | Color secundario, highlights, sublabel "CAPITAL", alertas |
| **Navy** | `#0F1419` | Fondos oscuros, texto principal, headers |

### Colores de Soporte
| Nombre | Hex | Uso |
|--------|-----|-----|
| **White** | `#FFFFFF` | Texto sobre fondos oscuros, espacios limpios |
| **Light Gray** | `#F5F5F5` | Fondos claros, separadores |
| **Medium Gray** | `#6B7280` | Texto secundario, subcopy |

### Reglas de Color
- Navy (`#0F1419`) es el fondo principal de todas las piezas
- Turquoise (`#2ED4C7`) para elementos de acción y acentos
- Coral (`#FF7A4A`) para highlights y el sublabel "CAPITAL"
- Texto principal siempre en blanco sobre fondo navy
- Mantener contraste mínimo WCAG AA (4.5:1 para texto normal)

---

## Tipografía

### Familias Tipográficas
| Familia | Uso | Peso |
|---------|-----|------|
| **Fraunces** | Display — headlines, títulos grandes | Bold (700), Black (900) |
| **Inter** | Body — subcopy, disclaimers, texto general | Regular (400), Medium (500), SemiBold (600) |
| **JetBrains Mono** | Números — tasas, porcentajes, métricas, datos | Regular (400), Bold (700) |

### Escalas Tipográficas por Plataforma

#### Instagram Story (1080×1920)
| Elemento | Familia | Tamaño | Peso |
|----------|---------|--------|------|
| Headline | Fraunces | 64–80px | Bold |
| Subcopy | Inter | 28–32px | Regular |
| CTA | Inter | 32px | SemiBold |
| Data/Numbers | JetBrains Mono | 72–96px | Bold |
| Disclaimer | Inter | 14–16px | Regular |

#### Instagram Post (1080×1080)
| Elemento | Familia | Tamaño | Peso |
|----------|---------|--------|------|
| Headline | Fraunces | 48–64px | Bold |
| Subcopy | Inter | 24–28px | Regular |
| CTA | Inter | 28px | SemiBold |
| Data/Numbers | JetBrains Mono | 56–72px | Bold |
| Disclaimer | Inter | 12–14px | Regular |

#### Facebook Post (1200×628)
| Elemento | Familia | Tamaño | Peso |
|----------|---------|--------|------|
| Headline | Fraunces | 40–52px | Bold |
| Subcopy | Inter | 20–24px | Regular |
| CTA | Inter | 24px | SemiBold |
| Data/Numbers | JetBrains Mono | 48–60px | Bold |
| Disclaimer | Inter | 12px | Regular |

#### LinkedIn Post (1200×627)
| Elemento | Familia | Tamaño | Peso |
|----------|---------|--------|------|
| Headline | Fraunces | 40–52px | Bold |
| Subcopy | Inter | 20–24px | Regular |
| CTA | Inter | 24px | SemiBold |
| Data/Numbers | JetBrains Mono | 48–60px | Bold |
| Disclaimer | Inter | 12px | Regular |

#### Banner / Presentación (1920×1080)
| Elemento | Familia | Tamaño | Peso |
|----------|---------|--------|------|
| Headline | Fraunces | 56–72px | Bold |
| Subcopy | Inter | 24–32px | Regular |
| CTA | Inter | 32px | SemiBold |
| Data/Numbers | JetBrains Mono | 64–80px | Bold |
| Disclaimer | Inter | 14px | Regular |

---

## Fondo: Mesh Gradient

### Especificación
El fondo de todas las piezas usa un **mesh gradient** sobre el color navy base:

```css
background: #0F1419;
background-image:
  radial-gradient(ellipse at 20% 80%, rgba(46, 212, 199, 0.15) 0%, transparent 50%),
  radial-gradient(ellipse at 80% 20%, rgba(255, 122, 74, 0.10) 0%, transparent 50%),
  radial-gradient(ellipse at 50% 50%, rgba(46, 212, 199, 0.05) 0%, transparent 70%);
```

### Reglas del Mesh
- El gradiente turquoise domina (mayor opacidad: 0.15)
- El gradiente coral es sutil (opacidad: 0.10)
- Los centros de los gradientes varían por formato para adaptarse al aspect ratio
- El efecto debe ser sutil — no competir con el contenido

---

## Textura: Grain Overlay

### Especificación
Una textura de grano sutil se aplica sobre todo el fondo:

```css
.grain-overlay {
  position: absolute;
  inset: 0;
  opacity: 0.03;
  background-image: url("data:image/svg+xml,..."); /* noise pattern */
  pointer-events: none;
  mix-blend-mode: overlay;
}
```

### Reglas del Grain
- Opacidad muy baja (0.03) — apenas perceptible
- Mix-blend-mode: overlay para integración natural
- Cubre toda la pieza
- No interfiere con legibilidad del texto

---

## Espaciado y Layout

### Márgenes por Plataforma
| Plataforma | Margen Exterior | Padding Interno |
|------------|----------------|-----------------|
| Instagram Story | 40px | 48px |
| Instagram Post | 40px | 48px |
| Facebook Post | 32px | 40px |
| LinkedIn Post | 32px | 40px |
| Banner | 48px | 56px |

### Zonas de Layout
Cada pieza se divide en zonas verticales:

```
┌─────────────────────────┐
│  Brand Lockup (top)     │  ← Logo + sublabel (si Capital)
├─────────────────────────┤
│                         │
│  Content Area           │  ← Headline, subcopy, imagen, datos
│  (flexible)             │
│                         │
├─────────────────────────┤
│  CTA Area               │  ← Botón o texto de acción
├─────────────────────────┤
│  Partner Badge          │  ← "Powered by..." (si aplica)
├─────────────────────────┤
│  Promoter Area          │  ← Foto + datos (si aplica, oculto por defecto)
├─────────────────────────┤
│  Disclaimer (bottom)    │  ← Texto legal obligatorio
└─────────────────────────┘
```

### Brand Lockup
- **Xending**: Solo wordmark, sin sublabel
- **Xending Capital**: Wordmark + sublabel "CAPITAL" en coral (`#FF7A4A`)
- Posición: esquina superior izquierda
- Tamaño del logo: proporcional al formato (aprox. 15-20% del ancho)

### Partner Badge
- Visible solo cuando partner ≠ "none"
- Incluye logo del partner + texto badge (ej: "Powered by Monex USA")
- Posición: debajo del CTA, antes del disclaimer
- Tamaño reducido respecto al brand lockup principal

### Promoter Area
- Oculto por defecto (display: none)
- Cuando se activa: foto circular + nombre + rol + contacto
- Posición: entre partner badge y disclaimer
- Foto: 80px circular con borde turquoise

---

## Dimensiones por Plataforma

| Plataforma | Ancho | Alto | Aspect Ratio |
|------------|-------|------|--------------|
| Instagram Story | 1080px | 1920px | 9:16 (vertical) |
| Instagram Post | 1080px | 1080px | 1:1 (cuadrado) |
| Facebook Post | 1200px | 628px | ~1.91:1 (landscape) |
| LinkedIn Post | 1200px | 627px | ~1.91:1 (landscape) |
| Banner / Presentación | 1920px | 1080px | 16:9 (landscape) |
