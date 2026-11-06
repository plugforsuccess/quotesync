// pages/StorePage.jsx
import { T } from '../components/SiteCopy';
import React, { useState } from 'react';
import { BookOpen, Filter, Star, TrendingUp, ShoppingBag, Shirt, Package } from 'lucide-react';
import { products, getFeaturedProducts, getBestsellers, categories } from '../lib/products';
import ProductCard from '../components/ProductCard';

function StorePage() {
  const [productType, setProductType] = useState('digital'); // digital, physical
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
    <div className="min-h-screen bg-gradient-to-br from-gray-600 via-primary-900 to-secondary-900 relative overflow-hidden">
      <title>Insurance Resources & Courses | insuredbycam Store</title>
      <meta name="description" content="Drivers ed courses, insurance guides, and resources for Georgia drivers. Georgia-approved defensive driving and Joshua's Law courses." />
      <meta property="og:type" content="website" />
      <meta property="og:title" content="Store | insuredbycam" />
      <meta property="og:url" content="https://insuredbycam.com/store" />
      <link rel="canonical" href="https://insuredbycam.com/store" />
      {/* Background Effects */}
      <div className="absolute inset-0 opacity-30 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-64 h-64 bg-primary-500 rounded-full mix-blend-multiply filter blur-xl animate-blob"></div>
        <div className="absolute bottom-10 right-20 w-64 h-64 bg-secondary-400 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-4000"></div>
      </div>

      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>

      <div className="relative z-10 container mx-auto px-4 py-16">
        {/* Header */}
        <header className="text-center mb-16">
          {/* Product Type Toggle */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <button
              onClick={() => setProductType('digital')}
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold transition-all ${
                productType === 'digital'
                  ? 'bg-gradient-to-r from-accent-500 to-accent-600 text-white shadow-lg'
                  : 'bg-white/10 backdrop-blur-sm border border-white/20 text-white/70 hover:text-white hover:bg-white/15'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span><T k="pages.storepage.c24dd9">Digital Products</T></span>
            </button>
            <button
              onClick={() => setProductType('physical')}
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold transition-all ${
                productType === 'physical'
                  ? 'bg-gradient-to-r from-accent-500 to-accent-600 text-white shadow-lg'
                  : 'bg-white/10 backdrop-blur-sm border border-white/20 text-white/70 hover:text-white hover:bg-white/15'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              <span><T k="pages.storepage.e19ba0">Physical Products</T></span>
            </button>
          </div>

          <h1 className="text-4xl md:text-6xl font-black text-white mb-6 leading-tight">
            {productType === 'digital' ? (
              <>
                <T k="pages.storepage.1becf3">Insurance Education</T>
                <br />
                <span className="bg-gradient-to-r from-accent-300 via-accent-400 to-accent-500 bg-clip-text text-transparent">
                  <T k="pages.storepage.797ff1">That Actually Helps</T>
                </span>
              </>
            ) : (
              <>
                <T k="pages.storepage.3bad38">Gear & Accessories</T>
                <br />
                <span className="bg-gradient-to-r from-accent-300 via-accent-400 to-accent-500 bg-clip-text text-transparent">
                  <T k="pages.storepage.04d2fd">Coming Soon</T>
                </span>
              </>
            )}
          </h1>

          <p className="text-xl text-white/80 max-w-2xl mx-auto leading-relaxed">
            {productType === 'digital'
              ? <T k="pages.storepage.8977c5">{'Skip the fluff. Get tactical guides that show you exactly what to look for, what to avoid, and how to stop overpaying.'}</T>
              : <T k="pages.storepage.03a796">{'T-shirts, car accessories, and more. Sign up below to get notified when we launch.'}</T>
            }
          </p>
        </header>

        {productType === 'digital' ? (
          <>
            {/* Filter Tabs */}
            <div className="flex items-center justify-center gap-3 mb-12 flex-wrap">
              <button
                onClick={() => setFilter('all')}
                className={`px-6 py-3 rounded-full font-semibold transition-all ${
                  filter === 'all'
                    ? 'bg-white text-gray-900 shadow-lg'
                    : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
                }`}
              >
                <T k="pages.storepage.e0001a">All Products (</T>{products.length})
              </button>
              <button
                onClick={() => setFilter('featured')}
                className={`px-6 py-3 rounded-full font-semibold transition-all flex items-center gap-2 ${
                  filter === 'featured'
                    ? 'bg-white text-gray-900 shadow-lg'
                    : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
                }`}
              >
                <Star className="w-4 h-4" />
                <T k="pages.storepage.ae31ad">Featured</T>
              </button>
              <button
                onClick={() => setFilter('bestsellers')}
                className={`px-6 py-3 rounded-full font-semibold transition-all flex items-center gap-2 ${
                  filter === 'bestsellers'
                    ? 'bg-white text-gray-900 shadow-lg'
                    : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <T k="pages.storepage.83b8e4">Bestsellers</T>
              </button>
            </div>

            {/* Product Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </>
        ) : (
          /* Physical Products Coming Soon */
          <div className="mb-16">
            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-12">
              {/* Preview Card 1 - T-Shirts */}
              <div className="relative bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-8 text-center">
                <div className="absolute inset-0 bg-gradient-to-br from-accent-500/10 to-primary-500/10 rounded-2xl"></div>
                <div className="relative">
                  <div className="w-20 h-20 bg-gradient-to-br from-accent-500/20 to-accent-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10">
                    <Shirt className="w-10 h-10 text-white/60" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2"><T k="pages.storepage.45fe03">T-Shirts</T></h3>
                  <p className="text-sm text-white/60">
                    <T k="pages.storepage.8d129b">Premium apparel for insurance nerds</T>
                  </p>
                </div>
              </div>

              {/* Preview Card 2 - Car Accessories */}
              <div className="relative bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-8 text-center">
                <div className="absolute inset-0 bg-gradient-to-br from-primary-500/10 to-secondary-500/10 rounded-2xl"></div>
                <div className="relative">
                  <div className="w-20 h-20 bg-gradient-to-br from-primary-500/20 to-primary-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10">
                    <Package className="w-10 h-10 text-white/60" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2"><T k="pages.storepage.df89aa">Car Accessories</T></h3>
                  <p className="text-sm text-white/60">
                    <T k="pages.storepage.69cd92">Practical gear for your vehicle</T>
                  </p>
                </div>
              </div>

              {/* Preview Card 3 - More */}
              <div className="relative bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-8 text-center">
                <div className="absolute inset-0 bg-gradient-to-br from-secondary-500/10 to-accent-500/10 rounded-2xl"></div>
                <div className="relative">
                  <div className="w-20 h-20 bg-gradient-to-br from-secondary-500/20 to-secondary-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10">
                    <ShoppingBag className="w-10 h-10 text-white/60" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2"><T k="pages.storepage.b17f6f">& More</T></h3>
                  <p className="text-sm text-white/60">
                    <T k="pages.storepage.f2f953">Stickers, mugs, and other merch</T>
                  </p>
                </div>
              </div>
            </div>

            {/* Notify Me Form */}
            <div className="max-w-xl mx-auto bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 text-center">
              <h3 className="text-2xl font-bold text-white mb-3">
                <T k="pages.storepage.c572a9">Get Notified At Launch</T>
              </h3>
              <p className="text-white/70 mb-6">
                <T k="pages.storepage.2a2f87">Be the first to know when physical products drop. No spam, just launch updates.</T>
              </p>
              <form className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="flex-1 px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                />
                <button
                  type="submit"
                  className="px-6 py-3 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-accent-500/50"
                >
                  <T k="pages.storepage.c3f30b">Notify Me</T>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Value Prop Section - Only for Digital Products */}
        {productType === 'digital' && (
          <div className="max-w-4xl mx-auto bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
            <h2 className="text-2xl font-bold text-white mb-4 text-center">
              <T k="pages.storepage.73ccc2">Why Buy From Insuredbycam?</T>
            </h2>
            <div className="grid md:grid-cols-3 gap-6 text-center">
              <div>
                <div className="w-12 h-12 bg-gradient-to-br from-success-400 to-success-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">✓</span>
                </div>
                <h3 className="font-bold text-white mb-2"><T k="pages.storepage.86ed5b">No Fluff</T></h3>
                <p className="text-sm text-white/70">
                  <T k="pages.storepage.3425dc">Written by a licensed agent who actually sells insurance. Real tactics, not theory.</T>
                </p>
              </div>
              <div>
                <div className="w-12 h-12 bg-gradient-to-br from-primary-400 to-primary-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">⚡</span>
                </div>
                <h3 className="font-bold text-white mb-2"><T k="pages.storepage.2c21e1">Instant Access</T></h3>
                <p className="text-sm text-white/70">
                  <T k="pages.storepage.7d2194">Download immediately after purchase. No waiting, no shipping, no hassle.</T>
                </p>
              </div>
              <div>
                <div className="w-12 h-12 bg-gradient-to-br from-accent-400 to-accent-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">↻</span>
                </div>
                <h3 className="font-bold text-white mb-2"><T k="pages.storepage.27b74f">Lifetime Updates</T></h3>
                <p className="text-sm text-white/70">
                  <T k="pages.storepage.8b0f4d">As insurance rules change, so do the guides. Get updates free forever.</T>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StorePage;
