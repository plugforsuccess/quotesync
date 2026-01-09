// src/pages/NewsroomDashboardPage.jsx
// Admin dashboard for managing stories, approvals, and viewing analytics

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, Edit, Eye, CheckCircle, XCircle, BarChart3, Star, Archive } from 'lucide-react';
import { supabase, getUserRole, hasPermission } from '../lib/supabase';

const NewsroomDashboardPage = () => {
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stories, setStories] = useState([]);
  const [filter, setFilter] = useState('all'); // all, draft, in_review, published, archived
  const [stats, setStats] = useState({
    total: 0,
    published: 0,
    in_review: 0,
    draft: 0,
    archived: 0
  });
  const [actionLoading, setActionLoading] = useState(null); // Track which story action is in progress

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
      await fetchStories();
      setLoading(false);
    };

    checkAuth();
  }, [navigate, filter]);

  // Fetch stories
  const fetchStories = async () => {
    try {
      // Fetch from stories_with_authors view to get author names
      let query = supabase
        .from('stories_with_authors')
        .select('*')
        .order('updated_at', { ascending: false });

      // Apply filter
      if (filter === 'all') {
        // Exclude archived from 'all' view
        query = query.neq('status', 'archived');
      } else {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;

      if (error) throw error;

      setStories(data || []);

      // Calculate stats (including archived)
      const { data: allStories } = await supabase
        .from('stories')
        .select('status');

      if (allStories) {
        const totalNonArchived = allStories.filter(s => s.status !== 'archived').length;
        setStats({
          total: totalNonArchived,
          published: allStories.filter(s => s.status === 'published').length,
          in_review: allStories.filter(s => s.status === 'in_review').length,
          draft: allStories.filter(s => s.status === 'draft').length,
          archived: allStories.filter(s => s.status === 'archived').length
        });
      }
    } catch (error) {
      console.error('Error fetching stories:', error);
      alert('Failed to load stories: ' + error.message);
    }
  };

  // Publish story (admin only)
  const handlePublish = async (storyId) => {
    if (userRole !== 'admin') {
      alert('Only admins can publish stories');
      return;
    }

    try {
      const { error } = await supabase
        .from('stories')
        .update({ status: 'published' })
        .eq('id', storyId);

      if (error) throw error;

      alert('Story published successfully!');
      fetchStories();
    } catch (error) {
      console.error('Error publishing story:', error);
      alert('Failed to publish story');
    }
  };

  // Unpublish story (admin only)
  const handleUnpublish = async (storyId) => {
    if (userRole !== 'admin') {
      alert('Only admins can unpublish stories');
      return;
    }

    try {
      const { error } = await supabase
        .from('stories')
        .update({ status: 'draft' })
        .eq('id', storyId);

      if (error) throw error;

      alert('Story unpublished');
      fetchStories();
    } catch (error) {
      console.error('Error unpublishing story:', error);
      alert('Failed to unpublish story');
    }
  };

  // Toggle featured (admin only)
  const handleToggleFeatured = async (storyId, currentFeatured) => {
    if (userRole !== 'admin') {
      alert('Only admins can feature stories');
      return;
    }

    try {
      const { error } = await supabase
        .from('stories')
        .update({ is_featured: !currentFeatured })
        .eq('id', storyId);

      if (error) throw error;

      fetchStories();
    } catch (error) {
      console.error('Error toggling featured:', error);
      alert('Failed to toggle featured status');
    }
  };

  // Archive story (admin only)
  const handleArchive = async (storyId, title) => {
    if (userRole !== 'admin') {
      alert('Only admins can archive stories');
      return;
    }

    if (!confirm(`Archive "${title}"?\n\nArchived stories are hidden from public view and can be restored later from the Archived tab.`)) {
      return;
    }

    setActionLoading(storyId);

    try {
      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        alert('You must be logged in to archive stories');
        setActionLoading(null);
        return;
      }

      // Call archive_story function
      const { error } = await supabase.rpc('archive_story', {
        story_id_param: storyId,
        archived_by_param: user.id,
      });

      if (error) throw error;

      // Success - refresh list
      await fetchStories();
    } catch (error) {
      console.error('Error archiving story:', error);
      alert('Failed to archive story: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Restore story from archive (admin only)
  const handleRestore = async (storyId, title) => {
    if (userRole !== 'admin') {
      alert('Only admins can restore stories');
      return;
    }

    if (!confirm(`Restore "${title}"?\n\nThis story will return to its previous status.`)) {
      return;
    }

    setActionLoading(storyId);

    try {
      // Call restore_story function
      const { error } = await supabase.rpc('restore_story', {
        story_id_param: storyId,
      });

      if (error) throw error;

      // Success - refresh list
      await fetchStories();
    } catch (error) {
      console.error('Error restoring story:', error);
      alert('Failed to restore story: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Permanently delete story (admin only, requires confirmation)
  const handleHardDelete = async (storyId, title) => {
    if (userRole !== 'admin') {
      alert('Only admins can permanently delete stories');
      return;
    }

    // First confirmation
    if (!confirm(`PERMANENTLY DELETE "${title}"?\n\nThis action CANNOT be undone. The story will be deleted from the database forever.\n\nAre you absolutely sure?`)) {
      return;
    }

    // Second confirmation (double-check)
    if (!confirm(`Final confirmation:\n\nDelete "${title}" permanently?\n\nThis is your last chance to cancel.`)) {
      return;
    }

    setActionLoading(storyId);

    try {
      // Hard delete - directly delete from database
      const { error } = await supabase
        .from('stories')
        .delete()
        .eq('id', storyId);

      if (error) throw error;

      // Success - refresh list
      await fetchStories();
    } catch (error) {
      console.error('Error deleting story:', error);
      alert('Failed to delete story: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Newsroom Dashboard</h1>
              <p className="text-gray-600 text-sm mt-1">
                Role: <span className="font-semibold capitalize">{userRole}</span>
              </p>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                to="/news"
                className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm whitespace-nowrap"
              >
                <Eye className="w-4 h-4" />
                <span className="hidden sm:inline">View Newsroom</span>
                <span className="sm:hidden">View</span>
              </Link>

              {userRole === 'admin' && (
                <Link
                  to="/news/archived"
                  className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm whitespace-nowrap"
                >
                  <Archive className="w-4 h-4" />
                  <span className="hidden sm:inline">Archived</span>
                  <span className="sm:hidden">Archive</span>
                </Link>
              )}

              <Link
                to="/news/editor"
                className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-sm whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Story</span>
                <span className="sm:hidden">New</span>
              </Link>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-sm text-gray-600">Total Stories</div>
            </div>

            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-700">{stats.published}</div>
              <div className="text-sm text-green-600">Published</div>
            </div>

            <div className="bg-yellow-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-yellow-700">{stats.in_review}</div>
              <div className="text-sm text-yellow-600">In Review</div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-700">{stats.draft}</div>
              <div className="text-sm text-gray-600">Drafts</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Stories
            </button>
            <button
              onClick={() => setFilter('draft')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'draft'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Drafts
            </button>
            <button
              onClick={() => setFilter('in_review')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'in_review'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              In Review
            </button>
            <button
              onClick={() => setFilter('published')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'published'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Published
            </button>
            {userRole === 'admin' && (
              <button
                onClick={() => setFilter('archived')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'archived'
                    ? 'bg-orange-600 text-white'
                    : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                }`}
              >
                Archived ({stats.archived})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stories List */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {stories.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <div className="text-6xl mb-4">📝</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No stories found</h2>
            <p className="text-gray-600 mb-6">
              {filter === 'all'
                ? "Get started by creating your first story"
                : `No stories with status "${filter}"`}
            </p>
            <Link
              to="/news/editor"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Story
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {/* Horizontal scroll wrapper for mobile */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Story
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Editor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Updated
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {stories.map((story) => (
                  <tr key={story.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {story.is_featured && (
                          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        )}
                        <div>
                          <div className="font-semibold text-gray-900">{story.title}</div>
                          <div className="text-sm text-gray-500 line-clamp-1">
                            {story.preview_hook}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <div className="font-medium text-gray-900">
                          {story.author_name || story.author_email || 'Unknown'}
                        </div>
                        {story.author_name && story.author_email && (
                          <div className="text-xs text-gray-500">{story.author_email}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 capitalize">
                        {story.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        story.status === 'published' ? 'bg-green-100 text-green-700' :
                        story.status === 'in_review' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {story.status === 'in_review' ? 'in review' : story.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(story.updated_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {story.status === 'archived' ? (
                          // Archived story actions
                          userRole === 'admin' && (
                            <>
                              <button
                                onClick={() => handleRestore(story.id, story.title)}
                                disabled={actionLoading === story.id}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Restore"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleHardDelete(story.id, story.title)}
                                disabled={actionLoading === story.id}
                                className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Permanently Delete"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </>
                          )
                        ) : (
                          // Normal story actions
                          <>
                            <Link
                              to={`/news/editor/${story.id}`}
                              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Edit"
                            >
                              <Edit className="w-4 h-4" />
                            </Link>

                            {/* Preview button - works for all statuses */}
                            {story.status === 'published' ? (
                              <a
                                href={`/news/${story.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="View Published Story"
                              >
                                <Eye className="w-4 h-4" />
                              </a>
                            ) : (
                              <Link
                                to={`/news/preview/${story.id}`}
                                target="_blank"
                                className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="Preview (Draft/In Review)"
                              >
                                <Eye className="w-4 h-4" />
                              </Link>
                            )}

                            {userRole === 'admin' && (
                              <>
                                <button
                                  onClick={() => handleToggleFeatured(story.id, story.is_featured)}
                                  className={`p-2 rounded transition-colors ${
                                    story.is_featured
                                      ? 'text-yellow-600 hover:bg-yellow-50'
                                      : 'text-gray-400 hover:text-yellow-600 hover:bg-yellow-50'
                                  }`}
                                  title={story.is_featured ? 'Unfeature' : 'Feature'}
                                >
                                  <Star className={`w-4 h-4 ${story.is_featured ? 'fill-yellow-600' : ''}`} />
                                </button>

                                {story.status !== 'published' ? (
                                  <button
                                    onClick={() => handlePublish(story.id)}
                                    className="p-2 text-green-600 hover:bg-green-50 rounded transition-colors"
                                    title="Publish"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleUnpublish(story.id)}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                                    title="Unpublish"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                )}

                                <button
                                  onClick={() => handleArchive(story.id, story.title)}
                                  disabled={actionLoading === story.id}
                                  className="p-2 text-orange-600 hover:bg-orange-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Archive"
                                >
                                  <Archive className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewsroomDashboardPage;
