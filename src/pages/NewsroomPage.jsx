// src/pages/NewsroomPage.jsx
// Main newsroom feed with infinite scroll and story filtering

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import StoryCard from '../components/newsroom/StoryCard';
import StoryModal from '../components/newsroom/StoryModal';
import { supabase } from '../lib/supabase';
import { trackFeedView } from '../lib/newsroomAnalytics';
import { Filter, TrendingUp } from 'lucide-react';

const STORIES_PER_PAGE = 10;

const NewsroomPage = () => {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);
  const [selectedStory, setSelectedStory] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');

  const observerRef = useRef(null);
  const loadMoreRef = useRef(null);
  const navigate = useNavigate();

  // Track feed view on mount
  useEffect(() => {
    trackFeedView();
  }, []);

  // Fetch stories from Supabase
  const fetchStories = useCallback(async (pageNum, category = 'all') => {
    try {
      setLoading(true);

      let query = supabase
        .from('stories')
        .select('*')
        .eq('status', 'published')
        .order('is_featured', { ascending: false })
        .order('published_at', { ascending: false })
        .range(pageNum * STORIES_PER_PAGE, (pageNum + 1) * STORIES_PER_PAGE - 1);

      // Apply category filter if selected
      if (category !== 'all') {
        query = query.eq('category', category);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (pageNum === 0) {
        setStories(data || []);
      } else {
        setStories((prev) => [...prev, ...(data || [])]);
      }

      setHasMore(data && data.length === STORIES_PER_PAGE);
    } catch (error) {
      console.error('Error fetching stories:', error);
      // Show fallback UI or error message
      setStories([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchStories(0, selectedCategory);
  }, [fetchStories, selectedCategory]);

  // Infinite scroll observer
  useEffect(() => {
    if (loading || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setPage((prev) => {
            const nextPage = prev + 1;
            fetchStories(nextPage, selectedCategory);
            return nextPage;
          });
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [loading, hasMore, fetchStories, selectedCategory]);

  // Track which story is currently in view for video playback
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = parseInt(entry.target.dataset.index, 10);
            setActiveStoryIndex(index);
          }
        });
      },
      { threshold: 0.6 }
    );

    const storyElements = document.querySelectorAll('[data-story-index]');
    storyElements.forEach((el) => observer.observe(el));

    return () => {
      storyElements.forEach((el) => observer.unobserve(el));
    };
  }, [stories]);

  // Handle "Read more" click
  const handleReadMore = (story) => {
    setSelectedStory(story);
    setModalOpen(true);
  };

  // Handle category filter
  const handleCategoryChange = (category) => {
    setSelectedCategory(category);
    setPage(0);
    setStories([]);
    setHasMore(true);
  };

  const categories = [
    { value: 'all', label: 'All Stories' },
    { value: 'litigation', label: 'Litigation' },
    { value: 'law', label: 'Law' },
    { value: 'accident', label: 'Accident' },
    { value: 'data', label: 'Data' },
    { value: 'policy', label: 'Policy' }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Header with subtle brand gradient */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-blue-50/80 via-teal-50/60 to-blue-50/80 border-b border-gray-200 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              {/* Live updates indicator */}
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <div className="relative flex items-center justify-center">
                    <span className="absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-75 animate-ping"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </div>
                  <span className="text-xs font-semibold text-emerald-700 tracking-wide uppercase">Live updates</span>
                </div>
              </div>

              {/* Main headline - stronger hierarchy */}
              <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight leading-tight mb-1.5">
                Insurance Newsroom
              </h1>

              {/* Tighter editorial subhead */}
              <p className="text-sm text-gray-700 font-medium leading-snug">
                Real-time coverage intelligence for Georgia drivers
              </p>
            </div>
          </div>

          {/* Category Filter - Editorial sections style */}
          <div className="flex items-center gap-1 overflow-x-auto pb-2 pt-2 border-t border-gray-200/50">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide mr-2 flex-shrink-0">Sections</span>
            {categories.map((cat) => (
              <button
                key={cat.value}
                onClick={() => handleCategoryChange(cat.value)}
                className={`px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition-all border-b-2 ${
                  selectedCategory === cat.value
                    ? 'text-blue-700 border-blue-600'
                    : 'text-gray-600 border-transparent hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Story Feed */}
      <div className="max-w-4xl mx-auto">
        {loading && page === 0 ? (
          // Initial loading state
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-600">Loading stories...</p>
            </div>
          </div>
        ) : stories.length === 0 ? (
          // Empty state
          <div className="flex items-center justify-center py-20">
            <div className="text-center max-w-md">
              <div className="text-6xl mb-4">📰</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">No Stories Yet</h2>
              <p className="text-gray-600">
                Check back soon for the latest insurance news and updates for Georgia drivers.
              </p>
            </div>
          </div>
        ) : (
          // Story cards
          <>
            {stories.map((story, index) => (
              <div key={story.id} data-story-index={index}>
                <StoryCard
                  story={story}
                  isActive={index === activeStoryIndex}
                  onReadMore={handleReadMore}
                />
              </div>
            ))}

            {/* Load more trigger */}
            {hasMore && (
              <div ref={loadMoreRef} className="py-8 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-gray-500 text-sm mt-2">Loading more stories...</p>
              </div>
            )}

            {/* End of feed */}
            {!hasMore && stories.length > 0 && (
              <div className="py-8 text-center border-t border-gray-200">
                <p className="text-gray-500">You've reached the end of the feed</p>
                <button
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  className="mt-3 text-blue-600 hover:text-blue-700 font-medium text-sm"
                >
                  Back to top ↑
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Story Modal */}
      <StoryModal
        story={selectedStory}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
};

export default NewsroomPage;
