// src/components/Footer.jsx
import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-900 text-white py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          
          {/* Brand */}
          <div>
            <h3 className="text-xl font-bold mb-3">insuredbycam</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Personal auto insurance quotes from Cameron, your exclusive Allstate agent in Georgia.
            </p>
            <p className="text-gray-400 text-sm mt-2">
              Real data. Real savings. Real simple.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-lg font-semibold mb-3">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/quotes" className="text-gray-400 hover:text-white transition-colors text-sm">
                  Insurance Quotes
                </Link>
              </li>
              <li>
                <Link to="/=courses" className="text-gray-400 hover:text-white transition-colors text-sm">
                  Drivers Education
                </Link>
              </li>
              <li>
                <Link to="/store" className="text-gray-400 hover:text-white transition-colors text-sm">
                  Online Store
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact & Social */}
          <div>
            <h4 className="text-lg font-semibold mb-3">Get in Touch</h4>
            <ul className="space-y-2">
              <li>
                <a 
                  href="mailto:cameron@insuredbycam.com" 
                  className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-2"
                >
                  📧 cameron@insuredbycam.com
                </a>
              </li>
              <li>
                <a 
                  href="https://instagram.com/insuredbycam" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-2"
                >
                  📱 @insuredbycam
                </a>
              </li>
              <li className="text-gray-400 text-sm flex items-center gap-2">
                📍 Serving Georgia
              </li>
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-800 pt-6">
          {/* Legal Links */}
          <div className="flex flex-wrap justify-center gap-4 mb-4 text-sm">
            <Link 
              to="/privacy" 
              className="text-gray-400 hover:text-white transition-colors"
            >
              Privacy Policy
            </Link>
            <span className="text-gray-600">•</span>
            <Link 
              to="/terms" 
              className="text-gray-400 hover:text-white transition-colors"
            >
              Terms of Service
            </Link>
            <span className="text-gray-600">•</span>
            <a 
              href="mailto:cameron@insuredbycam.com" 
              className="text-gray-400 hover:text-white transition-colors"
            >
              Contact
            </a>
          </div>

          {/* Copyright */}
          <div className="text-center text-gray-500 text-sm">
            <p>© {currentYear} insuredbycam. All rights reserved.</p>
            <p className="mt-1 text-xs">
              Cameron is an exclusive agent for Allstate Insurance Company.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;