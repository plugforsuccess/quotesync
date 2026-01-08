// src/lib/newsroomAnalytics.js
// Analytics tracking specifically for newsroom events

import { trackEvent } from './analytics';
import { supabase } from './supabase';

/**
 * Generate or retrieve anonymous session ID for analytics
 */
const getSessionId = () => {
  let sessionId = sessionStorage.getItem('newsroom_session_id');

  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('newsroom_session_id', sessionId);
  }

  return sessionId;
};

/**
 * Track analytics event to both Supabase and external providers
 */
const trackNewsroomEvent = async (storyId, eventType, metadata = {}) => {
  const sessionId = getSessionId();

  // Track to Supabase for internal analytics
  if (supabase) {
    try {
      await supabase
        .from('story_analytics')
        .insert({
          story_id: storyId,
          event_type: eventType,
          user_session_id: sessionId,
          referrer: document.referrer || null,
          metadata
        });
    } catch (error) {
      console.error('Failed to track newsroom event:', error);
    }
  }

  // Also track to external analytics (GA, Meta Pixel)
  trackEvent(`newsroom_${eventType}`, {
    story_id: storyId,
    ...metadata
  });
};

/**
 * Track feed view (when user lands on /news)
 */
export const trackFeedView = () => {
  trackEvent('newsroom_feed_view', {
    event_category: 'newsroom',
    event_label: 'feed_view'
  });
};

/**
 * Track story impression (when story card appears in viewport)
 */
export const trackStoryImpression = (story) => {
  trackNewsroomEvent(story.id, 'story_impression', {
    story_title: story.title,
    story_category: story.category,
    has_video: !!story.video_url
  });
};

/**
 * Track video play
 */
export const trackVideoPlay = (story) => {
  trackNewsroomEvent(story.id, 'video_play', {
    story_title: story.title,
    video_type: story.video_type
  });
};

/**
 * Track video completion
 */
export const trackVideoComplete = (story) => {
  trackNewsroomEvent(story.id, 'video_complete', {
    story_title: story.title,
    video_type: story.video_type
  });
};

/**
 * Track "Read more" open
 */
export const trackReadMoreOpen = (story) => {
  trackNewsroomEvent(story.id, 'read_more_open', {
    story_title: story.title,
    story_slug: story.slug
  });
};

/**
 * Track CTA click in newsroom
 */
export const trackNewsroomCTAClick = (story, ctaType) => {
  trackNewsroomEvent(story.id, 'cta_click', {
    story_title: story.title,
    cta_type: ctaType
  });
};

/**
 * Track share action
 */
export const trackNewsroomShare = (story) => {
  trackNewsroomEvent(story.id, 'share_click', {
    story_title: story.title,
    story_slug: story.slug
  });
};
