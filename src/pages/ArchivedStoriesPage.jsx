import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCcw, Trash2, Archive, AlertCircle } from 'lucide-react';
import { supabase, getUserRole, hasPermission } from '../lib/supabase';
import PageSpinner from '../components/PageSpinner';

const ArchivedStoriesPage = () => {
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [archivedStories, setArchivedStories] = useState([]);
  const [restoring, setRestoring] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // Check authentication and role
  useEffect(() => {
    const checkAuth = async () => {
      const { user, role } = await getUserRole();

      if (!user || !hasPermission(role, 'admin')) {
        alert('You must be logged in as an admin to access this page.');
        navigate('/news/dashboard');
        return;
      }

      setUserRole(role);
      await fetchArchivedStories();
      setLoading(false);
    };

    checkAuth();
  }, [navigate]);

  // Fetch archived stories
  const fetchArchivedStories = async () => {
    try {
      const { data, error } = await supabase
        .from('archived_stories')
        .select('*')
        .order('archived_at', { ascending: false });

      if (error) throw error;

      setArchivedStories(data || []);
    } catch (error) {
      console.error('Error fetching archived stories:', error);
      alert('Failed to load archived stories');
    }
  };

  // Restore story
  const handleRestore = async (storyId, previousStatus, title) => {
    if (!confirm(`Restore "${title}" to ${previousStatus || 'draft'} status?`)) {
      return;
    }

    setRestoring(storyId);

    try {
      // Call the restore_story function
      const { data, error } = await supabase.rpc('restore_story', {
        story_id_param: storyId,
      });

      if (error) throw error;

      alert('Story restored successfully!');
      await fetchArchivedStories(); // Refresh list
    } catch (error) {
      console.error('Error restoring story:', error);
      alert('Failed to restore story: ' + error.message);
    } finally {
      setRestoring(null);
    }
  };

  // Permanently delete story
  const handlePermanentDelete = async (storyId, title, archivedAt) => {
    // Check if story has been archived for at least 7 days
    const archivedDate = new Date(archivedAt);
    const now = new Date();
    const daysSinceArchived = Math.floor((now - archivedDate) / (1000 * 60 * 60 * 24));

    if (daysSinceArchived < 7) {
      alert(`Stories must be archived for at least 7 days before permanent deletion. This story has been archived for ${daysSinceArchived} day(s).`);
      return;
    }

    if (!confirm(`PERMANENTLY DELETE "${title}"?\n\nThis action CANNOT be undone. The story will be deleted from the database forever.`)) {
      return;
    }

    // Double confirmation
    if (!confirm(`Are you absolutely sure? This is your last chance to cancel.`)) {
      return;
    }

    setDeleting(storyId);

    try {
      // Call the permanent delete function with minimum days
      const { data, error } = await supabase.rpc('permanently_delete_archived_story', {
        story_id_param: storyId,
        min_days_archived: 7,
      });

      if (error) throw error;

      alert('Story permanently deleted.');
      await fetchArchivedStories(); // Refresh list
    } catch (error) {
      console.error('Error deleting story:', error);
      alert('Failed to delete story: ' + error.message);
    } finally {
      setDeleting(null);
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Calculate days since archived
  const getDaysSinceArchived = (archivedAt) => {
    const archived = new Date(archivedAt);
    const now = new Date();
    return Math.floor((now - archived) / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return <PageSpinner label="Loading archived stories..." />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigate('/news/dashboard')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>
          </div>

          <div className="flex items-center gap-3">
            <Archive className="w-8 h-8 text-gray-700" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Archived Stories</h1>
              <p className="text-sm text-gray-500 mt-1">
                {archivedStories.length} {archivedStories.length === 1 ? 'story' : 'stories'} archived
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Info Banner */}
        <div className="bg-primary-50 border-l-4 border-primary-400 p-4 mb-6 rounded">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-primary-400 mr-3 flex-shrink-0" />
            <div className="text-sm text-primary-700">
              <p className="font-medium mb-1">About Archived Stories</p>
              <ul className="list-disc list-inside space-y-1 text-primary-600">
                <li>Archived stories are hidden from public view and the normal dashboard</li>
                <li>You can restore stories to their previous status (draft, in_review, or published)</li>
                <li>Stories must be archived for at least 7 days before permanent deletion</li>
                <li>Permanent deletion is irreversible and removes the story from the database</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Stories List */}
        {archivedStories.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Archive className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Archived Stories</h3>
            <p className="text-gray-500">
              Stories that are archived will appear here. They can be restored or permanently deleted.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Story
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Author
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Archived
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Previous Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {archivedStories.map((story) => {
                  const daysSince = getDaysSinceArchived(story.archived_at);
                  const canDelete = daysSince >= 7;

                  return (
                    <tr key={story.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900 truncate max-w-md">
                            {story.title}
                          </span>
                          <span className="text-xs text-gray-500 mt-1">
                            {story.category} • {story.slug}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {story.author_name || 'Unknown'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-900">
                            {formatDate(story.archived_at)}
                          </span>
                          <span className="text-xs text-gray-500 mt-1">
                            by {story.archived_by_name || 'Unknown'}
                          </span>
                          <span className="text-xs text-gray-400 mt-1">
                            {daysSince} day{daysSince !== 1 ? 's' : ''} ago
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          story.previous_status === 'published' ? 'bg-green-100 text-green-800' :
                          story.previous_status === 'in_review' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {story.previous_status || 'draft'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          {/* Restore Button */}
                          <button
                            onClick={() => handleRestore(story.id, story.previous_status, story.title)}
                            disabled={restoring === story.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary-100 text-primary-700 hover:bg-primary-200 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Restore story"
                          >
                            <RotateCcw className="w-4 h-4" />
                            {restoring === story.id ? 'Restoring...' : 'Restore'}
                          </button>

                          {/* Delete Button (only if 7+ days old) */}
                          <button
                            onClick={() => handlePermanentDelete(story.id, story.title, story.archived_at)}
                            disabled={!canDelete || deleting === story.id}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md transition-colors ${
                              canDelete
                                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            } disabled:opacity-50`}
                            title={canDelete ? 'Permanently delete' : `Can delete in ${7 - daysSince} day(s)`}
                          >
                            <Trash2 className="w-4 h-4" />
                            {deleting === story.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ArchivedStoriesPage;
