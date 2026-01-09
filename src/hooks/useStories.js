// src/hooks/useStories.js
// React Query hooks for story data fetching with caching

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { measureQuery } from '../lib/performance';

/**
 * Fetch all stories for dashboard with optional filtering
 */
export const useStories = (filter = 'all', page = 0, limit = 50) => {
  return useQuery({
    queryKey: ['stories', filter, page],
    queryFn: async () => {
      return measureQuery('fetch_stories', async () => {
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

        // Apply pagination if needed
        if (limit > 0) {
          query = query.range(page * limit, (page + 1) * limit - 1);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data || [];
      });
    }
  });
};

/**
 * Fetch single story by ID
 */
export const useStory = (storyId) => {
  return useQuery({
    queryKey: ['story', storyId],
    queryFn: async () => {
      return measureQuery('fetch_story', async () => {
        const { data, error } = await supabase
          .from('stories')
          .select('*')
          .eq('id', storyId)
          .single();

        if (error) throw error;
        return data;
      });
    },
    enabled: !!storyId
  });
};

/**
 * Fetch published stories for newsroom
 */
export const usePublishedStories = (category = 'all', page = 0, limit = 10) => {
  return useQuery({
    queryKey: ['published_stories', category, page],
    queryFn: async () => {
      return measureQuery('fetch_published_stories', async () => {
        let query = supabase
          .from('stories_with_authors')
          .select('*')
          .eq('status', 'published')
          .order('is_featured', { ascending: false })
          .order('published_at', { ascending: false })
          .range(page * limit, (page + 1) * limit - 1);

        if (category !== 'all') {
          query = query.eq('category', category);
        }

        const { data, error } = await query;
        if (error) throw error;

        return {
          stories: data || [],
          hasMore: data && data.length === limit
        };
      });
    }
  });
};

/**
 * Fetch story stats for dashboard
 */
export const useStoryStats = () => {
  return useQuery({
    queryKey: ['story_stats'],
    queryFn: async () => {
      return measureQuery('fetch_story_stats', async () => {
        const { data, error } = await supabase
          .from('stories')
          .select('status');

        if (error) throw error;

        const stories = data || [];
        const totalNonArchived = stories.filter(s => s.status !== 'archived').length;

        return {
          total: totalNonArchived,
          published: stories.filter(s => s.status === 'published').length,
          in_review: stories.filter(s => s.status === 'in_review').length,
          draft: stories.filter(s => s.status === 'draft').length,
          archived: stories.filter(s => s.status === 'archived').length
        };
      });
    }
  });
};

/**
 * Update story mutation
 */
export const useUpdateStory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ storyId, updates }) => {
      return measureQuery('update_story', async () => {
        const { data, error } = await supabase
          .from('stories')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', storyId)
          .select()
          .single();

        if (error) throw error;
        return data;
      });
    },
    onSuccess: (data) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['stories'] });
      queryClient.invalidateQueries({ queryKey: ['story', data.id] });
      queryClient.invalidateQueries({ queryKey: ['story_stats'] });
    }
  });
};

/**
 * Create story mutation
 */
export const useCreateStory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (storyData) => {
      return measureQuery('create_story', async () => {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          throw new Error('You must be logged in to create stories');
        }

        const { data, error } = await supabase
          .from('stories')
          .insert([{ ...storyData, author_id: user.id }])
          .select()
          .single();

        if (error) throw error;
        return data;
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories'] });
      queryClient.invalidateQueries({ queryKey: ['story_stats'] });
    }
  });
};

/**
 * Delete story mutation
 */
export const useDeleteStory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (storyId) => {
      return measureQuery('delete_story', async () => {
        const { error } = await supabase
          .from('stories')
          .delete()
          .eq('id', storyId);

        if (error) throw error;
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories'] });
      queryClient.invalidateQueries({ queryKey: ['story_stats'] });
    }
  });
};
