import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => {
  // Detect if we're in production mode
  const isProduction = mode === 'production' || process.env.NODE_ENV === 'production';
  
  console.log(`Building in ${isProduction ? 'production' : 'development'} mode`);
  
  return {
    // Base URL for production build
    base: '/',
    
    // Build configuration
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      // Generate sourcemaps only in development mode
      sourcemap: !isProduction,
      // Ensure proper module loading
      modulePreload: {
        polyfill: true
      },
      // Use built-in esbuild for minification (simpler approach)
      minify: 'esbuild',
      rollupOptions: {
        input: {
          main: './index.html'
        },
        output: {
          manualChunks: {
            'vendor': ['three'],
            'multiplayer': [
              './src/js/multiplayer/MultiplayerUI.js',
              './src/js/multiplayer/MultiplayerManager.js',
              './src/js/network/WebRTCManager.js'
            ]
          },
          // Chunk naming format
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]'
        }
      },
      // Asset optimization
      assetsInlineLimit: 4096,
      chunkSizeWarningLimit: 1000,
      cssCodeSplit: true,
      cssMinify: true
    },
    
    // Server configuration
    server: {
      port: 8080,
      open: true
    },
  
    // Optimization configuration
    optimizeDeps: {
      include: ['three'],
      exclude: ['socket.io-client']
    },
  
    // Performance optimizations - esbuild settings for aggressive minification
    esbuild: {
      target: 'esnext',
      legalComments: 'none',
      // Aggressive esbuild minification options
      minifyIdentifiers: true,
      minifySyntax: true,
      minifyWhitespace: true,
      treeShaking: true,
      // Only apply these settings in production mode
      ...(isProduction && {
        drop: ['console', 'debugger'], // Remove console.log and debugger statements
        keepNames: false // Don't preserve function and class names
      })
    }
  }
}) 