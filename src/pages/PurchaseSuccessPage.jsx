// src/pages/PurchaseSuccessPage.jsx
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, Download, Mail, ArrowRight, FileText } from 'lucide-react';
import { getProductById } from '../lib/products';
import { trackPurchase } from '../lib/analytics';

const PurchaseSuccessPage = () => {
  const [searchParams] = useSearchParams();
  const productId = searchParams.get('product');
  const product = getProductById(productId);

  const [confetti, setConfetti] = useState([]);

  useEffect(() => {
    // Track purchase event
    if (product) {
      trackPurchase(product, `txn_${Date.now()}_${product.id}`);
    }

    // Confetti animation
    const newConfetti = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 2 + Math.random() * 2,
    }));
    setConfetti(newConfetti);
  }, [product]);

  if (!product) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-600 via-primary-900 to-secondary-900 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-4">Purchase Not Found</h1>
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Confetti */}
      {confetti.map((item) => (
        <div
          key={item.id}
          className="absolute w-2 h-2 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full"
          style={{
            left: `${item.left}%`,
            top: '-10%',
            animation: `fall ${item.duration}s ease-in ${item.delay}s`,
            opacity: 0.8,
          }}
        />
      ))}

      <style>{`
        @keyframes fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(110vh) rotate(360deg);
            opacity: 0;
          }
        }
      `}</style>

      {/* Background Effects */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>

      <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 md:p-12 max-w-2xl w-full text-center relative z-10 border border-white/20">
        {/* Success Icon */}
        <div className="relative mb-6">
          <div className="w-20 h-20 bg-gradient-to-br from-success-400 to-success-600 rounded-full flex items-center justify-center mx-auto shadow-lg animate-bounce">
            <CheckCircle className="w-12 h-12 text-white" />
          </div>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-success-400/20 rounded-full blur-2xl -z-10 animate-pulse"></div>
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-3">
          Purchase Complete!
        </h1>

        <p className="text-lg text-gray-600 mb-8">
          You now have lifetime access to <span className="font-bold text-gray-900">{product.name}</span>
        </p>

        {/* Download Card */}
        <div className="bg-gradient-to-r from-primary-50 to-secondary-50 rounded-2xl p-6 mb-8 border-2 border-primary-200 relative overflow-hidden group hover:shadow-xl transition-shadow duration-300">
          <div className="absolute inset-0 bg-gradient-to-r from-primary-400/0 via-secondary-400/10 to-primary-400/0 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>

          <div className="relative">
            <FileText className="w-16 h-16 mx-auto mb-4 text-primary-600" />
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              Your Guide is Ready
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              Click below to download your {product.format} ({product.pages} pages)
            </p>

            {/* Download Button */}
            <button
              onClick={() => {
                // In production, this would link to the actual secure download
                alert('In production, this would download your file securely. For demo purposes, this is simulated.');
              }}
              className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-primary-600 to-secondary-600 text-white font-bold rounded-xl hover:from-primary-700 hover:to-secondary-700 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-primary-500/50"
            >
              <Download className="w-5 h-5" />
              Download Now
            </button>
          </div>
        </div>

        {/* Email Confirmation */}
        <div className="bg-gray-50 rounded-2xl p-6 mb-8 border border-gray-200">
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-gray-500 flex-shrink-0 mt-1" />
            <div className="text-left">
              <h3 className="font-bold text-gray-900 mb-1">Check Your Email</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                We've sent your download link and receipt to your email. Can't find it? Check your spam folder or{' '}
                <a href="mailto:cameron@insuredbycam.com" className="text-primary-600 hover:text-primary-700 font-semibold">
                  contact us
                </a>
                .
              </p>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="bg-white rounded-2xl p-6 mb-8 border border-gray-200 text-left">
          <h3 className="font-bold text-gray-900 mb-4">What's Next?</h3>
          <ul className="space-y-3 text-sm text-gray-700">
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xs">
                1
              </span>
              <span>Download your guide and save it somewhere safe</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xs">
                2
              </span>
              <span>Read through it (or jump to the sections you need most)</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xs">
                3
              </span>
              <span>Use the checklists and worksheets to review your own policy</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xs">
                4
              </span>
              <span>Have questions? Email Cameron anytime</span>
            </li>
          </ul>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/store"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all"
          >
            Browse More Guides
          </Link>
          <Link
            to="/quotes"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-600 to-secondary-600 text-white font-semibold rounded-xl hover:from-primary-700 hover:to-secondary-700 transition-all"
          >
            Get Insurance Quote
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Footer Note */}
        <p className="text-xs text-gray-500 mt-8">
          Your purchase is backed by our 30-day money-back guarantee.
          <br />
          Not happy? Email us for a full refund, no questions asked.
        </p>
      </div>
    </div>
  );
};

export default PurchaseSuccessPage;
