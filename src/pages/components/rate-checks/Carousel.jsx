// src/pages/components/rate-checks/Carousel.jsx
// Swipeable cards for the top of the Rate Check drawer (household, decision,
// price): one card at a time on a phone, dots underneath. Each slide brings its
// own card chrome; the track only lays them out and hides its scrollbar.

import { useRef, useState } from 'react';

export default function Carousel({ slides, label }) {
  const track = useRef(null);
  const [active, setActive] = useState(0);
  const many = slides.length > 1;

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const kids = [...el.children];
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) { setActive(kids.length - 1); return; }
    let best = 0;
    kids.forEach((k, i) => { if (Math.abs(k.offsetLeft - el.scrollLeft) < Math.abs(kids[best].offsetLeft - el.scrollLeft)) best = i; });
    setActive(best);
  };
  const go = (i) => {
    const el = track.current;
    const kid = el?.children[i];
    if (kid) el.scrollTo({ left: kid.offsetLeft - el.offsetLeft, behavior: 'smooth' });
    setActive(i);
  };

  return (
    <section aria-roledescription="carousel" aria-label={label}>
      <style>{'.rc-drawer-track{scrollbar-width:none}.rc-drawer-track::-webkit-scrollbar{display:none}'}</style>
      <div ref={track} onScroll={onScroll}
        className="rc-drawer-track flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-5 scroll-px-5">
        {slides.map((s, i) => (
          <div key={s.key} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}: ${s.label}`}
            className={`${many ? 'w-[88%]' : 'w-full'} flex shrink-0 snap-start [&>*]:w-full`}>
            {s.content}
          </div>
        ))}
      </div>
      {many && (
        <div className="mt-1 flex justify-center">
          {slides.map((s, i) => (
            <button key={s.key} type="button" onClick={() => go(i)} aria-label={`Show ${s.label}`} aria-current={i === active}
              className="flex h-8 items-center px-1">
              <span className="block h-1.5 rounded-full transition-all"
                style={{ width: i === active ? 20 : 6, background: i === active ? 'var(--qs-bright)' : 'var(--qs-border)' }} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
