import { memo, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { Quote } from '../core/types';
import type { Settings } from '../core/settings';

export function QuoteText({ quote }: { quote: Quote }) {
  const { text, phraseStart: s, phraseEnd: e } = quote;
  const valid = s >= 0 && e > s && e <= text.length;
  if (!valid) return <>{text}</>;
  return (
    <>
      {text.slice(0, s)}
      <mark className="tp">{text.slice(s, e)}</mark>
      {text.slice(e)}
    </>
  );
}

export function attributionLine(q: Quote): string {
  const title = q.part ? `${q.part} (${q.title})` : q.title;
  return `${q.author}, ${title}${q.year ? `, ${q.year}` : ''}${q.translator ? `, trans. ${q.translator}` : ''}`;
}

export function Attribution({ quote }: { quote: Quote }) {
  return (
    <figcaption className="quote__attr">
      <span className="quote__author">{quote.author}</span>
      <cite className="quote__title">
        {quote.part ? (
          <>
            {quote.part}
            <span className="quote__part">, from </span>
            {quote.title}
          </>
        ) : (
          quote.title
        )}
      </cite>
      {quote.translator ? <span className="sr-only">Translated by {quote.translator}.</span> : null}
    </figcaption>
  );
}

/**
 * Binary-searches the largest font size at which the content fits the box with
 * no overflow. Re-fits on resize, orientation change, font load and content change.
 */
export const FitBox = memo(function FitBox({
  children,
  scale,
  fitKey,
  attrRatio = 0.46,
  maxPx = 120,
}: {
  children: ReactNode;
  scale: number;
  fitKey: string;
  attrRatio?: number;
  maxPx?: number;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content) return;
    let raf = 0;
    const fit = () => {
      const W = box.clientWidth;
      const H = box.clientHeight;
      if (!W || !H) return;
      const apply = (px: number) => {
        content.style.setProperty('--qsize', `${px}px`);
        content.style.setProperty('--asize', `${Math.max(12, Math.min(26, px * attrRatio))}px`);
      };
      const fits = () => content.scrollHeight <= H + 0.5 && content.scrollWidth <= W + 0.5;
      let lo = 11;
      let hi = Math.max(lo, Math.min(maxPx, W / 7.5, H / 3.2) * scale);
      apply(hi);
      if (!fits()) {
        for (let i = 0; i < 14 && hi - lo > 0.5; i++) {
          const mid = (lo + hi) / 2;
          apply(mid);
          if (fits()) lo = mid;
          else hi = mid;
        }
        apply(Math.floor(lo * 2) / 2);
      }
      content.dataset.fitted = 'true';
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    ro?.observe(box);
    window.addEventListener('orientationchange', schedule);
    document.fonts?.ready.then(schedule).catch(() => undefined);
    document.fonts?.addEventListener?.('loadingdone', schedule);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('orientationchange', schedule);
      document.fonts?.removeEventListener?.('loadingdone', schedule);
    };
  }, [fitKey, scale, attrRatio, maxPx]);

  return (
    <div ref={outer} className="fitbox" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}>
      <div ref={inner} style={{ width: '100%' }}>
        {children}
      </div>
    </div>
  );
});

export function QuoteFigure({ quote, settings }: { quote: Quote; settings: Settings }) {
  const showAttr = settings.showAttribution && settings.displayMode !== 'minimal';
  return (
    <figure className="quote" lang="en">
      <blockquote className="quote__text" data-align={settings.alignment}>
        <QuoteText quote={quote} />
      </blockquote>
      {showAttr ? <Attribution quote={quote} /> : null}
    </figure>
  );
}
