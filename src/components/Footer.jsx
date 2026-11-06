// src/components/Footer.jsx
import { T } from './SiteCopy';
import React from 'react';
import { rateCheckStart } from '../lib/rateCheckStart';
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
            <h3 className="text-xl font-bold mb-3">insuredbycam.com</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              <T k="components.footer.18ba05">Personal home and auto insurance quotes from Cameron, your exclusive Allstate agent in Georgia.</T>
            </p>
            <p className="text-gray-400 text-sm mt-2">
              <T k="components.footer.ea3a0d">Real data. Real savings. Real simple.</T>
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-lg font-semibold mb-3"><T k="components.footer.917bcf">Quick Links</T></h4>
            <ul className="space-y-2">
              <li>
                <Link to={rateCheckStart('footer')} className="text-gray-400 hover:text-white transition-colors text-sm">
                  <T k="components.footer.58d261">Check My Rate</T>
                </Link>
              </li>
              <li>
                <Link to="/courses" className="text-gray-400 hover:text-white transition-colors text-sm">
                  <T k="components.footer.c1a6f9">Drivers Education</T>
                </Link>
              </li>
              <li>
                <Link to="/news" className="text-gray-400 hover:text-white transition-colors text-sm">
                  <T k="components.footer.6c2dfe">Newsroom</T>
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact & Social */}
          <div>
            <h4 className="text-lg font-semibold mb-3"><T k="components.footer.56cddd">Get in Touch</T></h4>
            <ul className="space-y-2">
              <li>
                <a 
                  href="mailto:cameron@insuredbycam.com" 
                  className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-2"
                >
                  <T k="components.footer.073421">📧 contact@insuredbycam.com</T>
                </a>
              </li>
              <li>
                <a 
                  href="https://instagram.com/insuredbycam" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-2"
                >
                  <T k="components.footer.8b6429">📱 @insuredbycam</T>
                </a>
              </li>
              <li className="text-gray-400 text-sm flex items-center gap-2">
                <T k="components.footer.18650f">📍 Serving Georgia</T>
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
              <T k="components.footer.9db108">Privacy Policy</T>
            </Link>
            <span className="text-gray-600">•</span>
            <Link 
              to="/terms" 
              className="text-gray-400 hover:text-white transition-colors"
            >
              <T k="components.footer.0c8a9a">Terms of Service</T>
            </Link>
            <span className="text-gray-600">•</span>
            <a 
              href="mailto:cameron@insuredbycam.com" 
              className="text-gray-400 hover:text-white transition-colors"
            >
              <T k="components.footer.b37456">Contact</T>
            </a>
          </div>

          {/* Copyright */}
          <div className="text-center text-gray-500 text-sm">
            <p>© {currentYear} <T k="components.footer.47dbdd">insuredbycam. All rights reserved.</T></p>
            <p className="mt-1 text-xs">
              <T k="components.footer.12a209">Cameron is an exclusive agent for Allstate Insurance Company.</T>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;