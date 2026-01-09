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

  // Fetch existing story with timeout
  const fetchStory = async (storyId, retries = 2) => {
    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), 8000)
      );

      const queryPromise = supabase
        .from('stories')
        .select('*')
        .eq('id', storyId)
        .single();

      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

      if (error) throw error;

      if (data) {
        setStory({
          ...data,
          tags: data.tags || []
        });
      }
    } catch (error) {
      console.error('Error fetching story:', error);

      // Retry with delay
      if (retries > 0) {
        console.log(`Retrying... (${retries} retries left)`);
        setTimeout(() => fetchStory(storyId, retries - 1), 2000);
        return;
      }

      alert('Failed to load story after multiple attempts. Please check your connection.');
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

    // Auto-populate meta title from title if meta title is empty
    if (field === 'title' && !story.meta_title) {
      setStory((prev) => ({
        ...prev,
        meta_title: value.slice(0, 60)
      }));
    }

    // Auto-populate meta description from preview hook if meta description is empty
    if (field === 'preview_hook' && !story.meta_description) {
      setStory((prev) => ({
        ...prev,
        meta_description: value.slice(0, 160)
      }));
    }
  };

  // Save draft
  const handleSave = async (statusOverride = null) => {
    if (!story.title || !story.slug || !story.preview_hook || !story.body || !story.meta_title || !story.meta_description) {
      alert('Please fill in all required fields: Title, Slug, Preview Hook, Body, Meta Title, and Meta Description');
      setSaving(false);
      return;
    }

    setSaving(true);

    try {
      // Add timeout to prevent hanging
      const saveWithTimeout = async () => {
        const storyData = {
          ...story,
          status: statusOverride || story.status,
          updated_at: new Date().toISOString()
        };

        // Clean up video fields - if video_type is set but no URL, clear both
        // This ensures database constraint is satisfied
        if (storyData.video_type && !storyData.video_url) {
          storyData.video_type = null;
          storyData.video_url = null;
          storyData.video_thumbnail = null;
        }
        // If video_url is set but no type, clear all
        if (storyData.video_url && !storyData.video_type) {
          storyData.video_type = null;
          storyData.video_url = null;
          storyData.video_thumbnail = null;
        }

        console.log('Attempting to save story:', { id, status: storyData.status });

        if (id) {
          // Update existing
          console.log('Updating existing story:', id);
          const { error } = await supabase
            .from('stories')
            .update(storyData)
            .eq('id', id);

          if (error) {
            console.error('Update error:', error);
            throw error;
          }

          // Refetch the story to ensure UI is in sync with database
          await fetchStory(id);
          alert('Story saved successfully!');
        } else {
          // Create new
          console.log('Creating new story...');

          // Get authenticated user
          const { data: { user }, error: authError } = await supabase.auth.getUser();

          if (authError) {
            console.error('Auth error:', authError);
            throw new Error('Authentication failed. Please log in again.');
          }

          if (!user) {
            console.error('No user found');
            throw new Error('You must be logged in to create stories. Please log in.');
          }

          console.log('User authenticated:', user.id);
          storyData.author_id = user.id;

          console.log('Inserting story with data:', JSON.stringify(storyData, null, 2));

          const { data, error } = await supabase
            .from('stories')
            .insert([storyData])
            .select()
            .single();

          if (error) {
            console.error('Insert error:', error);
            console.error('Error details:', JSON.stringify(error, null, 2));
            throw error;
          }

          console.log('Story created successfully:', data);
          alert('Story created successfully!');
          navigate(`/news/editor/${data.id}`);
        }
      };

      // Set timeout of 15 seconds for save operation
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Save operation timed out. Please check your connection and try again.')), 15000)
      );

      await Promise.race([saveWithTimeout(), timeoutPromise]);

    } catch (error) {
      console.error('Error saving story:', error);
      console.error('Error stack:', error.stack);

      // More helpful error messages
      let errorMessage = 'Failed to save story: ';

      if (error.message.includes('timeout')) {
        errorMessage += 'Request timed out. Please check your internet connection.';
      } else if (error.message.includes('auth')) {
        errorMessage += 'Authentication issue. Please refresh the page and log in again.';
      } else if (error.code === 'PGRST301') {
        errorMessage += 'Database permission denied. Please ensure you have editor/admin role.';
      } else if (error.code === '42501') {
        errorMessage += 'Permission denied. Please check your user role in the database.';
      } else {
        errorMessage += error.message;
      }

      alert(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  // Submit for review
  const handleSubmitForReview = async () => {
    await handleSave('in_review');
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

  // Check if content is immutable (in_review status and user is not admin)
  const isContentImmutable = story.status === 'in_review' && userRole !== 'admin';

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

              {!isContentImmutable && (
                <>
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
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              story.status === 'published' ? 'bg-green-100 text-green-700' :
              story.status === 'in_review' ? 'bg-yellow-100 text-yellow-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {story.status === 'in_review' ? 'IN REVIEW' : story.status.toUpperCase()}
            </span>
            {id && <span>• Story ID: {id}</span>}
          </div>
        </div>
      </div>

      {/* Editor Form */}
      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-4 sm:py-8">
        {isContentImmutable && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4 rounded">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  <strong>Story is under review.</strong> Content cannot be edited while in review. An admin will either publish or return it to draft status.
                </p>
              </div>
            </div>
          </div>
        )}
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
              disabled={isContentImmutable}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg font-semibold text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
              disabled={isContentImmutable}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
              disabled={isContentImmutable}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
              disabled={isContentImmutable}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
              <select
                value={story.region}
                onChange={(e) => handleChange('region', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              >
                <option value="">Select region...</option>
                <option value="Georgia">Georgia (Statewide)</option>
                <option value="Atlanta">Atlanta</option>
                <option value="Savannah">Savannah</option>
                <option value="Augusta">Augusta</option>
                <option value="Columbus">Columbus</option>
                <option value="Macon">Macon</option>
                <option value="Athens">Athens</option>
                <option value="Albany">Albany</option>
                <option value="Valdosta">Valdosta</option>
              </select>
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
            <h3 className="text-lg font-bold text-gray-900 mb-4">SEO & Social</h3>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Meta Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={story.meta_title}
                onChange={(e) => handleChange('meta_title', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                placeholder="Auto-populated from title (edit as needed)"
                maxLength={60}
              />
              <p className="text-xs text-gray-500 mt-1">
                {story.meta_title.length}/60 characters - Appears in Google search results
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Meta Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={story.meta_description}
                onChange={(e) => handleChange('meta_description', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                rows={3}
                placeholder="Auto-populated from preview hook (edit as needed)"
                maxLength={160}
              />
              <p className="text-xs text-gray-500 mt-1">
                {story.meta_description.length}/160 characters - Appears in Google search results
              </p>
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
