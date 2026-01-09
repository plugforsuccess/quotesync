import React from 'react';

/**
 * Draft Restore Modal Component
 * Shows when a local or server draft is available for restoration
 *
 * @param {boolean} isOpen - Whether modal is visible
 * @param {object} draft - Draft data to restore
 * @param {string} source - Draft source ('local' or 'server')
 * @param {function} onRestore - Callback when user clicks restore
 * @param {function} onDiscard - Callback when user clicks discard
 * @param {function} onCancel - Callback when user clicks cancel
 */
export default function DraftRestoreModal({
  isOpen,
  draft,
  source,
  onRestore,
  onDiscard,
  onCancel,
}) {
  if (!isOpen || !draft) return null;

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown';

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Get draft timestamp (handle both local and server format)
  const timestamp = draft.updatedAt || draft.updated_at;
  const timeAgo = formatTimestamp(timestamp);

  // Calculate content length
  const contentLength = (draft.body || '').length;
  const hasTitle = !!(draft.title || '').trim();
  const hasBody = contentLength > 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onCancel}
      ></div>

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl">
          {/* Header */}
          <div className="border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Unsaved Draft Found
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Last saved {timeAgo} ({source === 'local' ? 'locally' : 'on server'})
                </p>
              </div>
              <button
                onClick={onCancel}
                className="text-gray-400 hover:text-gray-500 transition"
                aria-label="Close"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-4 max-h-96 overflow-y-auto">
            {/* Draft Preview */}
            <div className="space-y-4">
              {/* Title Preview */}
              {hasTitle && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Title
                  </label>
                  <p className="text-base font-semibold text-gray-900 truncate">
                    {draft.title}
                  </p>
                </div>
              )}

              {/* Body Preview */}
              {hasBody && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Content Preview ({contentLength} characters)
                  </label>
                  <div className="bg-gray-50 rounded-md p-3 border border-gray-200">
                    <p className="text-sm text-gray-700 line-clamp-6">
                      {draft.body}
                    </p>
                  </div>
                </div>
              )}

              {/* Additional Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                {draft.category && (
                  <div>
                    <span className="font-medium text-gray-500">Category:</span>{' '}
                    <span className="text-gray-900 capitalize">{draft.category}</span>
                  </div>
                )}
                {draft.region && (
                  <div>
                    <span className="font-medium text-gray-500">Region:</span>{' '}
                    <span className="text-gray-900">{draft.region}</span>
                  </div>
                )}
                {draft.tags && draft.tags.length > 0 && (
                  <div className="col-span-2">
                    <span className="font-medium text-gray-500">Tags:</span>{' '}
                    <span className="text-gray-900">{draft.tags.join(', ')}</span>
                  </div>
                )}
              </div>

              {/* Empty Draft Warning */}
              {!hasTitle && !hasBody && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                  <p className="text-sm text-yellow-800">
                    This draft appears to be empty. You may want to discard it.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 px-6 py-4 flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
            {/* Discard Button */}
            <button
              onClick={onDiscard}
              className="px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition"
            >
              Discard Draft
            </button>

            {/* Restore & Cancel Buttons */}
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition"
              >
                Start Fresh
              </button>
              <button
                onClick={onRestore}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition"
              >
                Restore Draft
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
