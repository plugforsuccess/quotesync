// src/pages/NewsroomEditorPage.jsx
// CMS interface for editors to create and manage stories

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Eye, Send, Trash2, Plus } from 'lucide-react';
import { supabase, getUserRole, hasPermission } from '../lib/supabase';

const NewsroomEditorPage = () => {
  const { id } = useParams(); // If editing existing story
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [story, setStory] = useState({
    title: '',
    slug: '',
    preview_hook: '',
    body: '',
    category: 'policy',
    region: 'GA',
    tags: [],
    video_type: null,
    video_url: '',
    video_thumbnail: '',
    source_name: '',
    source_url: '',
    status: 'draft',
    meta_title: '',
    meta_description: '',
    og_image: ''
  });

  // Check authentication and role
  useEffect(() => {
    const checkAuth = async () => {
      const { user, role } = await getUserRole();

      if (!user || !hasPermission(role, 'editor')) {
        alert('You must be logged in as an editor or admin to access this page.');
        navigate('/news');
        return;
      }

      setUserRole(role);

      // If editing, fetch story
      if (id) {
        await fetchStory(id);
      }

      setLoading(false);
    };

    checkAuth();
  }, [id, navigate]);

  // Fetch existing story
  const fetchStory = async (storyId) => {
    try {
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .eq('id', storyId)
        .single();

      if (error) throw error;

      if (data) {
        setStory({
          ...data,
          tags: data.tags || []
        });
      }
    } catch (error) {
      console.error('Error fetching story:', error);
      alert('Failed to load story');
      navigate('/news/editor');
    }
  };

  // Auto-generate slug from title
  const generateSlug = (title) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  // Handle form changes
  const handleChange = (field, value) => {
    setStory((prev) => ({
      ...prev,
      [field]: value
    }));

    // Auto-generate slug when title changes
    if (field === 'title' && !id) {
      setStory((prev) => ({
        ...prev,
        slug: generateSlug(value)
      }));
    }
  };

  // Save draft
  const handleSave = async () => {
    if (!story.title || !story.slug || !story.preview_hook || !story.body) {
      alert('Please fill in all required fields: Title, Slug, Preview Hook, and Body');
      return;
    }

    setSaving(true);

    try {
      const storyData = {
        ...story,
        updated_at: new Date().toISOString()
      };

      if (id) {
        // Update existing
        const { error } = await supabase
          .from('stories')
          .update(storyData)
          .eq('id', id);

        if (error) throw error;
        alert('Story saved successfully!');
      } else {
        // Create new
        const { data: { user } } = await supabase.auth.getUser();
        storyData.author_id = user.id;

        const { data, error } = await supabase
          .from('stories')
          .insert([storyData])
          .select()
          .single();

        if (error) throw error;
        alert('Story created successfully!');
        navigate(`/news/editor/${data.id}`);
      }
    } catch (error) {
      console.error('Error saving story:', error);
      alert('Failed to save story: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Submit for review
  const handleSubmitForReview = async () => {
    setStory((prev) => ({ ...prev, status: 'review' }));
    await handleSave();
  };

  // Preview story
  const handlePreview = () => {
    if (story.slug) {
      window.open(`/news/${story.slug}`, '_blank');
    } else {
      alert('Please save the story first to preview it');
    }
  };

  // Delete story
  const handleDelete = async () => {
    if (!id) return;

    if (!confirm('Are you sure you want to delete this story?')) return;

    try {
      const { error } = await supabase
        .from('stories')
        .delete()
        .eq('id', id);

      if (error) throw error;

      alert('Story deleted successfully');
      navigate('/news/editor');
    } catch (error) {
      console.error('Error deleting story:', error);
      alert('Failed to delete story');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading editor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <button
              onClick={() => navigate('/news/dashboard')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium text-sm sm:text-base"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to Dashboard</span>
              <span className="sm:hidden">Back</span>
            </button>

            <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0">
              <button
                onClick={handlePreview}
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-xs sm:text-sm whitespace-nowrap"
              >
                <Eye className="w-4 h-4" />
                <span className="hidden sm:inline">Preview</span>
              </button>

              {id && userRole === 'admin' && (
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-xs sm:text-sm whitespace-nowrap"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Delete</span>
                </button>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-colors disabled:opacity-50 text-xs sm:text-sm whitespace-nowrap"
              >
                <Save className="w-4 h-4" />
                <span className="hidden sm:inline">{saving ? 'Saving...' : 'Save Draft'}</span>
                <span className="sm:hidden">Save</span>
              </button>

              <button
                onClick={handleSubmitForReview}
                disabled={saving}
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 text-xs sm:text-sm whitespace-nowrap"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Submit for Review</span>
                <span className="sm:hidden">Submit</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              story.status === 'published' ? 'bg-green-100 text-green-700' :
              story.status === 'review' ? 'bg-yellow-100 text-yellow-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {story.status.toUpperCase()}
            </span>
            {id && <span>• Story ID: {id}</span>}
          </div>
        </div>
      </div>

      {/* Editor Form */}
      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-4 sm:py-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-6">
          {/* Title */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={story.title}
              onChange={(e) => handleChange('title', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg font-semibold text-gray-900"
              placeholder="Enter story title..."
            />
          </div>

          {/* Slug */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Slug <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={story.slug}
              onChange={(e) => handleChange('slug', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm text-gray-900"
              placeholder="story-url-slug"
            />
            <p className="text-xs text-gray-500 mt-1">
              URL: /news/{story.slug || 'your-slug-here'}
            </p>
          </div>

          {/* Preview Hook */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Preview Hook (2-3 sentences) <span className="text-red-500">*</span>
            </label>
            <textarea
              value={story.preview_hook}
              onChange={(e) => handleChange('preview_hook', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              rows={3}
              placeholder="Write a compelling preview that appears in the feed..."
            />
            <p className="text-xs text-gray-500 mt-1">
              {story.preview_hook.length} characters
            </p>
          </div>

          {/* Body */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Article Body <span className="text-red-500">*</span>
            </label>
            <textarea
              value={story.body}
              onChange={(e) => handleChange('body', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm text-gray-900"
              rows={15}
              placeholder="Write the full article body... (Use double line breaks for paragraphs)"
            />
          </div>

          {/* Category & Region */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={story.category}
                onChange={(e) => handleChange('category', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              >
                <option value="litigation">Litigation</option>
                <option value="law">Law</option>
                <option value="accident">Accident</option>
                <option value="data">Data</option>
                <option value="policy">Policy</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Region
              </label>
              <input
                type="text"
                value={story.region}
                onChange={(e) => handleChange('region', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                placeholder="GA, ATL, or specific ZIP"
              />
            </div>
          </div>

          {/* Video */}
          <div className="mb-6 border-t border-gray-200 pt-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Video (Optional)</h3>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Video Type
              </label>
              <select
                value={story.video_type || ''}
                onChange={(e) => handleChange('video_type', e.target.value || null)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              >
                <option value="">No video</option>
                <option value="youtube_embed">YouTube</option>
                <option value="x_embed">X/Twitter</option>
                <option value="own_hosted">Hosted Video (Vimeo, Cloudflare, etc.)</option>
              </select>
            </div>

            {story.video_type && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Video URL
                  </label>
                  <input
                    type="url"
                    value={story.video_url}
                    onChange={(e) => handleChange('video_url', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                    placeholder="https://youtube.com/watch?v=..."
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Video Thumbnail URL
                  </label>
                  <input
                    type="url"
                    value={story.video_thumbnail}
                    onChange={(e) => handleChange('video_thumbnail', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                    placeholder="https://example.com/thumbnail.jpg"
                  />
                </div>
              </>
            )}
          </div>

          {/* Source Attribution */}
          <div className="mb-6 border-t border-gray-200 pt-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Source Attribution</h3>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Source Name
                </label>
                <input
                  type="text"
                  value={story.source_name}
                  onChange={(e) => handleChange('source_name', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  placeholder="WSB-TV Atlanta"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Source URL
                </label>
                <input
                  type="url"
                  value={story.source_url}
                  onChange={(e) => handleChange('source_url', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>

          {/* SEO */}
          <div className="mb-6 border-t border-gray-200 pt-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">SEO & Social (Optional)</h3>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Meta Title (defaults to story title)
              </label>
              <input
                type="text"
                value={story.meta_title}
                onChange={(e) => handleChange('meta_title', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                placeholder="SEO-optimized title"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Meta Description (defaults to preview hook)
              </label>
              <textarea
                value={story.meta_description}
                onChange={(e) => handleChange('meta_description', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                rows={2}
                placeholder="SEO meta description"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                OpenGraph Image URL
              </label>
              <input
                type="url"
                value={story.og_image}
                onChange={(e) => handleChange('og_image', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                placeholder="https://example.com/og-image.jpg"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewsroomEditorPage;
