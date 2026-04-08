/**
 * DOM-level replacement of [ID:N] citation markers in rendered markdown.
 *
 * MarkdownRender (markstream-vue) is a third-party component — we cannot
 * inject Vue components inside its output. Instead, after each render cycle
 * we scan the DOM with a TreeWalker, replace text-node markers with <sup>
 * elements, and handle clicks via event delegation.
 */

const CITATION_REGEX = /\[ID:(\d+)\]/g;
const CITATION_CLASS = 'citation-mark';

export interface ActiveCitation {
  index: number;
  x: number;
  y: number;
}

export function useCitationRenderer() {
  const activeCitation = ref<ActiveCitation | null>(null);

  /** Replace [ID:N] text nodes with <sup> elements inside `container`. */
  function replaceCitationMarkers(container: HTMLElement) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        // Skip nodes inside an already-replaced citation mark
        const parent = node.parentElement as HTMLElement | null;
        if (parent?.classList.contains(CITATION_CLASS)) {
          return NodeFilter.FILTER_REJECT;
        }
        return CITATION_REGEX.test(node.textContent ?? '')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });

    const nodesToReplace: {
      matches: Array<{ end: number; index: number; start: number }>;
      node: Text;
    }[] = [];

    for (
      let textNode = walker.nextNode();
      textNode !== null;
      textNode = walker.nextNode()
    ) {
      const text = textNode.textContent ?? '';
      const matches: Array<{ end: number; index: number; start: number }> = [];
      CITATION_REGEX.lastIndex = 0;
      let match = CITATION_REGEX.exec(text);
      while (match !== null) {
        matches.push({
          index: Number(match[1]),
          start: match.index,
          end: match.index + match[0].length,
        });
        match = CITATION_REGEX.exec(text);
      }
      if (matches.length > 0) {
        nodesToReplace.push({ node: textNode as Text, matches });
      }
    }

    for (const { node, matches } of nodesToReplace) {
      const fragment = document.createDocumentFragment();
      const text = node.textContent ?? '';
      let lastEnd = 0;

      for (const m of matches) {
        if (m.start > lastEnd) {
          fragment.append(
            document.createTextNode(text.slice(lastEnd, m.start)),
          );
        }
        const sup = document.createElement('sup');
        sup.className = CITATION_CLASS;
        sup.dataset.refIndex = String(m.index);
        sup.textContent = `[${m.index + 1}]`;
        sup.setAttribute('role', 'button');
        sup.setAttribute('tabindex', '0');
        fragment.append(sup);
        lastEnd = m.end;
      }

      if (lastEnd < text.length) {
        fragment.append(document.createTextNode(text.slice(lastEnd)));
      }
      node.parentNode?.replaceChild(fragment, node);
    }
  }

  /** Event-delegation click handler for citation marks. */
  function handleClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.classList.contains(CITATION_CLASS)) return;

    const index = Number(target.dataset.refIndex);
    if (Number.isNaN(index)) return;

    const rect = target.getBoundingClientRect();
    activeCitation.value = {
      index,
      x: rect.left + rect.width / 2,
      y: rect.top,
    };
  }

  function closeCitation() {
    activeCitation.value = null;
  }

  return {
    activeCitation,
    replaceCitationMarkers,
    handleClick,
    closeCitation,
  };
}
