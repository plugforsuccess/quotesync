// src/lib/products.js - Product Catalog
// Initial products: PDF guides and ebooks about insurance

export const products = [
  {
    id: 'coverage-mistakes-guide',
    name: 'The Coverage Mistakes Guide',
    slug: 'coverage-mistakes-guide',
    tagline: 'Stop paying for insurance you don't understand',
    description: 'A complete breakdown of the 7 most common coverage mistakes that cost drivers thousands in claims that should have been covered.',
    longDescription: `
      <p>Most drivers overpay for insurance while being underprotected. This guide shows you exactly what to look for.</p>

      <h3>What's Inside:</h3>
      <ul>
        <li><strong>The Liability Trap:</strong> Why minimum coverage could bankrupt you</li>
        <li><strong>Deductible Math:</strong> When higher deductibles cost you more</li>
        <li><strong>The Gap Nobody Explains:</strong> What happens between your policy and actual repair costs</li>
        <li><strong>Coverage Stacking:</strong> How duplicate coverage wastes $200+ per year</li>
        <li><strong>The Rental Car Mistake:</strong> When you're paying twice for the same coverage</li>
        <li><strong>Underinsured Motorist Protection:</strong> The coverage 60% of drivers skip (and regret)</li>
        <li><strong>Declarations Page Decoder:</strong> How to actually read your policy</li>
      </ul>

      <p><strong>Format:</strong> 24-page PDF guide with real examples, checklists, and action items</p>
      <p><strong>Delivery:</strong> Instant download after purchase</p>
    `,
    price: 29,
    originalPrice: 49,
    category: 'guides',
    format: 'PDF',
    pages: 24,
    featured: true,
    bestseller: true,
    image: '/products/coverage-guide.jpg',
    downloadUrl: '/downloads/coverage-mistakes-guide.pdf', // This would be a secure link after purchase
    whatYouGet: [
      '24-page comprehensive PDF guide',
      'Real-world coverage examples',
      'Policy review checklist',
      'Coverage comparison worksheet',
      'Lifetime access & updates'
    ],
    benefits: [
      'Understand exactly what you're paying for',
      'Identify gaps in your current coverage',
      'Stop overpaying for duplicate protection',
      'Know what questions to ask your agent',
      'Make informed decisions about deductibles'
    ]
  },
  {
    id: 'insurance-shopping-playbook',
    name: 'The Insurance Shopping Playbook',
    slug: 'insurance-shopping-playbook',
    tagline: 'Get better quotes without getting spammed',
    description: 'Step-by-step tactics for comparing insurance quotes the smart way — including how to spot fake discounts and negotiate with agents.',
    longDescription: `
      <p>Shopping for insurance is broken. This playbook shows you how to get accurate quotes without falling into the lead-gen trap.</p>

      <h3>What's Inside:</h3>
      <ul>
        <li><strong>The Quote Comparison Framework:</strong> How to compare apples-to-apples</li>
        <li><strong>Discount Decoder:</strong> Which discounts actually matter (most don't)</li>
        <li><strong>Agent Negotiation Scripts:</strong> Exact questions that get better rates</li>
        <li><strong>Red Flags Checklist:</strong> How to spot predatory insurance offers</li>
        <li><strong>The Switching Timeline:</strong> When to switch vs. when to stay</li>
        <li><strong>Claims History Impact:</strong> How your record affects pricing (and what you can do)</li>
        <li><strong>Bundle Strategy:</strong> When bundling saves money and when it doesn't</li>
      </ul>

      <p><strong>Format:</strong> 32-page PDF guide with templates, scripts, and worksheets</p>
      <p><strong>Delivery:</strong> Instant download after purchase</p>
    `,
    price: 39,
    originalPrice: 59,
    category: 'guides',
    format: 'PDF',
    pages: 32,
    featured: true,
    bestseller: false,
    image: '/products/shopping-playbook.jpg',
    downloadUrl: '/downloads/insurance-shopping-playbook.pdf',
    whatYouGet: [
      '32-page tactical playbook',
      'Quote comparison spreadsheet',
      'Agent negotiation scripts',
      'Discount evaluation checklist',
      'Lifetime access & updates'
    ],
    benefits: [
      'Compare quotes accurately (not just price)',
      'Avoid lead-gen spam traps',
      'Negotiate confidently with agents',
      'Spot fake discounts instantly',
      'Know exactly when to switch carriers'
    ]
  },
  {
    id: 'claims-survival-guide',
    name: 'The Claims Survival Guide',
    slug: 'claims-survival-guide',
    tagline: 'What to do when you actually need your insurance',
    description: 'Everything you need to know about filing claims, dealing with adjusters, and getting paid what you're owed — without getting lowballed.',
    longDescription: `
      <p>Filing a claim is when your insurance actually matters. This guide ensures you get what you paid for.</p>

      <h3>What's Inside:</h3>
      <ul>
        <li><strong>First 24 Hours:</strong> Critical steps after an accident</li>
        <li><strong>Documentation Checklist:</strong> Photos, evidence, and records that matter</li>
        <li><strong>Dealing with Adjusters:</strong> What they look for and how to respond</li>
        <li><strong>Lowball Offer Response:</strong> When to push back and how</li>
        <li><strong>Total Loss Scenarios:</strong> Getting fair market value for your car</li>
        <li><strong>Rental Car Claims:</strong> Maximizing your rental coverage</li>
        <li><strong>Injury Claims:</strong> Medical bills, lost wages, and pain/suffering</li>
        <li><strong>When to Hire a Lawyer:</strong> And when it's not worth it</li>
      </ul>

      <p><strong>Format:</strong> 28-page PDF guide with templates and scripts</p>
      <p><strong>Delivery:</strong> Instant download after purchase</p>
    `,
    price: 34,
    originalPrice: 54,
    category: 'guides',
    format: 'PDF',
    pages: 28,
    featured: false,
    bestseller: false,
    image: '/products/claims-guide.jpg',
    downloadUrl: '/downloads/claims-survival-guide.pdf',
    whatYouGet: [
      '28-page claims playbook',
      'Accident documentation checklist',
      'Adjuster negotiation scripts',
      'Settlement calculator worksheet',
      'Lifetime access & updates'
    ],
    benefits: [
      'Know exactly what to do after an accident',
      'Document everything the right way',
      'Negotiate effectively with adjusters',
      'Avoid getting lowballed on settlements',
      'Understand when you need legal help'
    ]
  }
];

// Helper functions
export const getFeaturedProducts = () => {
  return products.filter(p => p.featured);
};

export const getBestsellers = () => {
  return products.filter(p => p.bestseller);
};

export const getProductBySlug = (slug) => {
  return products.find(p => p.slug === slug);
};

export const getProductById = (id) => {
  return products.find(p => p.id === id);
};

// Categories
export const categories = [
  { id: 'guides', name: 'Insurance Guides', count: products.filter(p => p.category === 'guides').length },
  { id: 'courses', name: 'Courses', count: 0 }, // Placeholder for future
  { id: 'templates', name: 'Templates', count: 0 }, // Placeholder for future
];
