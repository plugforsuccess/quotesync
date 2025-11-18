import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  build: {
    // Code splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks for better caching
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'icons': ['lucide-react'],
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
    
    // Chunk size settings
    chunkSizeWarningLimit: 1000,
    
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