/** Runs inside Chromium after fonts/images settle. Only report text geometry, not intentional decoration bleed. */
function inspectDesignLayout() {
  const width = window.innerWidth, height = window.innerHeight;
  const issues = [], seen = new Set(), textRuns = [];
  const MAX_ISSUES = 40, MAX_NODES = 500;
  let examined = 0, truncated = false;
  const label = element => element.getAttribute('data-copy-id') || element.id || `${element.tagName.toLowerCase()}${element.classList.length ? `.${Array.from(element.classList).slice(0, 2).join('.')}` : ''}`;
  const rectText = rect => `x=${Math.round(rect.left)}, y=${Math.round(rect.top)}, ancho=${Math.round(rect.width)}, alto=${Math.round(rect.height)}`;
  const add = (code, element, message) => {
    const key = `${code}:${label(element)}:${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (issues.length >= MAX_ISSUES) { truncated = true; return; }
    issues.push({ code, element: label(element).slice(0, 160), message: message.slice(0, 500) });
  };
  const hidden = element => {
    for (let parent = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) < 0.05) return true;
    }
    return false;
  };
  const paintsCover = element => {
    const style = getComputedStyle(element);
    if (Number(style.opacity) < 0.65 || style.visibility !== 'visible') return false;
    if (/^(IMG|CANVAS|VIDEO|SVG)$/.test(element.tagName)) return true;
    const background = style.backgroundColor;
    const alpha = background.startsWith('rgba(') ? Number(background.split(',').pop().replace(')', '')) : background === 'transparent' ? 0 : 1;
    return alpha >= 0.65 || style.backgroundImage !== 'none';
  };
  // Hit testing normally skips pointer-events:none decoration, even when it paints over copy.
  // Temporarily include those layers, then restore their exact styles before taking the screenshot.
  const elements = Array.from(document.querySelectorAll('*')), hitTesting = [];
  if (elements.length > 2000) truncated = true;
  for (const element of elements.slice(0, 2000)) {
    if (element.style && getComputedStyle(element).pointerEvents === 'none') {
      hitTesting.push({ element, style: element.getAttribute('style') });
      element.style.setProperty('pointer-events', 'auto', 'important');
    }
  }
  try {
  // Required copy must be examined independently of visible text walking: zero-sized text
  // and display:none otherwise produce no Range rectangles and would silently disappear.
  const requiredCopy = document.querySelectorAll('[data-copy-id]');
  if (requiredCopy.length > MAX_NODES) truncated = true;
  for (const element of Array.from(requiredCopy).slice(0, MAX_NODES)) {
    const text = element.textContent.replace(/\s+/g, ' ').trim();
    if (hidden(element)) {
      add('hidden_text', element, `El texto aprobado «${text.slice(0, 100)}» está oculto.`); continue;
    }
    const range = document.createRange(); range.selectNodeContents(element);
    const rects = Array.from(range.getClientRects());
    if (!text || Number.parseFloat(getComputedStyle(element).fontSize) < 1 || !rects.some(rect => rect.width > 1 && rect.height > 1)) {
      add('hidden_text', element, `El bloque aprobado «${text.slice(0, 100)}» no tiene un área de texto visible.`); continue;
    }
    for (let parent = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
      const clipRect = /^rect\(([^)]+)\)$/.exec(style.clip);
      const clipValues = clipRect?.[1].split(/\s*,\s*|\s+/).map(Number.parseFloat);
      const inset = /^inset\(([^)]+)\)$/.exec(style.clipPath);
      const parts = inset?.[1].split(/\s+round\s+/)[0].trim().split(/\s+/);
      const values = parts ? [parts[0], parts[1] ?? parts[0], parts[2] ?? parts[0], parts[3] ?? parts[1] ?? parts[0]]
        .map((part, index) => part.endsWith('%') ? Number.parseFloat(part) * (index % 2 ? bounds.width : bounds.height) / 100 : Number.parseFloat(part)) : undefined;
      if (clipValues?.length === 4 && (clipValues[2] <= clipValues[0] || clipValues[1] <= clipValues[3])
        || values && (values[0] + values[2] >= bounds.height || values[1] + values[3] >= bounds.width)
        || /^circle\(0(?:px|%)?(?:\s|\))/.test(style.clipPath)) {
        add('clipped_text', element, `El bloque aprobado «${text.slice(0, 100)}» está oculto por el recorte de ${label(parent)}.`); break;
      }
    }
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.replace(/\s+/g, ' ').trim(), element = node.parentElement;
    if (!text || !element || element.closest('script,style,noscript,svg')) continue;
    if (++examined > MAX_NODES) { truncated = true; break; }
    if (hidden(element)) {
      if (element.closest('[data-copy-id]')) add('hidden_text', element, `El texto aprobado «${text.slice(0, 100)}» está oculto.`);
      continue;
    }
    const range = document.createRange(); range.selectNodeContents(node);
    const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 1 && rect.height > 1);
    for (const rect of rects) {
      const description = `«${text.slice(0, 100)}» (${rectText(rect)})`;
      if (rect.left < -2 || rect.top < -2 || rect.right > width + 2 || rect.bottom > height + 2) {
        add('text_outside_canvas', element, `Texto fuera del lienzo: ${description}.`);
      }
      for (let parent = element; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
        const clipsX = /hidden|clip|scroll|auto/.test(style.overflowX), clipsY = /hidden|clip|scroll|auto/.test(style.overflowY);
        if ((clipsX && (rect.left < bounds.left - 2 || rect.right > bounds.right + 2))
          || (clipsY && (rect.top < bounds.top - 2 || rect.bottom > bounds.bottom + 2))) {
          add('clipped_text', element, `Texto recortado por ${label(parent)}: ${description}.`); break;
        }
      }
      let covered = 0;
      const coveringElements = new Set();
      for (const fraction of [0.15, 0.5, 0.85]) {
        const x = rect.left + rect.width * fraction, y = rect.top + rect.height * 0.5;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        // Hit testing is paint ordered. Ancestors/backgrounds and transparent wrappers do not hide text.
        const stack = document.elementsFromPoint(x, y);
        for (const candidate of stack) {
          if (candidate === element || element.contains(candidate)) break;
          if (candidate.contains(element)) continue;
          if (paintsCover(candidate)) { covered++; coveringElements.add(candidate); break; }
        }
      }
      if (covered >= 2) {
        const covers = Array.from(coveringElements).slice(0, 2)
          .map(candidate => `${label(candidate)} (${rectText(candidate.getBoundingClientRect())})`).join('; ');
        add('covered_text', element, `Texto tapado: ${label(element)} ${description}. Lo tapa: ${covers}.`);
      }
      if (textRuns.length < 1000) textRuns.push({ rect, element, text }); else truncated = true;
    }
  }
  // Text-on-text overlap is not detected by opaque-background hit testing.
  for (let i = 0; i < textRuns.length; i++) {
    const a = textRuns[i];
    for (let j = i + 1; j < textRuns.length; j++) {
      const b = textRuns[j];
      if (a.element === b.element || a.element.contains(b.element) || b.element.contains(a.element)) continue;
      const overlapWidth = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
      const overlapHeight = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
      if (overlapWidth > 8 && overlapHeight > Math.min(a.rect.height, b.rect.height) * 0.55) {
        add('overlapping_text', a.element, `Se superponen ${label(a.element)} «${a.text.slice(0, 60)}» (${rectText(a.rect)}) y ${label(b.element)} «${b.text.slice(0, 60)}» (${rectText(b.rect)}).`);
      }
    }
  }
  for (const element of document.images) {
    // Empty slots are intentional pending artwork; a layout repair cannot supply their image bytes.
    if (element.getAttribute('src')?.trim() && !hidden(element) && element.getBoundingClientRect().width > 8 && (!element.complete || !element.naturalWidth)) {
      add('missing_image', element, 'No se pudo cargar una imagen del diseño.');
    }
  }
    return { width, height, textBlocks: examined, issues, truncated };
  } finally {
    for (const { element, style } of hitTesting) {
      if (style === null) element.removeAttribute('style'); else element.setAttribute('style', style);
    }
  }
}

module.exports = { inspectDesignLayout };
