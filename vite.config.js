import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import compression from 'vite-plugin-compression';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Link previews (iMessage, Facebook) read the HTML before any JavaScript runs, so every
// route shows index.html's share card. Pages that need their own card get a copy of the
// built index.html with its own title, description and image (matching the page's
// hero copy; update both if the hero changes), served by a rewrite in
// vercel.json (e.g. /affiliates → /affiliates.html). Same app, different preview.
const SITE = 'https://insuredbycam.com';
const SHARE_PAGES = [
  {
    file: 'affiliates.html', path: '/affiliates',
    title: 'Become an Affiliate | Cam Wiley Agency',
    ogTitle: 'Get Paid for Referrals',
    description: 'You probably know someone who’s paying too much for insurance. As an agency affiliate, you get your own Rate Check link, and you’re paid for every household that sends their declarations page through it, whether or not they buy.',
    image: '/og-affiliates.jpg',
    imageAlt: 'Get Paid for Referrals: Cam Wiley Agency affiliate program',
  },
  {
    file: 'careers.html', path: '/careers',
    title: 'Careers | Cam Wiley Agency',
    ogTitle: 'Build a Career Helping Georgia Families',
    description: 'We’re a local Allstate agency in Conyers. We help people check what they pay, quote them fast, and take care of them after they buy. We’re hiring people who like helping people and want to grow.',
    image: '/og-careers.jpg',
    imageAlt: 'Build a Career Helping Georgia Families: careers at Cam Wiley Agency',
  },
  {
    // Also served at /defensive-driving (same page).
    file: 'courses.html', path: '/courses',
    title: 'Driver Education & Insurance Discounts | Cam Wiley Agency',
    ogTitle: 'Driver Education & Insurance Discounts',
    description: 'Complete the self-paced, 6-hour defensive driving course 100% online, and save hundreds per year on your auto insurance premiums.',
    image: '/og-drivers-ed.jpg',
    imageAlt: 'Driver Education & Insurance Discounts: Cam Wiley Agency',
  },
  {
    file: 'defensive-driving.html', path: '/courses/defensive-driving',
    title: 'Defensive Driving Course | Cam Wiley Agency',
    ogTitle: 'Driver Education & Insurance Discounts',
    description: 'Complete the self-paced, 6-hour defensive driving course 100% online, and save hundreds per year on your auto insurance premiums.',
    image: '/og-drivers-ed.jpg',
    imageAlt: 'Driver Education & Insurance Discounts: Cam Wiley Agency',
  },
];

function sharePages() {
  let outDir = 'dist';
  const esc = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const setMeta = (html, attr, key, value) => {
    const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`);
    if (!re.test(html)) throw new Error(`share page: missing <meta ${attr}="${key}"> in index.html`);
    return html.replace(re, `$1${esc(value)}$2`);
  };
  return {
    name: 'share-pages',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    closeBundle() {
      const base = readFileSync(resolve(outDir, 'index.html'), 'utf8');
      for (const pg of SHARE_PAGES) {
        const url = SITE + pg.path;
        const img = SITE + pg.image;
        let html = base.replace(/<title>[^<]*<\/title>/, `<title>${esc(pg.title)}</title>`)
          .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`);
        for (const [attr, key, value] of [
          ['name', 'title', pg.title], ['name', 'description', pg.description],
          ['property', 'og:url', url], ['property', 'og:title', pg.ogTitle], ['property', 'og:description', pg.description],
          ['property', 'og:image', img], ['property', 'og:image:alt', pg.imageAlt],
          ['name', 'twitter:url', url], ['name', 'twitter:title', pg.ogTitle], ['name', 'twitter:description', pg.description],
          ['name', 'twitter:image', img],
        ]) html = setMeta(html, attr, key, value);
        writeFileSync(resolve(outDir, pg.file), html);
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    compression({ algorithm: 'brotliCompress', ext: '.br' }),
    compression({ algorithm: 'gzip', ext: '.gz' }),
    sharePages(),
  ],

  build: {
    // Code splitting for better caching
    rollupOptions: {
      output: {
        // Function form, node_modules only. The object form pulled every
        // dependency of a listed module into that chunk — shared app code
        // included — so the entry statically imported pdf/xlsx/charts/
        // planning/staff-performance and every public page (/, /ratecheck)
        // downloaded ~1 MB of admin + PDF code up front. App pages are
        // lazy-loaded in App.jsx, so they split on their own.
        manualChunks(id) {
          // Rollup/Vite virtual helpers (commonjsHelpers, preload-helper) are
          // shared by everything; left unassigned they get absorbed into the
          // first manual chunk that needs them (pdf), dragging it into the entry.
          if (id === '\0commonjsHelpers.js' || id.startsWith('\0vite/')) return 'runtime-helpers';
          if (!id.includes('node_modules')) return undefined;
          // Same for generic transpiler helpers shared across libraries.
          if (/node_modules\/(tslib|@swc\/helpers|@babel\/runtime)\//.test(id)) return 'runtime-helpers';
          // Separate vendor chunks for better caching
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react-vendor';
          if (id.includes('node_modules/lucide-react/')) return 'icons';
          // Heavy libraries used on 1-2 pages — keep out of shared chunks
          if (id.includes('node_modules/recharts/')) return 'charts';
          if (id.includes('node_modules/@react-pdf/')) return 'pdf';
          if (id.includes('node_modules/xlsx/')) return 'xlsx';
          if (id.includes('node_modules/@stripe/stripe-js/')) return 'stripe';
          return undefined;
        }
      }
    },
    
    // Minification settings
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.logs in production
        drop_debugger: true,
      }
    },
    
    // @react-pdf/renderer is ~1.5 MB but loaded on-demand via dynamic import();
    // raise the limit so it doesn't trigger a misleading warning.
    chunkSizeWarningLimit: 1600,
    
    // Source maps for debugging (disable in production for speed)
    sourcemap: false,
  },
  
  // Preview server optimization
  preview: {
    port: 4173,
    strictPort: true,
  },
  
  // Development server optimization
  server: {
    port: 5173,
    strictPort: true,
    host: true,
  },
});