import type { DesignCopy } from '../../../supabase/functions/_shared/desaing/explorationContracts';

/** Remember text changed in the visual editor without mistaking a logo or a
 * geometry adjustment for new copy. Parsing stays inside a detached template. */
export function conversationCopyAfterEdit(previous: DesignCopy, previousHtml: string, editedHtml: string): DesignCopy {
  const normalized = (text: string) => text.replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  function visibleBlocks(html: string): { blocks: string; nodes: string } {
    const document = new DOMParser().parseFromString('', 'text/html');
    const template = document.createElement('template'); template.innerHTML = html;
    // Detached structural parents make selectors such as body .hidden work
    // without adopting images, stylesheets or HTML into a live document.
    const root = document.createElement('html'), body = document.createElement('body');
    body.append(template.content); root.append(body);
    const rules: Array<{ selector: string; declarations: CSSStyleDeclaration; weight: number }> = [];
    const splitSelectors = (selector: string) => {
      const parts: string[] = []; let start = 0, depth = 0, quote = '';
      for (let index = 0; index < selector.length; index++) {
        const char = selector[index];
        if (quote) { if (char === '\\') index++; else if (char === quote) quote = ''; continue; }
        if (char === '"' || char === "'") quote = char;
        else if (char === '(' || char === '[') depth++;
        else if (char === ')' || char === ']') depth--;
        else if (char === ',' && depth === 0) { parts.push(selector.slice(start, index)); start = index + 1; }
      }
      parts.push(selector.slice(start)); return parts;
    };
    const collect = (items: CSSRuleList) => {
      for (const rule of Array.from(items)) {
        if (rule instanceof CSSStyleRule) {
          for (const selector of splitSelectors(rule.selectorText)) {
            // Normal id/class/tag specificity suffices for static editor styles;
            // :where has no weight and pseudo elements never contribute text.
            const plain = selector.replace(/:where\([^)]*\)/g, '').replace(/::[\w-]+/g, '');
            const ids = (plain.match(/#[\w-]+/g) ?? []).length;
            const classes = (plain.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length;
            const tags = (plain.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|:[\w-]+(?:\([^)]*\))?/g, '').match(/[a-z][\w-]*/gi) ?? []).length;
            rules.push({ selector, declarations: rule.style, weight: ids * 1000000 + classes * 1000 + tags });
          }
        } else if (rule instanceof CSSSupportsRule && CSS.supports(rule.conditionText)) collect(rule.cssRules);
      }
    };
    // Constructed stylesheets are never adopted; CSS URLs and @import cannot load.
    if (typeof CSSStyleSheet !== 'undefined' && typeof CSSStyleSheet.prototype.replaceSync === 'function') {
      for (const style of Array.from(body.querySelectorAll('style'))) {
        try { const sheet = new CSSStyleSheet(); sheet.replaceSync(style.textContent ?? ''); collect(sheet.cssRules); } catch { /* Invalid CSS cannot add text. */ }
      }
    }
    function property(element: Element, name: string): string {
      let value = '', winner = -1;
      for (const rule of rules) {
        const candidate = rule.declarations.getPropertyValue(name); if (!candidate) continue;
        try { if (!element.matches(rule.selector)) continue; } catch { continue; }
        const priority = rule.weight + (rule.declarations.getPropertyPriority(name) ? 1000000000 : 0);
        if (priority >= winner) { value = candidate.trim().toLowerCase(); winner = priority; }
      }
      const inline = (element as HTMLElement).style;
      const candidate = inline?.getPropertyValue(name);
      if (candidate && (inline.getPropertyPriority(name) || winner < 1000000000)) value = candidate.trim().toLowerCase();
      return value;
    }
    const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'DESC', 'METADATA', 'HEAD', 'IFRAME', 'OBJECT', 'EMBED']);
    const blocks = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'DL', 'DT', 'DD', 'FIGCAPTION', 'FIGURE',
      'FOOTER', 'HEADER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TR', 'UL']);
    const parts: string[] = [], textNodes: string[] = [];
    function visit(node: Node, inheritedVisibility = 'visible') {
      if (node.nodeType === 3) {
        if (inheritedVisibility === 'visible') {
          const text = node.textContent ?? ''; parts.push(text); textNodes.push(text);
        }
        return;
      }
      if (node.nodeType !== 1) return;
      const element = node as Element, tag = element.tagName.toUpperCase();
      if (skip.has(tag) || element.hasAttribute('hidden') || property(element, 'display') === 'none' || property(element, 'opacity') === '0') return;
      const declared = property(element, 'visibility');
      const visibility = declared === 'visible' ? 'visible' : ['hidden', 'collapse'].includes(declared) ? 'hidden' : inheritedVisibility;
      if (tag === 'BR') { if (visibility === 'visible') parts.push('\n'); return; }
      const block = blocks.has(tag) || ['block', 'flex', 'grid', 'list-item', 'table-row'].includes(property(element, 'display'));
      if (block) parts.push('\n');
      if (tag === 'TD' || tag === 'TH') parts.push(' ');
      for (const child of Array.from(node.childNodes)) visit(child, visibility);
      if (block) parts.push('\n');
    }
    visit(body);
    return { blocks: parts.join('').split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n'),
      nodes: textNodes.join('') };
  }
  const before = visibleBlocks(previousHtml), after = visibleBlocks(editedHtml);
  // CSS display and block wrappers can add synthetic line breaks without
  // changing a single text node. Actual inserted spaces still count as text.
  if (normalized(before.blocks) === normalized(after.blocks) || normalized(before.nodes) === normalized(after.nodes)) return previous;
  if (after.blocks.length > 4000) return { status: 'pending', text: '', source_reference_ids: [] };
  return { status: after.blocks ? 'literal' : 'none', text: after.blocks, source_reference_ids: [] };
}
