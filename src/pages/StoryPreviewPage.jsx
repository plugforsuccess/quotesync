// src/pages/StoryPreviewPage.jsx
// Preview page for draft and in_review stories (authenticated users only)

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, AlertTriangle } from 'lucide-react';
import { supabase, getUserRole, hasPermission } from '../lib/supabase';

const StoryPreviewPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [story, setStory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    const loadStory = async () => {
      try {
        // Check authentication
        const { user, role } = await getUserRole();

        if (!user || !hasPermission(role, 'editor')) {
          setError('You must be logged in as an editor or admin to preview stories.');
          setLoading(false);
          return;
        }

        setUserRole(role);

        // Fetch story from database (using stories_with_authors for author info)
        const { data, error: fetchError } = await supabase
          .from('stories_with_authors')
          .select('*')
          .eq('id', id)
          .single();

        if (fetchError) throw fetchError;

        if (!data) {
          setError('Story not found');
          setLoading(false);
          return;
        }

        // Check if user has permission to preview this story
        if (data.status === 'archived' && role !== 'admin') {
          setError('Only admins can preview archived stories.');
          setLoading(false);
          return;
        }

        setStory(data);
        setLoading(false);
      } catch (error) {
        console.error('Error loading story:', error);
        setError('Failed to load story: ' + error.message);
        setLoading(false);
      }
    };

    loadStory();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading preview...</p>
        </div>
      </div>
    );
  }

  if (error || !story) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Preview Not Available</h1>
          <p className="text-gray-600 mb-6">{error || 'Story not found'}</p>
          <button
            onClick={() => navigate('/news/dashboard')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Format published date
  const formatDate = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Preview Mode Banner */}
      <div className="bg-yellow-500 text-white py-3 px-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            <span className="font-semibold">PREVIEW MODE</span>
            <span className="text-yellow-100 text-sm">
              Status: <span className="font-medium capitalize">{story.status}</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/news/editor/${story.id}`)}
              className="text-sm px-3 py-1 bg-white text-yellow-600 rounded hover:bg-yellow-50 transition-colors font-medium"
            >
              Edit Story
            </button>
            <button
              onClick={() => navigate('/news/dashboard')}
              className="text-sm px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors font-medium flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* Story Content (same as public story page) */}
      <article className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* Category Badge */}
        <div className="mb-4">
          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full uppercase tracking-wide">
            {story.category}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">
          {story.title}
        </h1>

        {/* Meta Info */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-6 pb-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">
              {story.author_name || 'Unknown Author'}
            </span>
          </div>
          {story.published_at && (
            <>
              <span>•</span>
              <time dateTime={story.published_at}>
                {formatDate(story.published_at)}
              </time>
            </>
          )}
          {story.region && (
            <>
              <span>•</span>
              <span>{story.region}</span>
            </>
          )}
        </div>

        {/* Preview Hook */}
        {story.preview_hook && (
          <div className="text-lg sm:text-xl text-gray-700 mb-8 font-medium leading-relaxed">
            {story.preview_hook}
          </div>
        )}

        {/* Video Embed (if exists) */}
        {story.video_url && story.video_type && (
          <div className="mb-8 rounded-lg overflow-hidden shadow-lg">
            {story.video_type === 'youtube_embed' && (
              <div className="relative pb-[56.25%] h-0">
                <iframe
                  src={story.video_url}
                  className="absolute top-0 left-0 w-full h-full"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="Story video"
                ></iframe>
              </div>
            )}
            {story.video_type === 'x_embed' && (
              <div className="relative pb-[56.25%] h-0">
                <iframe
                  src={story.video_url}
                  className="absolute top-0 left-0 w-full h-full"
                  frameBorder="0"
                  allowFullScreen
                  title="Story video"
                ></iframe>
              </div>
            )}
            {story.video_type === 'own_hosted' && (
              <video
                src={story.video_url}
                controls
                className="w-full"
                poster={story.video_thumbnail}
              >
                Your browser does not support the video tag.
              </video>
            )}
          </div>
        )}

        {/* Story Body */}
        <div className="prose prose-lg max-w-none">
          {story.body.split('\n\n').map((paragraph, index) => (
            <p key={index} className="mb-4 text-gray-800 leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>

        {/* Source Attribution */}
        {story.source_name && story.source_url && (
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Source:{' '}
              <a
                href={story.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                {story.source_name}
              </a>
            </p>
          </div>
        )}

        {/* Tags */}
        {story.tags && story.tags.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {story.tags.map((tag, index) => (
              <span
                key={index}
                className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </article>
    </div>
  );
};

export default StoryPreviewPage;
