// The name an icon gets when this page is added to a phone's Home Screen, filled in for
// them: iPhone reads apple-mobile-web-app-title; Android Chrome reads the page's manifest
// (falling back to the title). The manifest opens this exact page and stays a plain
// browser shortcut. Everything is put back when the page is left.
export function setHomeScreenName(name, title = name) {
  const undo = ['apple-mobile-web-app-title', 'application-name'].map((n) => {
    let m = document.querySelector(`meta[name="${n}"]`);
    const created = !m;
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', n); document.head.appendChild(m); }
    const before = m.getAttribute('content');
    m.setAttribute('content', name);
    return () => { if (created) m.remove(); else if (before != null) m.setAttribute('content', before); };
  });

  let manifestUrl = null;
  const prior = document.querySelector('link[rel="manifest"]');
  const priorHref = prior?.getAttribute('href') ?? null;
  try {
    const { origin, href } = window.location;
    const manifest = {
      name, short_name: name, start_url: href, scope: `${origin}/`, display: 'browser',
      icons: [{ src: `${origin}/apple-touch-icon.png`, sizes: '180x180', type: 'image/png' }],
    };
    manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
    const link = prior || document.createElement('link');
    link.setAttribute('rel', 'manifest');
    link.setAttribute('href', manifestUrl);
    if (!prior) document.head.appendChild(link);
    undo.push(() => {
      if (prior) { if (priorHref != null) prior.setAttribute('href', priorHref); } else link.remove();
      URL.revokeObjectURL(manifestUrl);
    });
  } catch { /* no Blob URLs: the meta tags and title still name it */ }

  const beforeTitle = document.title;
  document.title = title;
  return () => { undo.forEach(f => f()); document.title = beforeTitle; };
}
