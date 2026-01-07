// src/components/ProductUpsell.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ArrowRight, Star, CheckCircle } from 'lucide-react';
import { getFeaturedProducts } from '../lib/products';

const ProductUpsell = ({ context = 'post-quote' }) => {
  // Get the top featured product (or could be randomized/personalized)
  const product = getFeaturedProducts()[0];

  if (!product) return null;

  const getHeading = () => {
    switch (context) {
      case 'post-quote':
        return "While I Review Your Policy...";
      case 'education':
        return "Want to Dive Deeper?";
      default:
        return "Recommended for You";
    }
  };

  const getSubheading = () => {
    switch (context) {
      case 'post-quote':
        return "Learn what to look for so you understand my recommendations";
      case 'education':
        return "Get the complete playbook on insurance coverage";
      default:
        return "Master your insurance knowledge";
    }
  };

  return (
    <div className="bg-gradient-to-br from-accent-500/10 to-accent-600/10 border-2 border-accent-500/30 rounded-2xl p-6 relative overflow-hidden">
      {/* Decorative Background */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-accent-400/20 to-transparent rounded-full blur-3xl"></div>

      <div className="relative">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-accent-500 to-accent-600 rounded-full flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 mb-1">
              {getHeading()}
            </h3>
            <p className="text-sm text-gray-600">
              {getSubheading()}
            </p>
          </div>
        </div>

        {/* Product Card */}
        <div className="bg-white rounded-xl p-5 mb-4 shadow-sm border border-gray-200">
          <div className="flex items-start gap-4">
            {/* Product Icon */}
            <div className="w-16 h-16 bg-gradient-to-br from-accent-500/20 to-accent-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-8 h-8 text-accent-600" />
            </div>

            {/* Product Info */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-bold text-gray-900 text-sm">
                  {product.name}
                </h4>
                {product.bestseller && (
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent-500 rounded-full">
                    <Star className="w-3 h-3 text-white fill-current" />
                    <span className="text-[10px] font-bold text-white">BESTSELLER</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-600 mb-3 line-clamp-2">
                {product.description}
              </p>

              {/* Quick Benefits */}
              <ul className="space-y-1 mb-3">
                {product.benefits.slice(0, 3).map((benefit, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-gray-700">
                    <CheckCircle className="w-3 h-3 text-success-500 flex-shrink-0 mt-0.5" />
                    <span className="line-clamp-1">{benefit}</span>
                  </li>
                ))}
              </ul>

              {/* Price */}
              <div className="flex items-center gap-2 mb-3">
                {product.originalPrice && (
                  <span className="text-xs text-gray-400 line-through">
                    ${product.originalPrice}
                  </span>
                )}
                <span className="text-xl font-black text-gray-900">
                  ${product.price}
                </span>
                {product.originalPrice && (
                  <span className="text-xs font-bold text-success-600">
                    Save ${product.originalPrice - product.price}
                  </span>
                )}
              </div>

              {/* CTA */}
              <Link
                to={`/store/${product.slug}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white text-sm font-bold rounded-lg transition-all duration-300 transform hover:scale-105"
              >
                Learn More
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <p className="text-xs text-gray-500 text-center">
          Instant download • 30-day money-back guarantee • No account required
        </p>
      </div>
    </div>
  );
};

export default ProductUpsell;
