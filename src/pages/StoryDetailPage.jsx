// src/pages/StoryDetailPage.jsx
// Individual story page with full SEO optimization for /news/{slug}

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Share2 } from 'lucide-react';
import VideoEmbed from '../components/newsroom/VideoEmbed';
import { supabase } from '../lib/supabase';
import { trackReadMoreOpen, trackVideoPlay, trackNewsroomShare, trackNewsroomCTAClick } from '../lib/newsroomAnalytics';

/**
 * Format body text with basic paragraph support
 */
const formatBody = (body) => {
  return body.split('\n\n').map((paragraph, index) => (
    <p key={index} className="mb-4">
      {paragraph}
    </p>
  ));
};

/**
 * SEO Meta Tags Component
 */
const StoryMeta = ({ story }) => {
  useEffect(() => {
    if (!story) return;

    // Update page title
    document.title = story.meta_title || `${story.title} | InsuredByCam Insurance Newsroom`;

    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', story.meta_description || story.preview_hook);
    } else {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = story.meta_description || story.preview_hook;
      document.head.appendChild(meta);
    }

    // OpenGraph tags
    const ogTags = {
      'og:title': story.meta_title || story.title,
      'og:description': story.meta_description || story.preview_hook,
      'og:image': story.og_image || story.video_thumbnail || '/og-default.jpg',
      'og:url': `${window.location.origin}/news/${story.slug}`,
      'og:type': 'article',
      'article:published_time': story.published_at,
      'article:author': 'InsuredByCam',
      'article:section': story.category
    };

    Object.entries(ogTags).forEach(([property, content]) => {
      if (!content) return;

      let meta = document.querySelector(`meta[property="${property}"]`);
      if (meta) {
        meta.setAttribute('content', content);
      } else {
        meta = document.createElement('meta');
        meta.setAttribute('property', property);
        meta.setAttribute('content', content);
        document.head.appendChild(meta);
      }
    });

    // Twitter Card tags
    const twitterTags = {
      'twitter:card': 'summary_large_image',
      'twitter:title': story.meta_title || story.title,
      'twitter:description': story.meta_description || story.preview_hook,
      'twitter:image': story.og_image || story.video_thumbnail || '/og-default.jpg'
    };

    Object.entries(twitterTags).forEach(([name, content]) => {
      if (!content) return;

      let meta = document.querySelector(`meta[name="${name}"]`);
      if (meta) {
        meta.setAttribute('content', content);
      } else {
        meta = document.createElement('meta');
        meta.setAttribute('name', name);
        meta.setAttribute('content', content);
        document.head.appendChild(meta);
      }
    });

    // Canonical URL
    let canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      canonical.setAttribute('href', `${window.location.origin}/news/${story.slug}`);
    } else {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      canonical.setAttribute('href', `${window.location.origin}/news/${story.slug}`);
      document.head.appendChild(canonical);
    }
  }, [story]);

  return null;
};

const StoryDetailPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [story, setStory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [relatedStories, setRelatedStories] = useState([]);

  // Fetch story by slug
  useEffect(() => {
    const fetchStory = async () => {
      try {
        setLoading(true);

        const { data, error } = await supabase
          .from('stories')
          .select('*')
          .eq('slug', slug)
          .eq('status', 'published')
          .single();

        if (error) throw error;

        if (data) {
          setStory(data);
          trackReadMoreOpen(data);

          // Fetch related stories in the same category
          const { data: related } = await supabase
            .from('stories')
            .select('id, title, slug, preview_hook, category, published_at')
            .eq('category', data.category)
            .eq('status', 'published')
            .neq('id', data.id)
            .order('published_at', { ascending: false })
            .limit(3);

          setRelatedStories(related || []);
        }
      } catch (error) {
        console.error('Error fetching story:', error);
        setStory(null);
      } finally {
        setLoading(false);
      }
    };

    fetchStory();
  }, [slug]);

  // Handle share
  const handleShare = async () => {
    if (!story) return;
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
        copyToClipboard(url);
      }
    } else {
      copyToClipboard(url);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Link copied to clipboard!');
  };

  // Handle CTA click
  const handleCTAClick = (ctaType) => {
    if (!story) return;
    trackNewsroomCTAClick(story, ctaType);

    if (ctaType === 'compare_policy') {
      navigate('/quotes');
    } else if (ctaType === 'webinar') {
      navigate('/courses');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading story...</p>
        </div>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="text-6xl mb-4">📰</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Story Not Found</h1>
          <p className="text-gray-600 mb-6">
            The story you're looking for doesn't exist or has been removed.
          </p>
          <Link
            to="/news"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Newsroom
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <StoryMeta story={story} />

      <div className="min-h-screen bg-white">
        {/* Header */}
        <div className="bg-gray-50 border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <Link
              to="/news"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Newsroom
            </Link>
          </div>
        </div>

        {/* Article */}
        <article className="max-w-4xl mx-auto px-4 py-8">
          {/* Featured badge */}
          {story.is_featured && (
            <div className="mb-3">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800">
                ⭐ Featured
              </span>
            </div>
          )}

          {/* Title */}
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">
            {story.title}
          </h1>

          {/* Meta */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-6 border-b border-gray-200">
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
              <span className="font-medium capitalize">{story.category}</span>
              {story.region && (
                <>
                  <span>•</span>
                  <span>{story.region}</span>
                </>
              )}
              <span>•</span>
              <span>{new Date(story.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            </div>

            <button
              onClick={handleShare}
              className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
          </div>

          {/* Video */}
          {story.video_url && (
            <div className="mb-8">
              <VideoEmbed
                videoType={story.video_type}
                videoUrl={story.video_url}
                thumbnail={story.video_thumbnail}
                isActive={true}
                onPlay={() => trackVideoPlay(story)}
                muted={false}
              />
              {story.source_name && (
                <div className="mt-3 flex items-center text-sm text-gray-500">
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

          {/* Body */}
          <div className="prose prose-lg max-w-none mb-8 text-gray-800 leading-relaxed">
            {formatBody(story.body)}
          </div>

          {/* Why This Matters */}
          <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              Why This Matters for Georgia Drivers
            </h2>
            <p className="text-gray-700 leading-relaxed text-lg">
              Understanding these developments helps you make informed decisions about your coverage.
              {story.category === 'litigation' && ' Legal changes can directly impact your rates and policy terms.'}
              {story.category === 'accident' && ' Accident trends in your area can affect insurance premiums and coverage needs.'}
              {story.category === 'policy' && ' Policy updates may create opportunities to save money or improve your protection.'}
              {story.category === 'data' && ' Data-driven insights reveal how insurance markets are shifting in real-time.'}
              {story.category === 'law' && ' New laws can change your rights and requirements as a driver.'}
            </p>
          </div>

          {/* Attribution */}
          {story.source_name && (
            <div className="border-t border-gray-200 pt-6 mb-8">
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
          <div className="bg-gray-50 rounded-lg p-8 border border-gray-200 mb-12">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">
              Take Action
            </h3>
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => handleCTAClick('compare_policy')}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors"
              >
                Compare Your Policy
              </button>
              <button
                onClick={() => handleCTAClick('webinar')}
                className="flex-1 bg-white hover:bg-gray-100 text-gray-800 font-semibold py-4 px-6 rounded-lg border border-gray-300 transition-colors"
              >
                Join Next Live Breakdown
              </button>
            </div>
          </div>

          {/* Related Stories */}
          {relatedStories.length > 0 && (
            <div className="border-t border-gray-200 pt-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Related Stories</h3>
              <div className="grid md:grid-cols-3 gap-6">
                {relatedStories.map((related) => (
                  <Link
                    key={related.id}
                    to={`/news/${related.slug}`}
                    className="group"
                  >
                    <div className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
                      <h4 className="font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                        {related.title}
                      </h4>
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {related.preview_hook}
                      </p>
                      <div className="mt-3 text-xs text-gray-500">
                        {new Date(related.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </article>
      </div>
    </>
  );
};

export default StoryDetailPage;
