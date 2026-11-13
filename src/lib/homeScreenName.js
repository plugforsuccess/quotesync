// The name an icon gets when this page is added to a phone's Home Screen (iPhone reads
// apple-mobile-web-app-title; Android Chrome offers the page title). Restores on leave.
export function setHomeScreenName(name, title = name) {
  const metas = ['apple-mobile-web-app-title', 'application-name'].map((n) => {
    let m = document.querySelector(`meta[name="${n}"]`);
    const created = !m;
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', n); document.head.appendChild(m); }
    const before = m.getAttribute('content');
    m.setAttribute('content', name);
    return () => { if (created) m.remove(); else if (before != null) m.setAttribute('content', before); };
  });
  const beforeTitle = document.title;
  document.title = title;
  return () => { metas.forEach(f => f()); document.title = beforeTitle; };
}
