// src/pages/NewsroomPage.jsx
// Main newsroom feed with infinite scroll and story filtering

import { T } from '../components/SiteCopy';
import { useState, useEffect, useRef, useCallback } from 'react';
import StoryCard from '../components/newsroom/StoryCard';
import StoryModal from '../components/newsroom/StoryModal';
import { supabase } from '../lib/supabase';
import { trackFeedView } from '../lib/newsroomAnalytics';
import { Filter, TrendingUp } from 'lucide-react';
import { getCategoryOptions } from '../lib/categories';

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

  const loadMoreRef = useRef(null);

  // Track feed view on mount
  useEffect(() => {
    trackFeedView();
  }, []);

  // Fetch stories from Supabase with retry logic
  const fetchStories = useCallback(async (pageNum, category = 'all', retries = 3) => {
    try {
      setLoading(true);

      let query = supabase
        .from('stories_with_authors')
        .select('*')
        .eq('status', 'published')
        .order('is_featured', { ascending: false })
        .order('published_at', { ascending: false })
        .range(pageNum * STORIES_PER_PAGE, (pageNum + 1) * STORIES_PER_PAGE - 1);

      // Apply category filter if selected
      if (category !== 'all') {
        query = query.eq('category', category);
      }

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      );

      const { data, error } = await Promise.race([query, timeoutPromise]);

      if (error) throw error;

      if (pageNum === 0) {
        setStories(data || []);
      } else {
        setStories((prev) => [...prev, ...(data || [])]);
      }

      setHasMore(data && data.length === STORIES_PER_PAGE);
    } catch (error) {
      console.error('Error fetching stories:', error);

      // Retry with exponential backoff
      if (retries > 0) {
        const delay = (4 - retries) * 1000; // 1s, 2s, 3s
        console.log(`Retrying in ${delay}ms... (${retries} retries left)`);
        setTimeout(() => fetchStories(pageNum, category, retries - 1), delay);
        return;
      }

      // Show fallback UI or error message after all retries exhausted
      if (pageNum === 0) {
        setStories([]);
      }
      setHasMore(false);
      console.error('Failed to load stories after all retries');
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

  // Get categories from centralized config (with "All Stories" option)
  const categories = getCategoryOptions(true);
  const newest = stories.reduce((d, s) => (s.published_at && (!d || s.published_at > d) ? s.published_at : d), null);
  const updated = newest ? new Date(newest).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <title>Insurance News & Resources | insuredbycam Newsroom</title>
      <meta name="description" content="Plain-language help, real client stories and Georgia insurance news from Cam Wiley Agency, an Allstate agency serving all of Georgia." />
      <meta property="og:type" content="website" />
      <meta property="og:title" content="Newsroom | insuredbycam" />
      <meta property="og:description" content="Help, real stories and Georgia insurance news from Cam Wiley Agency." />
      <meta property="og:url" content="https://insuredbycam.com/news" />
      <link rel="canonical" href="https://insuredbycam.com/news" />
      {/* Header with subtle brand gradient */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-primary-50/80 via-teal-50/60 to-primary-50/80 border-b border-gray-200 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight leading-tight mb-1.5">
                <T k="pages.newsroompage.ca4bba">Newsroom</T>
              </h1>
              <p className="text-sm text-gray-700 font-medium leading-snug">
                <T k="pages.newsroompage.bf44bb">Help, real stories and Georgia news from Cam Wiley Agency</T>
                {updated && <span className="text-gray-500 font-normal"> <T k="pages.newsroompage.c91702">· Updated</T> {updated}</span>}
              </p>
            </div>
          </div>

          {/* Category Filter - Editorial sections style */}
          <div className="flex items-center gap-1 overflow-x-auto pb-2 pt-2 border-t border-gray-200/50 lg:flex-wrap lg:overflow-visible">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide mr-2 flex-shrink-0"><T k="pages.newsroompage.855c3e">Sections</T></span>
            {categories.map((cat) => (
              <button
                key={cat.value}
                onClick={() => handleCategoryChange(cat.value)}
                className={`px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition-all border-b-2 ${
                  selectedCategory === cat.value
                    ? 'text-primary-700 border-primary-600'
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
          // Initial loading state - using primary brand color
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
              <p className="text-gray-600"><T k="pages.newsroompage.6154a5">Loading stories...</T></p>
            </div>
          </div>
        ) : stories.length === 0 ? (
          // Empty state
          <div className="flex items-center justify-center py-20">
            <div className="text-center max-w-md">
              <div className="text-6xl mb-4">📰</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2"><T k="pages.newsroompage.b1c61a">No Stories Yet</T></h2>
              <p className="text-gray-600">
                <T k="pages.newsroompage.47cf04">Check back soon.</T>
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

            {/* Load more trigger - using primary brand color */}
            {hasMore && (
              <div ref={loadMoreRef} className="py-8 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                <p className="text-gray-500 text-sm mt-2"><T k="pages.newsroompage.ca0146">Loading more stories...</T></p>
              </div>
            )}

            {/* End of feed - using primary brand color */}
            {!hasMore && stories.length > 0 && (
              <div className="py-8 text-center border-t border-gray-200">
                <p className="text-gray-500"><T k="pages.newsroompage.b92fa8">You've reached the end of the feed</T></p>
                <button
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  className="mt-3 text-primary-600 hover:text-primary-700 font-medium text-sm"
                >
                  <T k="pages.newsroompage.ab0463">Back to Top ↑</T>
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
