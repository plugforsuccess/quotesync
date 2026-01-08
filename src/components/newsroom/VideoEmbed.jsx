// src/components/newsroom/VideoEmbed.jsx
// Unified video embed component with lazy loading and autoplay control

import { useState, useEffect, useRef } from 'react';

/**
 * Extract YouTube video ID from various URL formats
 */
const getYouTubeId = (url) => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }

  return null;
};

/**
 * Extract X/Twitter tweet ID from URL
 */
const getTwitterId = (url) => {
  const match = url.match(/twitter\.com\/\w+\/status\/(\d+)|x\.com\/\w+\/status\/(\d+)/);
  return match ? (match[1] || match[2]) : null;
};

/**
 * YouTube embed component
 */
const YouTubeEmbed = ({ videoUrl, thumbnail, isActive, onPlay, onThumbnailClick, muted = true }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoId = getYouTubeId(videoUrl);

  if (!videoId) {
    return <div className="text-red-500">Invalid YouTube URL</div>;
  }

  const handleThumbnailClick = (e) => {
    e.stopPropagation();
    // If onThumbnailClick is provided, call it (opens story)
    // Otherwise, play the video
    if (onThumbnailClick) {
      onThumbnailClick();
    } else {
      setIsPlaying(true);
      if (onPlay) onPlay();
    }
  };

  // Show thumbnail until user clicks play
  if (!isPlaying || !isActive) {
    return (
      <div
        className="relative w-full aspect-video bg-gray-900 cursor-pointer group overflow-hidden"
        onClick={handleThumbnailClick}
      >
        <img
          src={thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
          alt="Video thumbnail"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 group-hover:bg-opacity-40 transition-all">
          <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
            <div className="w-0 h-0 border-t-8 border-t-transparent border-l-12 border-l-white border-b-8 border-b-transparent ml-1"></div>
          </div>
        </div>
        {/* Tooltip hint */}
        <div className="absolute bottom-3 right-3 bg-black/70 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
          Click to read story
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video bg-gray-900">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${muted ? 1 : 0}`}
        title="YouTube video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 w-full h-full"
      />
    </div>
  );
};

/**
 * X/Twitter embed component
 */
const XEmbed = ({ videoUrl, thumbnail, isActive, onPlay }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const containerRef = useRef(null);
  const tweetId = getTwitterId(videoUrl);

  useEffect(() => {
    if (!isActive || !tweetId || isLoaded) return;

    // Load Twitter widget script
    if (!window.twttr) {
      const script = document.createElement('script');
      script.src = 'https://platform.twitter.com/widgets.js';
      script.async = true;
      script.onload = () => {
        if (window.twttr && containerRef.current) {
          window.twttr.widgets.createTweet(tweetId, containerRef.current, {
            theme: 'light',
            conversation: 'none'
          });
          setIsLoaded(true);
          if (onPlay) onPlay();
        }
      };
      document.body.appendChild(script);
    } else if (containerRef.current) {
      window.twttr.widgets.createTweet(tweetId, containerRef.current, {
        theme: 'light',
        conversation: 'none'
      });
      setIsLoaded(true);
      if (onPlay) onPlay();
    }
  }, [isActive, tweetId, isLoaded, onPlay]);

  if (!tweetId) {
    return <div className="text-red-500">Invalid X/Twitter URL</div>;
  }

  // Show thumbnail until active
  if (!isActive) {
    return (
      <div className="relative w-full aspect-video bg-gray-100">
        {thumbnail && (
          <img
            src={thumbnail}
            alt="Tweet preview"
            className="w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20">
          <span className="text-white text-sm font-medium">Click to load tweet</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full min-h-[200px] flex items-center justify-center bg-gray-50">
      {!isLoaded && <div className="text-gray-500">Loading tweet...</div>}
    </div>
  );
};

/**
 * Generic hosted video embed (Vimeo, Cloudflare Stream, Mux)
 */
const HostedVideoEmbed = ({ videoUrl, thumbnail, isActive, onPlay, muted = true }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);

  const handlePlay = () => {
    setIsPlaying(true);
    if (onPlay) onPlay();
    if (videoRef.current) {
      videoRef.current.play();
    }
  };

  // Show thumbnail until user clicks play
  if (!isPlaying || !isActive) {
    return (
      <div
        className="relative w-full aspect-video bg-gray-900 cursor-pointer group overflow-hidden"
        onClick={handlePlay}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt="Video thumbnail"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-800">
            <span className="text-white text-sm">Video</span>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 group-hover:bg-opacity-40 transition-all">
          <div className="w-16 h-16 bg-white bg-opacity-90 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
            <div className="w-0 h-0 border-t-8 border-t-transparent border-l-12 border-l-gray-800 border-b-8 border-b-transparent ml-1"></div>
          </div>
        </div>
      </div>
    );
  }

  // Check if it's a Vimeo URL (embed as iframe) or direct video file
  const isVimeo = videoUrl.includes('vimeo.com');

  if (isVimeo) {
    const vimeoId = videoUrl.match(/vimeo\.com\/(\d+)/)?.[1];
    return (
      <div className="relative w-full aspect-video bg-gray-900">
        <iframe
          src={`https://player.vimeo.com/video/${vimeoId}?autoplay=1&muted=${muted ? 1 : 0}`}
          title="Vimeo video player"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
      </div>
    );
  }

  // Direct video file (mp4, webm, etc.)
  return (
    <div className="relative w-full aspect-video bg-gray-900">
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        muted={muted}
        playsInline
        className="w-full h-full"
      />
    </div>
  );
};

/**
 * Main VideoEmbed component - routes to appropriate embed type
 */
const VideoEmbed = ({ videoType, videoUrl, thumbnail, isActive = false, onPlay, onThumbnailClick, muted = true }) => {
  if (!videoType || !videoUrl) {
    return null;
  }

  switch (videoType) {
    case 'youtube_embed':
      return (
        <YouTubeEmbed
          videoUrl={videoUrl}
          thumbnail={thumbnail}
          isActive={isActive}
          onPlay={onPlay}
          onThumbnailClick={onThumbnailClick}
          muted={muted}
        />
      );

    case 'x_embed':
      return (
        <XEmbed
          videoUrl={videoUrl}
          thumbnail={thumbnail}
          isActive={isActive}
          onPlay={onPlay}
        />
      );

    case 'own_hosted':
      return (
        <HostedVideoEmbed
          videoUrl={videoUrl}
          thumbnail={thumbnail}
          isActive={isActive}
          onPlay={onPlay}
          muted={muted}
        />
      );

    default:
      return <div className="text-red-500">Unsupported video type</div>;
  }
};

export default VideoEmbed;
