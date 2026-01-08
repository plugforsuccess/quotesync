# InsuredByCam Design System

This document defines the unified design system for the InsuredByCam platform. All pages (Quote funnel, Education, Newsroom) use these shared tokens to create a cohesive institutional brand experience.

---

## Core Philosophy

**"One cohesive institutional brand"**

The design system ensures users never feel like they've left the InsuredByCam ecosystem when navigating between sections. We achieve this through:

1. **Consistent color palette** - Primary blue for authority/trust, secondary teal for modern freshness, accent gold for warmth
2. **Unified typography** - Same font family, standardized heading levels, normalized body text
3. **Shared components** - Buttons, pills, tags, and cards reuse the same design language
4. **Intentional gradients** - Background gradients use the same primary → secondary → slate philosophy

---

## Color System

### Primary Color - Deep Blue
**Use for:** Main CTAs, navigation, primary actions, brand authority

```
primary-50:  #eff6ff  (Very light backgrounds)
primary-100: #dbeafe  (Light backgrounds, hover states)
primary-200: #bfdbfe  (Borders, subtle accents)
primary-300: #93c5fd
primary-400: #60a5fa
primary-500: #3b82f6
primary-600: #2563eb  ⭐ PRIMARY BRAND COLOR (Main CTAs, icons, links)
primary-700: #1d4ed8  (Hover states for CTAs)
primary-800: #1e40af  (Text on light backgrounds)
primary-900: #1e3a8a  (Gradients, dark backgrounds)
primary-950: #172554  (Deep gradient backgrounds)
```

**Usage examples:**
- Newsroom filter pills: `bg-primary-600`
- Story card "Read more" links: `text-primary-600 hover:text-primary-700`
- Quote page gradients: `via-primary-900`

---

### Secondary Color - Teal
**Use for:** Gradients with primary, secondary CTAs, modern accents

```
secondary-50:  #f0fdfa
secondary-100: #ccfbf1
secondary-200: #99f6e4
secondary-300: #5eead4
secondary-400: #2dd4bf
secondary-500: #14b8a6  ⭐ SECONDARY BRAND COLOR
secondary-600: #0d9488
secondary-700: #0f766e
secondary-800: #115e59
secondary-900: #134e4a  (Gradients, dark backgrounds)
secondary-950: #042f2e
```

**Usage examples:**
- Background gradients: `from-slate-600 via-primary-900 to-secondary-900`
- Button gradients: `from-primary-600 via-primary-700 to-secondary-600`
- Accent elements on primary backgrounds

---

### Accent Color - Amber/Gold
**Use for:** Badges, highlights, savings indicators, featured items, special offers

```
accent-50:  #fffbeb
accent-100: #fef3c7  (Featured badge backgrounds)
accent-200: #fde68a
accent-300: #fcd34d
accent-400: #fbbf24
accent-500: #f59e0b  ⭐ MAIN ACCENT COLOR (Highlights, featured items)
accent-600: #d97706
accent-700: #b45309
accent-800: #92400e  (Text on light accent backgrounds)
accent-900: #78350f
accent-950: #451a03
```

**Usage examples:**
- Featured badges: `bg-accent-100 text-accent-800 border-accent-200`
- Confetti: `from-accent-400 to-accent-600`
- Savings highlights: `text-accent-500`
- Product bestseller badges: `from-accent-500 to-accent-600`

**IMPORTANT:** Accent is the ONLY secondary highlight color. Do not introduce competing accent colors.

---

### Success Color - Emerald
**Use for:** Success messages, checkmarks, completion states, positive actions, discounts

```
success-50:  #ecfdf5
success-100: #d1fae5  (Success backgrounds)
success-200: #a7f3d0
success-300: #6ee7b7
success-400: #34d399  ⭐ MAIN SUCCESS COLOR (Checkmarks, positive CTAs)
success-500: #10b981
success-600: #059669
success-700: #047857
success-800: #065f46  (Text on light success backgrounds)
success-900: #064e3b
success-950: #022c22
```

**Usage examples:**
- Defensive Driving course: `from-success-500/10` (card), `text-success-400` (icons)
- Success states: `from-success-400 to-success-600`
- Discount badges: `bg-success-500/20 border-success-500/50 text-success-300`

---

### Semantic Category Colors (Newsroom)

These provide visual distinction for content categories while staying within the brand palette:

```javascript
litigation: {
  bg: '#fee2e2',      // red-100
  text: '#b91c1c',    // red-700
  border: '#fecaca',  // red-200
}
law: {
  bg: 'primary-100',  // Uses design token
  text: 'primary-800',
  border: 'primary-200',
}
accident: {
  bg: '#fed7aa',      // orange-200
  text: '#c2410c',    // orange-700
  border: '#fdba74',  // orange-300
}
data: {
  bg: '#e9d5ff',      // purple-200
  text: '#6b21a8',    // purple-800
  border: '#d8b4fe',  // purple-300
}
policy: {
  bg: 'success-100',  // Uses design token
  text: 'success-800',
  border: 'success-200',
}
```

---

## Typography

### Font Family
**All pages use the same system font stack:**

