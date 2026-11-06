// src/pages/components/EducationPreview.jsx
import { T } from '../../components/SiteCopy';
import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, AlertCircle, Shield, TrendingDown } from 'lucide-react';

const EducationPreview = () => {
  const guides = [
    {
      icon: AlertCircle,
      title: "3 Coverage Mistakes Almost Everyone Makes",
      description: "Why your liability limit could leave you exposed, even if you're 'fully covered'",
      readTime: "4 min read",
      tag: "Risk Management",
      color: "from-red-500 to-orange-500"
    },
    {
      icon: TrendingDown,
      title: "Why Cheaper Insurance Can Cost More Later",
      description: "What discount carriers don't tell you about claims handling and coverage gaps",
      readTime: "5 min read",
      tag: "Smart Shopping",
      color: "from-primary-500 to-indigo-500"
    },
    {
      icon: Shield,
      title: "What Agents Don't Explain (But Should)",
      description: "Understanding deductibles, declarations pages, and what you're actually paying for",
      readTime: "6 min read",
      tag: "Insurance 101",
      color: "from-emerald-500 to-teal-500"
    }
  ];

  return (
    <section className="py-20 px-4 relative z-10">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full border border-white/20">
            <BookOpen className="w-4 h-4 text-accent-300" />
            <span className="text-sm font-semibold text-white/90"><T k="pages.components.educationpreview.1c9ce4">Insurance Education</T></span>
          </div>

          <h2 className="text-4xl md:text-5xl font-black text-white mb-6 leading-tight">
            <T k="pages.components.educationpreview.0398cc">Understand What You're</T>
            <br />
            <span className="bg-gradient-to-r from-accent-300 via-accent-400 to-accent-500 bg-clip-text text-transparent">
              <T k="pages.components.educationpreview.6e8995">Actually Buying</T>
            </span>
          </h2>

          <p className="text-xl text-white/80 max-w-2xl mx-auto leading-relaxed">
            <T k="pages.components.educationpreview.5be47e">Most people overpay because they don't know what questions to ask. Here's what really matters.</T>
          </p>
        </div>

        {/* Guide Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {guides.map((guide, index) => (
            <div
              key={index}
              className="group relative bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-white/30 transition-all duration-300 hover:transform hover:scale-[1.02] cursor-pointer"
            >
              {/* Gradient Glow on Hover */}
              <div className={`absolute -inset-0.5 bg-gradient-to-r ${guide.color} rounded-2xl opacity-0 group-hover:opacity-20 blur transition duration-300`}></div>

              {/* Content */}
              <div className="relative">
                {/* Tag */}
                <div className="mb-4">
                  <span className="text-xs font-semibold text-accent-300 uppercase tracking-wider">
                    {guide.tag}
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-xl font-bold text-white mb-4 leading-tight group-hover:text-accent-300 transition-colors">
                  <T>{guide.title}</T>
                </h3>

                {/* Description */}
                <p className="text-sm text-white/70 mb-6 leading-relaxed">
                  <T>{guide.description}</T>
                </p>

                {/* Read Time */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/50">{guide.readTime}</span>
                  <span className="text-accent-400 text-sm font-semibold group-hover:translate-x-1 transition-transform">
                    <T k="pages.components.educationpreview.4e13bd">Read →</T>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA to Store */}
        <div className="text-center">
          <div className="inline-block bg-gradient-to-r from-white/5 to-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
            <p className="text-white/90 mb-4 text-lg">
              <T k="pages.components.educationpreview.42b136">Want the full breakdown? Get the complete guide.</T>
            </p>
            <Link
              to="/store"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-accent-500 to-accent-600 text-white font-bold rounded-xl hover:from-accent-600 hover:to-accent-700 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-accent-500/50"
            >
              <BookOpen className="w-5 h-5" />
              <T k="pages.components.educationpreview.5e2d8d">Browse Insurance Guides</T>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default EducationPreview;
