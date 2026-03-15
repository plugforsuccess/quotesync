// src/components/ErrorBoundary.jsx
// Error boundary to catch React errors and provide recovery options

import { Component } from 'react';
import { AlertTriangle, RefreshCw, LogOut } from 'lucide-react';
import { getBuildString } from '../utils/cacheVersion';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    // Chunk load failure after a new deploy — componentDidCatch will auto-reload.
    // Don't flash the error screen while the reload is in progress.
    const isChunkError =
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('Importing a module script failed') ||
      error?.message?.includes('Unable to preload CSS for') ||
      error?.name === 'ChunkLoadError';

    if (isChunkError && !sessionStorage.getItem('qs_chunk_error_reloaded')) {
      return null;
    }

    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Chunk load failure — happens when a new deploy invalidates old chunk hashes.
    // The browser has stale HTML referencing filenames that no longer exist on the CDN.
    // Auto-reload once to fetch the new bundle. The sessionStorage guard prevents
    // an infinite reload loop if the chunk is genuinely missing rather than stale.
    const isChunkError =
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('Importing a module script failed') ||
      error?.message?.includes('Unable to preload CSS for') ||
      error?.name === 'ChunkLoadError';

    if (isChunkError) {
      const reloadKey = 'qs_chunk_error_reloaded';
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, '1');
        window.location.reload();
        return; // Don't set error state — reload is in progress
      }
      // Already reloaded once and still failing — show error screen as normal
      sessionStorage.removeItem(reloadKey);
    }

    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearCache = async () => {
    if (confirm('Clear all app data and reload? This will sign you out and remove all local drafts.')) {
      try {
        // Clear all storage
        localStorage.clear();
        sessionStorage.clear();

        // Clear IndexedDB
        if ('indexedDB' in window) {
          const dbs = await window.indexedDB.databases?.() || [];
          for (const db of dbs) {
            window.indexedDB.deleteDatabase(db.name);
          }
        }

        // Reload
        window.location.reload();
      } catch (err) {
        console.error('[ErrorBoundary] Error clearing cache:', err);
        alert('Failed to clear cache. Please manually clear browser data.');
      }
    }
  };

  render() {
    if (this.state.hasError) {
      // If a fallback prop was provided (route-level boundary), render it instead
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" role="alert">
          <div className="max-w-2xl w-full bg-white rounded-lg shadow-sm p-8">
            <div className="flex items-start gap-4 mb-6">
              <div className="flex-shrink-0">
                <AlertTriangle className="w-12 h-12 text-red-600" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  Something went wrong
                </h1>
                <p className="text-gray-600 mb-4">
                  The application encountered an unexpected error. This might be due to:
                </p>
                <ul className="list-disc list-inside text-gray-600 mb-4 space-y-1">
                  <li>Corrupted local cache or storage</li>
                  <li>Expired authentication session</li>
                  <li>Network connectivity issues</li>
                  <li>Incompatible cached data from a previous version</li>
                </ul>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-gray-900 mb-2">Error Details:</h3>
              <pre className="text-sm text-red-600 overflow-auto max-h-32">
                {this.state.error?.toString()}
              </pre>
              {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">
                    Stack Trace
                  </summary>
                  <pre className="text-xs text-gray-600 overflow-auto max-h-64 mt-2">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={this.handleReload}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </button>
              <button
                onClick={this.handleClearCache}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Clear Cache & Reload
              </button>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                Build: {getBuildString()} • If this persists, contact support
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
