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
        manualChunks: {
          // Separate vendor chunks for better caching
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'icons': ['lucide-react'],
          // Heavy libraries used on 1-2 pages — keep out of shared chunks
          'charts': ['recharts'],
          'pdf': ['@react-pdf/renderer'],
          'xlsx': ['xlsx'],
          'stripe': ['@stripe/stripe-js'],
          // Large admin pages in isolated chunks
          'book-health': ['./src/pages/BookHealthPage.jsx'],
          'planning': [
            './src/pages/PlanningHubPage.jsx',
            './src/pages/components/planning/ServiceStaffingTab.jsx',
            './src/pages/components/revenue/RevenueProjectionsDashboard.jsx',
          ],
          'staff-performance': ['./src/pages/StaffPerformancePage.jsx'],
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