```css
font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
             "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

### Standardized Type Scale

```
text-display:  4rem / 1.1 / 900    Hero headlines (largest)
text-h1:      3rem / 1.2 / 800    Page titles
text-h2:    2.25rem / 1.25 / 700   Section headers
text-h3:   1.875rem / 1.3 / 700   Subsection headers
text-h4:     1.5rem / 1.4 / 600    Card titles
text-body-lg: 1.125rem / 1.75 / 400  Large body text
text-body:    1rem / 1.625 / 400    Default body text
text-body-sm: 0.875rem / 1.5 / 400   Small text, captions
```

**Usage guidelines:**
- Headlines can vary in weight (bold, semibold, black) but NOT font family or line-height philosophy
- Newsroom headlines: `text-2xl md:text-3xl font-bold` (h2 scale)
- Quote page hero: `text-4xl sm:text-5xl font-black` (display scale)
- Body text should use `text-body` or `text-body-lg` for consistency

---

## Components

### Buttons

#### Primary Button
**Use for:** Main CTAs, quote starts, conversions

```jsx
className="group relative inline-flex items-center justify-center gap-3 w-full
           bg-gradient-to-r from-primary-600 via-primary-700 to-secondary-600
           text-white font-black text-lg py-5 px-8 rounded-xl
           hover:from-primary-700 hover:via-primary-800 hover:to-secondary-700
           transition-all duration-300 transform hover:scale-105 active:scale-95
           shadow-2xl hover:shadow-primary-500/50"
```

**Features:**
- Gradient background (primary → secondary)
- Bold typography (font-black)
- Hover scale effect
- Shimmer effect on hover (optional)

#### Secondary Button
**Use for:** Secondary actions, outline style

```jsx
className="px-4 py-2 rounded-full text-sm font-semibold
           bg-slate-700 hover:bg-slate-600 text-slate-50 transition-all"
```

---

### Pills / Tags

#### Filter Pills (Newsroom)
```jsx
// Active state
className="px-4 py-2 rounded-full text-sm font-medium
           bg-primary-600 text-white shadow-sm"

// Inactive state
className="px-4 py-2 rounded-full text-sm font-medium
           bg-gray-100 text-gray-700 hover:bg-gray-200"
```

#### Category Chips
```jsx
className="inline-flex items-center px-2.5 py-0.5 rounded-full
           text-xs font-medium
           bg-primary-100 text-primary-800 border border-primary-200"
```

#### Featured Badge
```jsx
className="inline-flex items-center px-2.5 py-0.5 rounded-full
           text-xs font-bold
           bg-accent-100 text-accent-800 border border-accent-200"
```

---

### Cards

#### Product Card (Education/Store)
```jsx
className="bg-white/5 backdrop-blur-sm rounded-2xl
           border border-white/10 hover:border-white/30
           transition-all duration-300 overflow-hidden
           hover:transform hover:scale-[1.02]"
```

#### Story Card (Newsroom)
```jsx
className="bg-white border-b border-gray-200 py-6 px-4 md:px-6
           hover:bg-gray-50 transition-colors"
```

#### Quote Process Card
```jsx
className="bg-gradient-to-br from-primary-50 via-secondary-50 to-blue-50
           border-2 border-primary-200 rounded-3xl p-8 shadow-2xl"
```

---

## Gradients

### Background Gradients

#### Quote Funnel / Education Pages
```jsx
className="min-h-screen bg-gradient-to-br
           from-slate-600 via-primary-900 to-secondary-900"
```

#### Newsroom Header (Subtle)
```jsx
className="bg-gradient-to-br
           from-slate-600/5 via-primary-900/5 to-secondary-900/5
           backdrop-blur-sm"
```

**Philosophy:** Same color formula (slate → primary → secondary) but varying opacity for different contexts

---

## Animations

```javascript
'float':          'float 3s ease-in-out infinite'
'float-delayed':  'float 3s ease-in-out 1.5s infinite'
'gradient-x':     'gradient-x 3s ease infinite'
'blob':           'blob 7s infinite'
'shimmer':        'shimmer 2s infinite'
'wiggle':         'wiggle 1s ease-in-out infinite'
```

**Usage:**
- Use `animate-float` for subtle vertical movement on background elements
- Use `animate-gradient-x` for animated gradient backgrounds
- Use `animate-shimmer` for shine effects on hover
- All animations respect `prefers-reduced-motion`

---

## Best Practices

### ✅ DO

- **Always use design tokens** instead of arbitrary colors
- **Maintain gradient consistency** across all sections (slate → primary → secondary)
- **Use accent (gold) sparingly** for highlights and featured items only
- **Use success (emerald) for positive actions** and completion states
- **Keep typography hierarchy consistent** across all pages
- **Reference this guide** when adding new components

### ❌ DON'T

- **Don't use ad-hoc colors** like `blue-600`, `yellow-400`, `orange-500`
- **Don't introduce competing accent colors** (stick to ONE accent: gold)
- **Don't change font families** between sections
- **Don't create one-off component styles** - extend existing patterns
- **Don't use gradients randomly** - follow the established palette

---

## Migration Checklist

When updating existing components to use the design system:

1. ✅ Replace `blue-600` → `primary-600`
2. ✅ Replace `yellow-400`, `orange-500` → `accent-400`, `accent-500`
3. ✅ Replace `emerald-300`, `green-500` → `success-300`, `success-500`
4. ✅ Ensure gradient backgrounds use: `from-slate-600 via-primary-900 to-secondary-900`
5. ✅ Check button styles match design system patterns
6. ✅ Verify typography uses standardized scale
7. ✅ Test across Quote, Education, and Newsroom for visual consistency

---

## Visual Cohesion Goals

**Success criteria:** A user should never feel like they left the InsuredByCam ecosystem when navigating between sections.

- **Quote page → Newsroom:** Same gradient philosophy (now subtle in header), same primary colors for CTAs
- **Education → Quote:** Same dark gradient backgrounds, same accent usage for highlights
- **Newsroom → Education:** Same typography scale, same category/tag styling approach

**The result:** A serious Georgia insurance institution with media credibility and conversion authority.

---

## Questions?

For design system updates or questions, reference:
- `tailwind.config.js` - Source of truth for design tokens
- This document - Usage guidelines and best practices
- Existing components in `src/components/` and `src/pages/components/` for implementation examples
