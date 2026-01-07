// src/components/ProductCard.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Star, TrendingUp, FileText } from 'lucide-react';

const ProductCard = ({ product }) => {
  const {
    slug,
    name,
    tagline,
    description,
    price,
    originalPrice,
    format,
    pages,
    bestseller,
    image
  } = product;

  const discount = originalPrice ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;

  return (
    <Link
      to={`/store/${slug}`}
      className="group relative block bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 hover:border-white/30 transition-all duration-300 overflow-hidden hover:transform hover:scale-[1.02]"
    >
      {/* Glow Effect on Hover */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-500 via-secondary-500 to-accent-500 rounded-2xl opacity-0 group-hover:opacity-20 blur transition duration-300"></div>

      <div className="relative p-6">
        {/* Badges */}
        <div className="flex items-center gap-2 mb-4">
          {bestseller && (
            <div className="inline-flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-accent-500 to-accent-600 rounded-full text-xs font-bold text-white">
              <Star className="w-3 h-3 fill-current" />
              Bestseller
            </div>
          )}
          {discount > 0 && (
            <div className="inline-flex items-center gap-1 px-3 py-1 bg-success-500/20 border border-success-500/50 rounded-full text-xs font-bold text-success-300">
              {discount}% OFF
            </div>
          )}
        </div>

        {/* Product Image Placeholder (since we don't have actual images yet) */}
        <div className="mb-6 rounded-xl bg-gradient-to-br from-primary-500/20 via-secondary-500/20 to-accent-500/20 p-8 flex items-center justify-center border border-white/10">
          <FileText className="w-16 h-16 text-white/60" />
        </div>

        {/* Product Info */}
        <div className="mb-4">
          <h3 className="text-xl font-bold text-white mb-2 group-hover:text-accent-300 transition-colors">
            {name}
          </h3>
          <p className="text-sm text-accent-400 font-semibold mb-3">
            {tagline}
          </p>
          <p className="text-sm text-white/70 leading-relaxed line-clamp-3">
            {description}
          </p>
        </div>

        {/* Meta Info */}
        <div className="flex items-center gap-3 mb-4 text-xs text-white/50">
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            {format}
          </span>
          <span>•</span>
          <span>{pages} pages</span>
          <span>•</span>
          <span>Instant download</span>
        </div>

        {/* Price & CTA */}
        <div className="flex items-center justify-between pt-4 border-t border-white/10">
          <div>
            {originalPrice && (
              <span className="text-sm text-white/40 line-through mr-2">
                ${originalPrice}
              </span>
            )}
            <span className="text-2xl font-black text-white">
              ${price}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold text-accent-400 group-hover:text-accent-300 transition-colors">
            <span>View Details</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      </div>
    </Link>
  );
};

export default ProductCard;
