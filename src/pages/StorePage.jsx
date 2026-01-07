// pages/StorePage.jsx
import React, { useState } from 'react';
import { BookOpen, Filter, Star, TrendingUp } from 'lucide-react';
import { products, getFeaturedProducts, getBestsellers, categories } from '../lib/products';
import ProductCard from '../components/ProductCard';

function StorePage() {
  const [filter, setFilter] = useState('all'); // all, featured, bestsellers

  const getFilteredProducts = () => {
    switch (filter) {
      case 'featured':
        return getFeaturedProducts();
      case 'bestsellers':
        return getBestsellers();
      default:
        return products;
    }
  };

  const filteredProducts = getFilteredProducts();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-600 via-primary-900 to-secondary-900 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 opacity-30 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-64 h-64 bg-primary-500 rounded-full mix-blend-multiply filter blur-xl animate-blob"></div>
        <div className="absolute bottom-10 right-20 w-64 h-64 bg-secondary-400 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-4000"></div>
      </div>

      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>

      <div className="relative z-10 container mx-auto px-4 py-16">
        {/* Header */}
        <header className="text-center mb-16">
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full border border-white/20">
            <BookOpen className="w-4 h-4 text-accent-300" />
            <span className="text-sm font-semibold text-white/90">Digital Products</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-black text-white mb-6 leading-tight">
            Insurance Education
            <br />
            <span className="bg-gradient-to-r from-accent-300 via-accent-400 to-accent-500 bg-clip-text text-transparent">
              That Actually Helps
            </span>
          </h1>

          <p className="text-xl text-white/80 max-w-2xl mx-auto leading-relaxed">
            Skip the fluff. Get tactical guides that show you exactly what to look for, what to avoid, and how to stop overpaying.
          </p>
        </header>

        {/* Filter Tabs */}
        <div className="flex items-center justify-center gap-3 mb-12 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`px-6 py-3 rounded-full font-semibold transition-all ${
              filter === 'all'
                ? 'bg-white text-slate-900 shadow-lg'
                : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
            }`}
          >
            All Products ({products.length})
          </button>
          <button
            onClick={() => setFilter('featured')}
            className={`px-6 py-3 rounded-full font-semibold transition-all flex items-center gap-2 ${
              filter === 'featured'
                ? 'bg-white text-slate-900 shadow-lg'
                : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
            }`}
          >
            <Star className="w-4 h-4" />
            Featured
          </button>
          <button
            onClick={() => setFilter('bestsellers')}
            className={`px-6 py-3 rounded-full font-semibold transition-all flex items-center gap-2 ${
              filter === 'bestsellers'
                ? 'bg-white text-slate-900 shadow-lg'
                : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Bestsellers
          </button>
        </div>

        {/* Product Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        {/* Value Prop Section */}
        <div className="max-w-4xl mx-auto bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
          <h2 className="text-2xl font-bold text-white mb-4 text-center">
            Why Buy From insuredbycam?
          </h2>
          <div className="grid md:grid-cols-3 gap-6 text-center">
            <div>
              <div className="w-12 h-12 bg-gradient-to-br from-success-400 to-success-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">✓</span>
              </div>
              <h3 className="font-bold text-white mb-2">No Fluff</h3>
              <p className="text-sm text-white/70">
                Written by a licensed agent who actually sells insurance. Real tactics, not theory.
              </p>
            </div>
            <div>
              <div className="w-12 h-12 bg-gradient-to-br from-primary-400 to-primary-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">⚡</span>
              </div>
              <h3 className="font-bold text-white mb-2">Instant Access</h3>
              <p className="text-sm text-white/70">
                Download immediately after purchase. No waiting, no shipping, no hassle.
              </p>
            </div>
            <div>
              <div className="w-12 h-12 bg-gradient-to-br from-accent-400 to-accent-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">↻</span>
              </div>
              <h3 className="font-bold text-white mb-2">Lifetime Updates</h3>
              <p className="text-sm text-white/70">
                As insurance rules change, so do the guides. Get updates free forever.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StorePage;
