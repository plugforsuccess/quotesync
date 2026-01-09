import { useEffect, useRef, useState, useCallback } from 'react';
import { saveDraftLocally, getDraftLocally, deleteDraftLocally } from '../utils/draftStorage';
import { supabase } from '../lib/supabase';

/**
 * Two-Layer Draft Autosave Hook
 * Implements both local (IndexedDB) and server (Supabase) draft persistence
 *
 * @param {object} storyData - Current story form data
 * @param {string|null} storyId - Story ID (null for new stories)
 * @param {string} authorId - Current user ID
 * @param {boolean} enabled - Whether autosave is enabled
 * @returns {object} Autosave state and control functions
 */
export function useDraftAutosave(storyData, storyId, authorId, enabled = true) {
  // Save status tracking
  const [localSaveStatus, setLocalSaveStatus] = useState('idle'); // idle | saving | saved | error
  const [serverSaveStatus, setServerSaveStatus] = useState('idle'); // idle | saving | saved | error
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [serverDraftId, setServerDraftId] = useState(null);
  const [isDirty, setIsDirty] = useState(false);

  // Refs for debouncing
  const localSaveTimeoutRef = useRef(null);
  const serverSaveTimeoutRef = useRef(null);
  const previousDataRef = useRef(null);
  const isOnlineRef = useRef(navigator.onLine);

  // Constants
  const LOCAL_DEBOUNCE_MS = 1000; // 1 second
  const SERVER_DEBOUNCE_MS = 5000; // 5 seconds

  /**
   * Save draft locally to IndexedDB
   */
  const saveLocalDraft = useCallback(async () => {
    if (!enabled || !authorId) return;

    try {
      setLocalSaveStatus('saving');

      await saveDraftLocally(storyId, storyData, authorId);

      setLocalSaveStatus('saved');
      console.log('Local draft saved successfully');
    } catch (error) {
      console.error('Local draft save failed:', error);
      setLocalSaveStatus('error');
    }
  }, [storyData, storyId, authorId, enabled]);

  /**
   * Save draft to Supabase server
   */
  const saveServerDraft = useCallback(async () => {
    if (!enabled || !authorId || !isOnlineRef.current) {
      console.log('Server save skipped (offline or disabled)');
      return;
    }

    try {
      setServerSaveStatus('saving');

      // Prepare draft data
      const draftData = {
        author_id: authorId,
        title: storyData.title || null,
        slug: storyData.slug || null,
        preview_hook: storyData.preview_hook || null,
        body: storyData.body || null,
        category: storyData.category || null,
        region: storyData.region || null,
        tags: storyData.tags || null,
        video_type: storyData.video_type || null,
        video_url: storyData.video_url || null,
        video_thumbnail: storyData.video_thumbnail || null,
        source_name: storyData.source_name || null,
        source_url: storyData.source_url || null,
        meta_title: storyData.meta_title || null,
        meta_description: storyData.meta_description || null,
        og_image: storyData.og_image || null,
        story_id: storyId || null,
        status: 'draft',
        updated_at: new Date().toISOString(),
      };

      let result;

      if (serverDraftId) {
        // Update existing draft
        const { data, error } = await supabase
          .from('story_drafts')
          .update(draftData)
          .eq('id', serverDraftId)
          .select()
          .single();

        if (error) throw error;
        result = data;
      } else {
        // Check if draft already exists for this story/author
        const { data: existingDrafts, error: searchError } = await supabase
          .from('story_drafts')
          .select('id')
          .eq('author_id', authorId)
          .eq('story_id', storyId || null)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (searchError) throw searchError;

        if (existingDrafts && existingDrafts.length > 0) {
          // Update existing draft
          const { data, error } = await supabase
            .from('story_drafts')
            .update(draftData)
            .eq('id', existingDrafts[0].id)
            .select()
            .single();

          if (error) throw error;
          result = data;
          setServerDraftId(result.id);
        } else {
          // Create new draft
          const { data, error } = await supabase
            .from('story_drafts')
            .insert([draftData])
            .select()
            .single();

          if (error) throw error;
          result = data;
          setServerDraftId(result.id);
        }
      }

      setServerSaveStatus('saved');
      setLastSavedAt(new Date());
      console.log('Server draft saved successfully:', result.id);
    } catch (error) {
      console.error('Server draft save failed:', error);
      setServerSaveStatus('error');

      // Will retry on next change or when back online
    }
  }, [storyData, storyId, authorId, enabled, serverDraftId]);

  /**
   * Debounced local save (1 second)
   */
  const debouncedLocalSave = useCallback(() => {
    if (localSaveTimeoutRef.current) {
      clearTimeout(localSaveTimeoutRef.current);
    }

    localSaveTimeoutRef.current = setTimeout(() => {
      saveLocalDraft();
    }, LOCAL_DEBOUNCE_MS);
  }, [saveLocalDraft]);

  /**
   * Debounced server save (5 seconds)
   */
  const debouncedServerSave = useCallback(() => {
    if (serverSaveTimeoutRef.current) {
      clearTimeout(serverSaveTimeoutRef.current);
    }

    serverSaveTimeoutRef.current = setTimeout(() => {
      saveServerDraft();
    }, SERVER_DEBOUNCE_MS);
  }, [saveServerDraft]);

  /**
   * Immediate save (for critical events like visibility change)
   */
  const saveImmediately = useCallback(async () => {
    // Cancel any pending debounced saves
    if (localSaveTimeoutRef.current) {
      clearTimeout(localSaveTimeoutRef.current);
    }
    if (serverSaveTimeoutRef.current) {
      clearTimeout(serverSaveTimeoutRef.current);
    }

    // Save both layers immediately
    await Promise.all([
      saveLocalDraft(),
      saveServerDraft(),
    ]);
  }, [saveLocalDraft, saveServerDraft]);

  /**
   * Discard draft (both local and server)
   */
  const discardDraft = useCallback(async () => {
    try {
      // Delete local draft
      await deleteDraftLocally(storyId);

      // Delete server draft
      if (serverDraftId) {
        await supabase
          .from('story_drafts')
          .delete()
          .eq('id', serverDraftId);
      }

      setLocalSaveStatus('idle');
      setServerSaveStatus('idle');
      setLastSavedAt(null);
      setServerDraftId(null);
      setIsDirty(false);

      console.log('Draft discarded successfully');
    } catch (error) {
      console.error('Error discarding draft:', error);
    }
  }, [storyId, serverDraftId]);

  /**
   * Load existing draft from local or server
   */
  const loadDraft = useCallback(async () => {
    try {
      // Try local first
      const localDraft = await getDraftLocally(storyId);

      // Try server
      const { data: serverDraft, error } = await supabase
        .from('story_drafts')
        .select('*')
        .eq('author_id', authorId)
        .eq('story_id', storyId || null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading server draft:', error);
      }

      // Return the most recent draft
      if (localDraft && serverDraft) {
        const localTime = new Date(localDraft.updatedAt).getTime();
        const serverTime = new Date(serverDraft.updated_at).getTime();

        if (localTime > serverTime) {
          return { source: 'local', draft: localDraft };
        } else {
          setServerDraftId(serverDraft.id);
          return { source: 'server', draft: serverDraft };
        }
      } else if (localDraft) {
        return { source: 'local', draft: localDraft };
      } else if (serverDraft) {
        setServerDraftId(serverDraft.id);
        return { source: 'server', draft: serverDraft };
      }

      return null;
    } catch (error) {
      console.error('Error loading draft:', error);
      return null;
    }
  }, [storyId, authorId]);

  /**
   * Effect: Detect changes and trigger autosave
   */
  useEffect(() => {
    if (!enabled || !authorId) return;

    // Check if data has actually changed
    const currentData = JSON.stringify(storyData);
    const previousData = previousDataRef.current;

    if (currentData === previousData) {
      return; // No changes
    }

    // Data has changed
    previousDataRef.current = currentData;
    setIsDirty(true);

    // Trigger debounced saves
    debouncedLocalSave();
    debouncedServerSave();
  }, [storyData, enabled, authorId, debouncedLocalSave, debouncedServerSave]);

  /**
   * Effect: Handle visibility change (tab switch, app background)
   */
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        console.log('Page hidden, saving immediately...');
        saveImmediately();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, saveImmediately]);

  /**
   * Effect: Handle pagehide (mobile navigation)
   */
  useEffect(() => {
    if (!enabled) return;

    const handlePageHide = () => {
      console.log('Page hiding, saving immediately...');
      // Use synchronous navigator.sendBeacon if available for guaranteed send
      saveImmediately();
    };

    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [enabled, saveImmediately]);

  /**
   * Effect: Handle online/offline status
   */
  useEffect(() => {
    const handleOnline = () => {
      console.log('Back online, retrying server save...');
      isOnlineRef.current = true;
      saveServerDraft(); // Retry immediately
    };

    const handleOffline = () => {
      console.log('Gone offline, server saves will be paused');
      isOnlineRef.current = false;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [saveServerDraft]);

  /**
   * Effect: Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      // Clear any pending timeouts
      if (localSaveTimeoutRef.current) {
        clearTimeout(localSaveTimeoutRef.current);
      }
      if (serverSaveTimeoutRef.current) {
        clearTimeout(serverSaveTimeoutRef.current);
      }
    };
  }, []);

  // Return autosave state and controls
  return {
    // Status
    localSaveStatus,
    serverSaveStatus,
    lastSavedAt,
    isDirty,
    isOnline: isOnlineRef.current,

    // Computed status
    isSaving: localSaveStatus === 'saving' || serverSaveStatus === 'saving',
    hasSaved: localSaveStatus === 'saved' || serverSaveStatus === 'saved',
    hasError: localSaveStatus === 'error' || serverSaveStatus === 'error',

    // Controls
    saveImmediately,
    discardDraft,
    loadDraft,

    // Internal state
    serverDraftId,
  };
}

export default useDraftAutosave;
