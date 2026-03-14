// src/pages/ProductDetailPage.jsx
import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Download, Shield, Star, FileText, AlertCircle } from 'lucide-react';
import { getProductBySlug } from '../lib/products';
import { trackProductView, trackBeginCheckout } from '../lib/analytics';

const ProductDetailPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const product = getProductBySlug(slug);
  const [isProcessing, setIsProcessing] = useState(false);

  // Track product view on page load
  useEffect(() => {
    if (product) {
      trackProductView(product);
    }
  }, [product]);

  if (!product) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-600 via-primary-900 to-secondary-900 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-4">Product Not Found</h1>
          <Link
            to="/store"
            className="text-accent-400 hover:text-accent-300 transition-colors"
          >
            ← Back to Store
          </Link>
        </div>
      </div>
    );
  }

  const {
    name,
    tagline,
    description,
    longDescription,
    price,
    originalPrice,
    format,
    pages,
    bestseller,
    whatYouGet,
    benefits
  } = product;

  const isFree = price === 0;
  const discount = originalPrice && price > 0 ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;

  const handleCheckout = async () => {
    setIsProcessing(true);

    // Track begin checkout event
    trackBeginCheckout(product);

    // For free products, skip payment and go straight to download
    if (isFree) {
      setTimeout(() => {
        navigate(`/store/purchase-success?product=${product.id}`);
      }, 1000);
      return;
    }

    // IMPORTANT: In production, this should call your backend API to create a Stripe checkout session
    // For now, we'll simulate the checkout flow
    // Real implementation would be:
    // const response = await fetch('/api/create-checkout-session', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ productId: product.id })
    // });
    // const { url } = await response.json();
    // window.location.href = url;

    // Simulated checkout for demo purposes
    setTimeout(() => {
      // Navigate to success page with product ID
      navigate(`/store/purchase-success?product=${product.id}`);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-600 via-primary-900 to-secondary-900 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 opacity-30 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-64 h-64 bg-primary-500 rounded-full mix-blend-multiply filter blur-xl animate-blob"></div>
        <div className="absolute bottom-10 right-20 w-64 h-64 bg-secondary-400 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-4000"></div>
      </div>

      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>

      <div className="relative z-10 container mx-auto px-4 py-12">
        {/* Back Button */}
        <Link
          to="/store"
          className="inline-flex items-center gap-2 text-white/70 hover:text-white transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Store
        </Link>

        <div className="grid lg:grid-cols-2 gap-12 max-w-7xl mx-auto">
          {/* Left Column - Product Info */}
          <div>
            {/* Badges */}
            <div className="flex items-center gap-2 mb-4">
              {bestseller && (
                <div className="inline-flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-accent-500 to-accent-600 rounded-full text-xs font-bold text-white">
                  <Star className="w-3 h-3 fill-current" />
                  Bestseller
                </div>
              )}
              {isFree && (
                <div className="inline-flex items-center gap-1 px-3 py-1 bg-success-500/20 border border-success-500/50 rounded-full text-xs font-bold text-success-300">
                  FREE
                </div>
              )}
              {discount > 0 && !isFree && (
                <div className="inline-flex items-center gap-1 px-3 py-1 bg-success-500/20 border border-success-500/50 rounded-full text-xs font-bold text-success-300">
                  {discount}% OFF Today
                </div>
              )}
            </div>

            {/* Title & Tagline */}
            <h1 className="text-4xl md:text-5xl font-black text-white mb-4 leading-tight">
              {name}
            </h1>
            <p className="text-xl text-accent-400 font-semibold mb-6">
              {tagline}
            </p>

            {/* Description */}
            <p className="text-lg text-white/80 leading-relaxed mb-6">
              {description}
            </p>

            {/* Meta Info */}
            <div className="flex items-center gap-4 mb-8 text-sm text-white/60">
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {format}
              </span>
              <span>•</span>
              <span>{pages} pages</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Download className="w-4 h-4" />
                Instant download
              </span>
            </div>

            {/* What You Get */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 mb-8">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Check className="w-5 h-5 text-success-400" />
                What's Included
              </h3>
              <ul className="space-y-3">
                {whatYouGet.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-white/80">
                    <Check className="w-5 h-5 text-success-400 flex-shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Benefits */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
              <h3 className="text-xl font-bold text-white mb-4">
                What You'll Learn
              </h3>
              <ul className="space-y-3">
                {benefits.map((benefit, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-white/80">
                    <span className="w-6 h-6 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white">
                      {idx + 1}
                    </span>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right Column - Checkout Card */}
          <div>
            <div className="sticky top-8">
              {/* Checkout Card */}
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-primary-500 via-secondary-500 to-accent-500 rounded-2xl opacity-50 group-hover:opacity-75 blur transition duration-300"></div>

                <div className="relative bg-white/10 backdrop-blur-xl rounded-2xl p-8 border-2 border-white/20">
                  {/* Product Preview */}
                  <div className="mb-6 rounded-xl bg-gradient-to-br from-primary-500/20 via-secondary-500/20 to-accent-500/20 p-12 flex items-center justify-center border border-white/10">
                    <FileText className="w-24 h-24 text-white/60" />
                  </div>

                  {/* Price */}
                  <div className="mb-6 text-center">
                    {!isFree && originalPrice > price && (
                      <div className="text-2xl text-white/40 line-through mb-2">
                        ${originalPrice}
                      </div>
                    )}
                    <div className="text-5xl font-black text-white mb-2">
                      {isFree ? 'Free' : `$${price}`}
                    </div>
                    <div className="text-sm text-white/60">
                      {isFree ? 'Free download • Lifetime access' : 'One-time payment • Lifetime access'}
                    </div>
                  </div>

                  {/* Buy Button */}
                  <button
                    onClick={handleCheckout}
                    disabled={isProcessing}
                    className="w-full py-4 px-6 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white font-black text-lg rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-accent-500/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none mb-6"
                  >
                    {isProcessing ? 'Processing...' : (isFree ? 'Get Free Guide' : 'Buy Now')}
                  </button>

                  {/* Trust Badges */}
                  <div className="space-y-3 mb-6">
                    {!isFree && (
                      <div className="flex items-center gap-3 text-sm text-white/70">
                        <Shield className="w-5 h-5 text-success-400 flex-shrink-0" />
                        <span>Secure checkout with Stripe</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-sm text-white/70">
                      <Download className="w-5 h-5 text-primary-400 flex-shrink-0" />
                      <span>Instant download after {isFree ? 'signup' : 'purchase'}</span>
                    </div>
                    {!isFree && (
                      <div className="flex items-center gap-3 text-sm text-white/70">
                        <Check className="w-5 h-5 text-success-400 flex-shrink-0" />
                        <span>30-day money-back guarantee</span>
                      </div>
                    )}
                  </div>

                  {/* Info Box */}
                  <div className="bg-primary-500/10 border border-primary-500/30 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-white/70 leading-relaxed">
                        {isFree
                          ? "After signup, you'll receive an email with your download link. No account or payment required."
                          : "After purchase, you'll receive an email with your download link. No account required."
                        }
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Questions CTA */}
              <div className="mt-6 text-center">
                <p className="text-sm text-white/60">
                  Questions?{' '}
                  <a href="mailto:cameron@insuredbycam.com" className="text-accent-400 hover:text-accent-300 transition-colors">
                    Email Cameron
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Full Description Section */}
        <div className="max-w-4xl mx-auto mt-16 bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
          <h2 className="text-3xl font-bold text-white mb-6">
            What's Inside This Guide
          </h2>
          <div
            className="prose prose-invert prose-lg max-w-none"
            dangerouslySetInnerHTML={{ __html: longDescription }}
            style={{
              color: 'rgba(255, 255, 255, 0.8)'
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default ProductDetailPage;
