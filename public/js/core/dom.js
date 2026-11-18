// Küçük DOM yardımcıları. Tüm metinler textContent ile basılır (XSS güvenli).
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export const tl = (n) => `₺${Math.round(n ?? 0).toLocaleString('tr-TR')}`;
export const pad = (n) => String(n).padStart(2, '0');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function clear(node) {
  while (node.firstChild) node.firstChild.remove();
  return node;
}
