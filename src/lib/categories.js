// src/lib/categories.js
// Centralized category and tag configuration for the newsroom CMS
// This is the single source of truth for all category-related data

/**
 * Story Categories
 * Stored as enum/reference - editable by updating this file without schema changes
 *
 * Structure:
 * - slug: Database value (URL-safe, lowercase, hyphenated)
 * - label: Display name for UI
 * - description: Editorial guidance for writers
 * - color: Tailwind CSS classes for category chip styling
 * - contextMessage: "Why This Matters" section content for StoryModal
 */
export const STORY_CATEGORIES = [
  {
    slug: 'policy-regulation',
    label: 'Policy & Regulation',
    description: 'Insurance policy updates, regulatory changes, and government oversight',
    color: 'bg-success-100 text-success-800 border border-success-200',
    contextMessage: 'Policy and regulatory changes can create opportunities to save money or improve your protection.'
  },
  {
    slug: 'litigation-legal',
    label: 'Litigation & Legal',
    description: 'Lawsuits, court decisions, settlements, and legal precedents',
    color: 'bg-[#fee2e2] text-[#b91c1c] border border-[#fecaca]',
    contextMessage: 'Legal changes can directly impact your rates, policy terms, and rights as a driver.'
  },
  {
    slug: 'accidents-claims',
    label: 'Accidents & Claims',
    description: 'Accident trends, claims data, safety statistics, and incident reports',
    color: 'bg-[#fed7aa] text-[#c2410c] border border-[#fdba74]',
    contextMessage: 'Accident trends in your area can affect insurance premiums and coverage needs.'
  },
  {
    slug: 'insurance-markets',
    label: 'Insurance Markets',
    description: 'Market trends, rate changes, carrier financials, and industry movements',
    color: 'bg-primary-100 text-primary-800 border border-primary-200',
    contextMessage: 'Market movements can signal upcoming rate changes and new coverage opportunities.'
  },
  {
    slug: 'data-research',
    label: 'Data & Research',
    description: 'Data-driven insights, studies, statistics, and analytical reports',
    color: 'bg-[#e9d5ff] text-[#6b21a8] border border-[#d8b4fe]',
    contextMessage: 'Data-driven insights reveal how insurance markets are shifting in real-time.'
  },
  {
    slug: 'consumer-guidance',
    label: 'Consumer Guidance',
    description: 'Tips, advice, how-tos, and educational content for policyholders',
    color: 'bg-[#d1fae5] text-[#065f46] border border-[#a7f3d0]',
    contextMessage: 'Practical guidance helps you make smarter decisions about your coverage.'
  },
  {
    slug: 'industry-carriers',
    label: 'Industry & Carriers',
    description: 'Insurance company news, mergers, executive moves, and industry updates',
    color: 'bg-[#dbeafe] text-[#1e40af] border border-[#bfdbfe]',
    contextMessage: 'Understanding carrier changes helps you evaluate the stability of your insurance provider.'
  },
  {
    slug: 'weather-catastrophe',
    label: 'Weather & Catastrophe',
    description: 'Storm damage, natural disasters, climate impact, and catastrophe claims',
    color: 'bg-[#fef3c7] text-[#92400e] border border-[#fcd34d]',
    contextMessage: 'Weather events and catastrophes can trigger rate changes and affect claim timelines.'
  },
  {
    slug: 'technology-ai',
    label: 'Technology & AI',
    description: 'Insurtech, AI in insurance, telematics, digital tools, and innovation',
    color: 'bg-[#e0e7ff] text-[#3730a3] border border-[#c7d2fe]',
    contextMessage: 'Technology innovations are reshaping how insurance is priced, sold, and managed.'
  }
];

/**
 * Legacy category mapping for database migration
 * Maps old category slugs to new category slugs
 */
export const LEGACY_CATEGORY_MAP = {
  'policy': 'policy-regulation',
  'law': 'litigation-legal',
  'litigation': 'litigation-legal',
  'accident': 'accidents-claims',
  'data': 'data-research'
};

/**
 * Get category by slug
 * @param {string} slug - Category slug
 * @returns {Object|undefined} Category object or undefined
 */
