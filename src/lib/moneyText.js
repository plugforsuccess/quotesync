// Dollar amounts keep their green; all other green-family text reads gold
// (see "NO GREEN TEXT" in index.css). CSS can't see text, so this marks any
// element whose own text is a dollar amount ("$1,420", "+$380/yr", "$2.1k")
// with data-money, and the gold rules skip it.

const MONEY = /^[+\-−–]?\s*\$\s?\d[\d,]*(\.\d+)?\s*[kKmM]?\s*(\/\s*(yr|year|mo|month|term))?$/;

function ownText(el) {
  let s = '';
  for (const n of el.childNodes) if (n.nodeType === 3) s += n.nodeValue;
  return s.trim();
}

function mark(el) {
  if (!el || el.nodeType !== 1) return;
  const isMoney = MONEY.test(ownText(el));
  if (isMoney) { if (!el.hasAttribute('data-money')) el.setAttribute('data-money', ''); }
  else if (el.hasAttribute('data-money')) el.removeAttribute('data-money');
}

function scan(root) {
  if (root.nodeType === 3) { mark(root.parentElement); return; }
  if (root.nodeType !== 1) return;
  mark(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeValue.includes('$') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) mark(n.parentElement);
  for (const el of root.querySelectorAll('[data-money]')) mark(el);
}

export function startMoneyText() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  const run = () => {
    scan(document.body);
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'characterData') mark(r.target.parentElement);
        else { mark(r.target); r.addedNodes.forEach(scan); }
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  };
  if (document.body) run(); else document.addEventListener('DOMContentLoaded', run);
}
