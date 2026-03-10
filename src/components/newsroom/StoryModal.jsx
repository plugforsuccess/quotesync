// src/components/newsroom/StoryModal.jsx
// Full story modal for "Read more" functionality

import { useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';
import VideoEmbed from './VideoEmbed';
import { trackVideoPlay, trackNewsroomCTAClick } from '../../lib/newsroomAnalytics';
import { getCategoryLabel, getCategoryContextMessage, getTagLabel, getTagColor } from '../../lib/categories';

/**
 * Format body text with basic paragraph support
 * In production, you might want to use a markdown renderer
 */
const formatBody = (body) => {
  return body.split('\n\n').map((paragraph, index) => (
    <p key={index} className="mb-4">
      {paragraph}
    </p>
  ));
};

const StoryModal = ({ story, isOpen, onClose }) => {
  // Close on ESC key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      window.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !story) return null;

  const handleCTAClick = (ctaType) => {
    trackNewsroomCTAClick(story, ctaType);
    onClose();

    // Navigate after closing modal
    setTimeout(() => {
      if (ctaType === 'compare_policy') {
        window.location.href = '/quotes';
      } else if (ctaType === 'webinar') {
        window.location.href = '/courses';
      }
    }, 300);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
        <div className="absolute inset-0" onClick={onClose} />
          <div
            className="relative bg-white w-full rounded-t-2xl sm:rounded-2xl sm:max-w-3xl max-h-[90vh] overflow-y-auto p-5 sm:p-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="sticky top-4 right-4 float-right z-10 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>

            {/* Content */}
            <div className="p-6 md:p-8">
              {/* Featured badge */}
              {story.is_featured && (
                <div className="mb-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800">
                    ⭐ Featured
                  </span>
                </div>
              )}

              {/* Title */}
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 leading-tight">
                {story.title}
              </h1>

              {/* Meta */}
              <div className="flex flex-wrap items-center gap-2 mb-6 text-sm text-gray-600">
                <span className="font-medium">{getCategoryLabel(story.category)}</span>
                {story.secondary_tags?.length > 0 && (
                  <>
                    <span>•</span>
                    <div className="flex gap-1">
                      {story.secondary_tags.map((tag) => (
                        <span key={tag} className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTagColor(tag)}`}>
                          {getTagLabel(tag)}
                        </span>
                      ))}
                    </div>
                  </>
                )}
                {story.region && (
                  <>
                    <span>•</span>
                    <span>{story.region}</span>
                  </>
                )}
                <span>•</span>
                <span>{new Date(story.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>

              {/* Video (if available and not already shown) */}
              {story.video_url && (
                <div className="mb-6">
                  <VideoEmbed
                    videoType={story.video_type}
                    videoUrl={story.video_url}
                    thumbnail={story.video_thumbnail}
                    isActive={true}
                    onPlay={() => trackVideoPlay(story)}
                    muted={false}
                  />
                  {story.source_name && (
                    <div className="mt-2 flex items-center text-sm text-gray-500">
                      <ExternalLink className="w-4 h-4 mr-1" />
                      <span>Source: {story.source_name}</span>
                      {story.source_url && (
                        <a
                          href={story.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1 underline hover:text-gray-700"
                        >
                          View original
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Full article body */}
              <div className="prose prose-lg max-w-none mb-6 text-gray-800 leading-relaxed">
                {formatBody(story.body)}
              </div>

              {/* "Why this matters" section */}
              <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-3">
                  Why This Matters for Georgia Drivers
                </h2>
                <p className="text-gray-700 leading-relaxed">
                  Understanding these developments helps you make informed decisions about your coverage.
                  {getCategoryContextMessage(story.category) && ` ${getCategoryContextMessage(story.category)}`}
                </p>
              </div>

              {/* Attribution */}
              {story.source_name && (
                <div className="border-t border-gray-200 pt-4 mb-6">
                  <p className="text-sm text-gray-500">
                    Information sourced from {story.source_name}
                    {story.source_url && (
                      <>
                        {' • '}
                        <a
                          href={story.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-gray-700"
                        >
                          Read original article
                        </a>
                      </>
                    )}
                  </p>
                </div>
              )}

              {/* CTA Block */}
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-3">
                  Take Action
                </h3>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => handleCTAClick('compare_policy')}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                  >
                    Compare Your Policy
                  </button>
                  <button
                    onClick={() => handleCTAClick('webinar')}
                    className="flex-1 bg-white hover:bg-gray-100 text-gray-800 font-semibold py-3 px-6 rounded-lg border border-gray-300 transition-colors"
                  >
                    Join Next Live Breakdown
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
    </>
  );
};

export default StoryModal;
