// src/pages/components/rate-checks/Carousel.jsx
// Swipeable cards for the top of the Rate Check drawer (household, decision,
// price): one card at a time on a phone, dots underneath. Each slide brings its
// own card chrome; the track only lays them out and hides its scrollbar. Cards are
// centered with the same gutter on both sides, so the neighbours peek in evenly.

import { useRef, useState } from 'react';

export default function Carousel({ slides, label }) {
  const track = useRef(null);
  const [active, setActive] = useState(0);
  const many = slides.length > 1;

  // Where the track must scroll for a card to sit in the middle.
  const centerOf = (el, kid) => kid.offsetLeft - el.offsetLeft - (el.clientWidth - kid.offsetWidth) / 2;
  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const kids = [...el.children];
    let best = 0;
    kids.forEach((k, i) => { if (Math.abs(centerOf(el, k) - el.scrollLeft) < Math.abs(centerOf(el, kids[best]) - el.scrollLeft)) best = i; });
    setActive(best);
  };
  const go = (i) => {
    const el = track.current;
    const kid = el?.children[i];
    if (kid) el.scrollTo({ left: centerOf(el, kid), behavior: 'smooth' });
    setActive(i);
  };

  return (
    <section aria-roledescription="carousel" aria-label={label}>
      <style>{'.rc-drawer-track{scrollbar-width:none}.rc-drawer-track::-webkit-scrollbar{display:none}'}</style>
      <div ref={track} onScroll={onScroll}
        className={`rc-drawer-track flex snap-x snap-mandatory items-start gap-3 overflow-x-auto ${many ? 'px-10' : 'px-5'}`}>
        {slides.map((s, i) => (
          <div key={s.key} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}: ${s.label}`}
            className="flex w-full shrink-0 snap-center [&>*]:w-full">
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
