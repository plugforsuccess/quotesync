// src/pages/StoryDetailPage.jsx
// Individual story page with full SEO optimization for /news/{slug}

import { T } from '../components/SiteCopy';
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Share2 } from 'lucide-react';
import VideoEmbed from '../components/newsroom/VideoEmbed';
import { supabase } from '../lib/supabase';
import { trackReadMoreOpen, trackVideoPlay, trackNewsroomShare, trackNewsroomCTAClick } from '../lib/newsroomAnalytics';
import PageSpinner from '../components/PageSpinner';
import { getCategoryLabel, getCategoryContextMessage } from '../lib/categories';

const AGENCY_SMS = '+17707861616';

/**
 * Format body text with basic paragraph support
 */
// Blank lines separate paragraphs; a single line break stays a line break, so
// headings and lists written one per line don't run together.
const formatBody = (body) => {
  return (body || '').split(/\n\s*\n/).filter((p) => p.trim()).map((paragraph, index) => {
    const lines = paragraph.split('\n');
    return (
      <p key={index} className="mb-4">
        {lines.map((line, i) => <span key={i}>{i > 0 && <br />}{line}</span>)}
      </p>
    );
  });
};

/**
 * SEO Meta Tags — React 19 document metadata (hoists to <head>)
 */
const StoryMeta = ({ story }) => {
  if (!story) {
    return <title>Newsroom | insuredbycam</title>;
  }

  const storyTitle = story.meta_title || `${story.title} | insuredbycam Newsroom`;
  const description = story.meta_description || story.preview_hook || '';
  const ogImage = story.og_image || story.video_thumbnail || '/og-default.jpg';
  const url = `https://insuredbycam.com/news/${story.slug}`;

  return (
    <>
      <title>{storyTitle}</title>
      <meta name="description" content={description} />
      <meta property="og:type" content="article" />
      <meta property="og:title" content={story.title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={ogImage} />
      <meta property="article:published_time" content={story.published_at} />
      <meta property="article:author" content={story.author_name || 'insuredbycam'} />
      <link rel="canonical" href={url} />
      <script type="application/ld+json">{JSON.stringify({
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "headline": story.title,
        "description": description,
        "url": url,
        "datePublished": story.published_at,
        "author": { "@type": "Person", "name": story.author_name || "Cameron" },
        "publisher": {
          "@type": "Organization",
          "name": "insuredbycam",
          "url": "https://insuredbycam.com"
        },
        ...(ogImage !== '/og-default.jpg' ? { "image": ogImage } : {}),
      })}</script>
    </>
  );
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

        // Fetch story with author information
        const { data, error } = await supabase
          .from('stories_with_authors')
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
      } catch {
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

    if (ctaType === 'compare_policy') navigate('/');
  };

  if (loading) {
    return <PageSpinner label="Loading story..." />;
  }

  if (!story) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="text-6xl mb-4">📰</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2"><T k="pages.storydetailpage.d60bd7">Story Not Found</T></h1>
          <p className="text-gray-600 mb-6">
            <T k="pages.storydetailpage.9f9e0c">The story you're looking for doesn't exist or has been removed.</T>
          </p>
          <Link
            to="/news"
            className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <T k="pages.storydetailpage.97b6ac">Back to Newsroom</T>
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
              className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <T k="pages.storydetailpage.97b6ac">Back to Newsroom</T>
            </Link>
          </div>
        </div>

        {/* Article */}
        <article className="max-w-4xl mx-auto px-4 py-8">
          {/* Featured badge */}
          {story.is_featured && (
            <div className="mb-3">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800">
                <T k="pages.storydetailpage.52254f">⭐ Featured</T>
              </span>
            </div>
          )}

          {/* Title */}
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-3 leading-tight">
            {story.title}
          </h1>

          {/* Author Byline */}
          {story.author_name && (
            <div className="text-lg text-gray-600 mb-6">
              <T k="pages.storydetailpage.53e5aa">By</T> <span className="font-medium text-gray-900">{story.author_name}</span>
            </div>
          )}

          {/* Meta */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-6 border-b border-gray-200">
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
              <span className="font-medium">{getCategoryLabel(story.category)}</span>
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
              className="flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium text-sm transition-colors"
            >
              <Share2 className="w-4 h-4" />
              <T k="pages.storydetailpage.5a95a4">Share</T>
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
                  <span><T k="pages.storydetailpage.77c8b9">Source:</T> {story.source_name}</span>
                  {story.source_url && (
                    <a
                      href={story.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 underline hover:text-gray-700"
                    >
                      <T k="pages.storydetailpage.773c80">View original</T>
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
          <div className="bg-primary-50 border-l-4 border-primary-500 p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              <T k="pages.storydetailpage.aa8aa0">Why this matters</T>
            </h2>
            <p className="text-gray-700 leading-relaxed text-lg">
              {getCategoryContextMessage(story.category) || 'Rules and rates change; your policy doesn’t update itself. Check whether this touches your coverage.'}
            </p>
          </div>

          {/* Attribution */}
          {story.source_name && (
            <div className="border-t border-gray-200 pt-6 mb-8">
              <p className="text-sm text-gray-500">
                <T k="pages.storydetailpage.c7ce9b">Information sourced from</T> {story.source_name}
                {story.source_url && (
                  <>
                    {' • '}
                    <a
                      href={story.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-gray-700"
                    >
                      <T k="pages.storydetailpage.7fc9aa">Read original article</T>
                    </a>
                  </>
                )}
              </p>
            </div>
          )}

          {/* The ask */}
          <div className="bg-gray-50 rounded-lg p-8 border border-gray-200 mb-12">
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              <T k="pages.storydetailpage.964a04">Does this touch your policy?</T>
            </h3>
            <p className="text-gray-600 mb-5"><T k="pages.storydetailpage.f12ac4">Send your declarations page and a licensed agent will check it, usually within 30 minutes during business hours. Or just text Cam the question.</T></p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => handleCTAClick('compare_policy')}
                className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors"
              >
                <T k="pages.storydetailpage.f8feed">Upload my policy</T>
              </button>
              <a
                href={`sms:${AGENCY_SMS}?&body=${encodeURIComponent(`Hi Cam, I read "${story.title}" and have a question.`)}`}
                onClick={() => trackNewsroomCTAClick(story, 'text_cam')}
                className="flex-1 text-center bg-white hover:bg-gray-100 text-gray-800 font-semibold py-4 px-6 rounded-lg border border-gray-300 transition-colors"
              >
                <T k="pages.storydetailpage.25c0d2">Text Cam</T>
              </a>
            </div>
          </div>

          {/* Related Stories */}
          {relatedStories.length > 0 && (
            <div className="border-t border-gray-200 pt-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-6"><T k="pages.storydetailpage.9e2a42">Related Stories</T></h3>
              <div className="grid md:grid-cols-3 gap-6">
                {relatedStories.map((related) => (
                  <Link
                    key={related.id}
                    to={`/news/${related.slug}`}
                    className="group"
                  >
                    <div className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
                      <h4 className="font-bold text-gray-900 mb-2 group-hover:text-primary-600 transition-colors">
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
