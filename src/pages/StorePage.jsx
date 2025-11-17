// pages/StorePage.jsx
import React from 'react';

function StorePage() {
  return (
    <div className="space-y-6">
      <header className="text-center mt-12">
        <h1 className="text-3xl md:text-4xl font-black mb-12">
          Online Store
        </h1>
        <p className="text-white/70 max-w-xl mx-auto">
          This is where we sell add-ons like coaching, digital guides,
          merch, or anything tied to insurance + financial education.
        </p>
      </header>

      <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-6 text-center text-sm text-white/60">
        Store coming soon. If you’d like early access to discounts or content,
        ask for a quote and mention “Online Store” in the notes.
      </div>
    </div>
  );
}

export default StorePage;
