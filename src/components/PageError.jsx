// src/components/PageError.jsx
// Lightweight error fallback for route-level ErrorBoundaries.
// Unlike the root ErrorBoundary, this renders inside the Layout so the nav
// survives and users can navigate to a working page.

import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function PageError() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6" role="alert">
      <div className="max-w-md w-full bg-white border border-red-200 rounded-lg shadow-sm p-8 text-center">
        <AlertTriangle className="w-10 h-10 text-red-600 mx-auto mb-4" aria-hidden="true" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">This page encountered an error</h2>
        <p className="text-gray-600 mb-6">
          Something went wrong loading this page. You can try reloading, or navigate to another page.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Reload Page
        </button>
      </div>
    </div>
  );
}