export const getCategoryBySlug = (slug) => {
  // First check if it's a legacy category
  const mappedSlug = LEGACY_CATEGORY_MAP[slug] || slug;
  return STORY_CATEGORIES.find(cat => cat.slug === mappedSlug);
};

/**
 * Get category label for display
 * @param {string} slug - Category slug
 * @returns {string} Display label
 */
export const getCategoryLabel = (slug) => {
  const category = getCategoryBySlug(slug);
  return category?.label || slug;
};

/**
 * Get category color classes
 * @param {string} slug - Category slug
 * @returns {string} Tailwind CSS classes
 */
export const getCategoryColor = (slug) => {
  const category = getCategoryBySlug(slug);
  return category?.color || 'bg-gray-100 text-gray-700 border border-gray-200';
};

/**
 * Get category context message for "Why This Matters" section
 * @param {string} slug - Category slug
 * @returns {string} Context message
 */
export const getCategoryContextMessage = (slug) => {
  const category = getCategoryBySlug(slug);
  return category?.contextMessage || '';
};

/**
 * Get all category slugs for database constraints
 * @returns {string[]} Array of category slugs
 */
export const getAllCategorySlugs = () => {
  return STORY_CATEGORIES.map(cat => cat.slug);
};

/**
 * Get categories for dropdown/select components
 * @param {boolean} includeAll - Whether to include "All" option
 * @returns {Array} Array of { value, label } objects
 */
export const getCategoryOptions = (includeAll = false) => {
  const options = STORY_CATEGORIES.map(cat => ({
    value: cat.slug,
    label: cat.label
  }));

  if (includeAll) {
    return [{ value: 'all', label: 'All Stories' }, ...options];
  }

  return options;
};

/**
 * Default category for new stories
 */
export const DEFAULT_CATEGORY = 'policy-regulation';

/**
 * Predefined Secondary Tags
 * Optional tags that can be added to stories for additional filtering
 * Stored as TEXT[] in the database
 */
export const SECONDARY_TAGS = [
  { slug: 'breaking', label: 'Breaking News', color: 'bg-red-100 text-red-800' },
  { slug: 'exclusive', label: 'Exclusive', color: 'bg-purple-100 text-purple-800' },
  { slug: 'analysis', label: 'Analysis', color: 'bg-blue-100 text-blue-800' },
  { slug: 'opinion', label: 'Opinion', color: 'bg-yellow-100 text-yellow-800' },
  { slug: 'explainer', label: 'Explainer', color: 'bg-green-100 text-green-800' },
  { slug: 'investigation', label: 'Investigation', color: 'bg-orange-100 text-orange-800' },
  { slug: 'press-release', label: 'Press Release', color: 'bg-gray-100 text-gray-800' },
  { slug: 'local', label: 'Local', color: 'bg-teal-100 text-teal-800' },
  { slug: 'national', label: 'National', color: 'bg-indigo-100 text-indigo-800' },
  { slug: 'sponsored', label: 'Sponsored', color: 'bg-pink-100 text-pink-800' }
];

/**
 * Get tag by slug
 * @param {string} slug - Tag slug
 * @returns {Object|undefined} Tag object or undefined
 */
export const getTagBySlug = (slug) => {
  return SECONDARY_TAGS.find(tag => tag.slug === slug);
};

/**
 * Get tag label for display
 * @param {string} slug - Tag slug
 * @returns {string} Display label
 */
export const getTagLabel = (slug) => {
  const tag = getTagBySlug(slug);
  return tag?.label || slug;
};

/**
 * Get tag color classes
 * @param {string} slug - Tag slug
 * @returns {string} Tailwind CSS classes
 */
export const getTagColor = (slug) => {
  const tag = getTagBySlug(slug);
  return tag?.color || 'bg-gray-100 text-gray-800';
};

/**
 * Get tags for multi-select component
 * @returns {Array} Array of { value, label } objects
 */
export const getTagOptions = () => {
  return SECONDARY_TAGS.map(tag => ({
    value: tag.slug,
    label: tag.label
  }));
};
