import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import compression from 'vite-plugin-compression';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    compression({ algorithm: 'brotliCompress', ext: '.br' }),
    compression({ algorithm: 'gzip', ext: '.gz' }),
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