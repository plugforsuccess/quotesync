// src/components/newsroom/StoryCard.jsx
// Story card component for newsroom feed with video embedding and analytics

import { useState, useEffect, useRef } from 'react';
import { Share2, ExternalLink } from 'lucide-react';
import VideoEmbed from './VideoEmbed';
import { trackStoryImpression, trackVideoPlay, trackReadMoreOpen, trackNewsroomShare, trackNewsroomCTAClick } from '../../lib/newsroomAnalytics';

/**
 * Format timestamp to relative time (e.g., "2h ago", "Today")
 */
const formatTimestamp = (publishedAt) => {
  if (!publishedAt) return '';

  const date = new Date(publishedAt);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/**
 * Category chip with unified design system colors
 */
const CategoryChip = ({ category }) => {
  // Mapping to unified design tokens - maintains visual distinction while using brand palette
  const colors = {
    litigation: 'bg-[#fee2e2] text-[#b91c1c] border border-[#fecaca]',
    law: 'bg-primary-100 text-primary-800 border border-primary-200',
    accident: 'bg-[#fed7aa] text-[#c2410c] border border-[#fdba74]',
    data: 'bg-[#e9d5ff] text-[#6b21a8] border border-[#d8b4fe]',
    policy: 'bg-success-100 text-success-800 border border-success-200'
  };

  const labels = {
    litigation: 'Litigation',
    law: 'Law',
    accident: 'Accident',
    data: 'Data',
    policy: 'Policy'
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[category] || 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
      {labels[category] || category}
    </span>
  );
};

/**
 * Story Card Component
 */
const StoryCard = ({ story, isActive = false, onReadMore }) => {
  const [hasTrackedImpression, setHasTrackedImpression] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const cardRef = useRef(null);

  // Track impression when card enters viewport
  useEffect(() => {
    if (hasTrackedImpression) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasTrackedImpression) {
            trackStoryImpression(story);
            setHasTrackedImpression(true);
          }
        });
      },
      { threshold: 0.5 } // Track when 50% visible
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => {
      if (cardRef.current) {
        observer.unobserve(cardRef.current);
      }
    };
  }, [story, hasTrackedImpression]);

  // Handle video play event
  const handleVideoPlay = () => {
    if (!videoPlaying) {
      trackVideoPlay(story);
      setVideoPlaying(true);
    }
  };

  // Handle read more click
  const handleReadMore = () => {
    trackReadMoreOpen(story);
    if (onReadMore) {
      onReadMore(story);
    }
  };

  // Handle share click
  const handleShare = async () => {
    trackNewsroomShare(story);

    const url = `${window.location.origin}/news/${story.slug}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: story.title,
          text: story.preview_hook,
          url: url
        });
      } catch (err) {
        // User cancelled or error - fall back to copy
        copyToClipboard(url);
      }
    } else {
      copyToClipboard(url);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    // You could add a toast notification here
    alert('Link copied to clipboard!');
  };

  // Handle CTA click
  const handleCTAClick = (ctaType) => {
    trackNewsroomCTAClick(story, ctaType);
    // Navigate to appropriate page based on CTA
    if (ctaType === 'compare_policy') {
      window.location.href = '/quotes';
    } else if (ctaType === 'webinar') {
      window.location.href = '/courses';
    }
  };

  return (
    <div
      ref={cardRef}
      className="bg-white border-b border-gray-200 py-6 px-4 md:px-6 hover:bg-gray-50 transition-colors"
    >
      {/* Featured badge - using accent color from design system */}
      {story.is_featured && (
        <div className="mb-3">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-accent-100 text-accent-800 border border-accent-200">
            ⭐ Featured
          </span>
        </div>
      )}

      {/* Headline - Primary visual anchor */}
      <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3 leading-tight">
        {story.title}
      </h2>

      {/* Preview hook - 2-3 sentences */}
      <p className="text-gray-700 text-base md:text-lg mb-4 leading-relaxed">
        {story.preview_hook}
      </p>

      {/* Embedded video (optional) */}
      {story.video_url && (
        <div className="mb-4 cursor-pointer" onClick={handleReadMore}>
          <VideoEmbed
            videoType={story.video_type}
            videoUrl={story.video_url}
            thumbnail={story.video_thumbnail}
            isActive={isActive}
            onPlay={handleVideoPlay}
            muted={true}
            onThumbnailClick={handleReadMore}
          />
          {story.source_name && (
            <div className="mt-2 flex items-center text-xs text-gray-500">
              <ExternalLink className="w-3 h-3 mr-1" />
              <span>Source: {story.source_name}</span>
              {story.source_url && (
                <a
                  href={story.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 underline hover:text-gray-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  View original
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
        <CategoryChip category={story.category} />

        {story.region && (
          <span className="text-gray-500">
            📍 {story.region}
          </span>
        )}

        <span className="text-gray-400">•</span>

        <span className="text-gray-500">
          {formatTimestamp(story.published_at)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={handleReadMore}
            className="text-primary-600 hover:text-primary-700 font-semibold text-sm transition-colors"
          >
            Read more →
          </button>

          <button
            onClick={handleShare}
            className="flex items-center gap-1 text-gray-600 hover:text-gray-800 text-sm transition-colors"
          >
            <Share2 className="w-4 h-4" />
            <span>Share</span>
          </button>
        </div>

        {/* Subtle CTA - using primary color from design system */}
        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={() => handleCTAClick('compare_policy')}
            className="text-xs text-gray-500 hover:text-primary-600 transition-colors"
          >
            Compare your policy
          </button>
          <span className="text-gray-300">•</span>
          <button
            onClick={() => handleCTAClick('webinar')}
            className="text-xs text-gray-500 hover:text-primary-600 transition-colors"
          >
            Join next live breakdown
          </button>
        </div>
      </div>
    </div>
  );
};

export default StoryCard;
