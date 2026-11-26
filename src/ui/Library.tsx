import { useEffect, useMemo, useRef, useState } from 'react';
import { loadAll } from '../core/data';
import type { Settings } from '../core/settings';
import { downloadBlob, quoteAsMarkdown, slug } from '../core/share';
import type { FavoriteEntry, HistoryEntry, Store } from '../core/storage';
import { formatMinute } from '../core/time';
import type { DatasetMeta, Quote } from '../core/types';
import { filterQuotes } from '../core/selection';
import { Icon } from './icons';
import { QuoteText } from './QuoteView';
import { BRAND } from '../config/brand';

type Tab = 'favorites' | 'recent' | 'search' | 'authors' | 'works' | 'times';
const TABS: [Tab, string][] = [
  ['favorites', 'Favourites'],
  ['recent', 'Recent'],
  ['search', 'Search'],
  ['times', 'By time'],
  ['authors', 'Authors'],
  ['works', 'Works'],
];
const PAGE = 60;

interface Props {
  db: Promise<Store>;
  settings: Settings;
  favorites: Set<string>;
  onToggleFavorite: (q: Quote) => void;
  onShare: (q: Quote) => void;
  onClose: () => void;
  currentMinute: number;
}

function QuoteItem({ q, fav, onFav, onShare, hour12 }: { q: Quote; fav: boolean; onFav: () => void; onShare: () => void; hour12: boolean }) {
  return (
    <li className="qitem">
      <div className="qitem__time">
        {formatMinute(q.minute, hour12)}
        {q.meridiem === 'ambiguous' ? ' · either half of the day' : ''}
      </div>
      <p className="qitem__text">
        <QuoteText quote={q} />
      </p>
      <div className="qitem__attr">
        — {q.author}, <cite>{q.part ? `${q.part}, ${q.title}` : q.title}</cite>
        {q.year ? ` (${q.year})` : ''}
        {q.translator ? `, trans. ${q.translator}` : ''}
      </div>
      <div className="qitem__actions">
        <button className="icon-btn" aria-pressed={fav} aria-label={fav ? 'Remove from favourites' : 'Add to favourites'} onClick={onFav}>
          <Icon name="heart" />
        </button>
        <button className="icon-btn" aria-label="Share" onClick={onShare}>
          <Icon name="share" />
        </button>
      </div>
    </li>
  );
}

function Paged({ items, render }: { items: Quote[]; render: (q: Quote) => JSX.Element }) {
  const [n, setN] = useState(PAGE);
  useEffect(() => setN(PAGE), [items]);
  if (items.length === 0) return <p className="empty">Nothing here.</p>;
  return (
    <>
      <ul className="qlist">{items.slice(0, n).map(render)}</ul>
      {n < items.length ? (
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={() => setN(n + PAGE)}>
            Show more ({items.length - n} remaining)
          </button>
        </div>
      ) : null}
    </>
  );
}

export default function Library({ db, settings, favorites, onToggleFavorite, onShare, onClose, currentMinute }: Props) {
  const [tab, setTab] = useState<Tab>('favorites');
  const [all, setAll] = useState<{ meta: DatasetMeta; quotes: Quote[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [favs, setFavs] = useState<FavoriteEntry[]>([]);
  const [hist, setHist] = useState<HistoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [author, setAuthor] = useState<string | null>(null);
  const [work, setWork] = useState<string | null>(null);
  const [hour, setHour] = useState(Math.floor(currentMinute / 60));
  const [minute, setMinute] = useState(currentMinute);
  const [respectFilters, setRespectFilters] = useState(true);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    void db.then(async (s) => {
      setFavs(await s.listFavorites());
      setHist(await s.listHistory(200));
    });
  }, [db, favorites]);

  const needsAll = tab === 'search' || tab === 'authors' || tab === 'works' || tab === 'times';
  useEffect(() => {
    if (!needsAll || all) return;
    loadAll()
      .then(setAll)
      .catch(() => setLoadError(true));
  }, [needsAll, all]);

  const visible = useMemo(() => {
    if (!all) return [];
    if (!respectFilters) return all.quotes;
    // filterQuotes is per-minute; apply with each quote's own minute
    return all.quotes.filter((q) => filterQuotes([q], settings, q.minute).length === 1);
  }, [all, settings, respectFilters]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const terms = q.split(/\s+/);
    return visible.filter((x) => {
      const hay = `${x.text} ${x.author} ${x.title} ${x.part ?? ''}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [visible, query]);

  const authors = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of visible) m.set(q.author, (m.get(q.author) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  const works = useMemo(() => {
    const m = new Map<string, { title: string; author: string; n: number }>();
    for (const q of visible) {
      const k = `${q.title}\u0000${q.author}`;
      const e = m.get(k);
      if (e) e.n++;
      else m.set(k, { title: q.title, author: q.author, n: 1 });
    }
    return [...m.entries()].sort((a, b) => a[1].title.replace(/^(The|A|An) /, '').localeCompare(b[1].title.replace(/^(The|A|An) /, '')));
  }, [visible]);

  const perMinute = useMemo(() => {
    const c = new Array(1440).fill(0);
    for (const q of visible) c[q.minute]++;
    return c as number[];
  }, [visible]);

  const item = (q: Quote) => (
    <QuoteItem
      key={`${q.id}-${q.minute}`}
      q={q}
      fav={favorites.has(q.id)}
      onFav={() => onToggleFavorite(q)}
      onShare={() => onShare(q)}
      hour12={settings.hour12}
    />
  );

  const exportFavorites = (fmt: 'json' | 'md') => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (fmt === 'json') {
      const body = JSON.stringify({ app: BRAND.name, exportedAt: new Date().toISOString(), favorites: favs }, null, 2);
      downloadBlob(new Blob([body], { type: 'application/json' }), `${slug(BRAND.name)}-favourites-${stamp}.json`);
    } else {
      const body = `# Favourite quotations — ${BRAND.name}\n\n${favs
        .map((f) => `## ${formatMinute(f.quote.minute, settings.hour12)}\n\n${quoteAsMarkdown(f.quote)}`)
        .join('\n')}`;
      downloadBlob(new Blob([body], { type: 'text/markdown' }), `${slug(BRAND.name)}-favourites-${stamp}.md`);
    }
  };

  const loading = needsAll && !all && !loadError;

  return (
    <section className="sheet" aria-labelledby="library-title">
      <header className="sheet__head">
        <button className="icon-btn" onClick={onClose} aria-label="Back to the clock">
          <Icon name="back" />
        </button>
        <h1 className="sheet__title" id="library-title" tabIndex={-1} ref={heading}>
          Library
        </h1>
      </header>
      <div className="tabs" role="tablist" aria-label="Library sections">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} aria-controls="library-panel" id={`tab-${id}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="sheet__body" role="tabpanel" id="library-panel" aria-labelledby={`tab-${tab}`}>
        <div>
          {loading ? <p className="empty">Opening the stacks…</p> : null}
          {loadError ? <p className="empty">The full library isn’t available offline yet. Connect once to finish downloading it.</p> : null}

          {tab === 'favorites' ? (
            <>
              {favs.length ? (
                <div className="btn-row">
                  <button className="btn" onClick={() => exportFavorites('md')}>Export as Markdown</button>
                  <button className="btn" onClick={() => exportFavorites('json')}>Export as JSON</button>
                </div>
              ) : null}
              {favs.length === 0 ? (
                <p className="empty">No favourites yet. Tap the clock, then the heart, to keep a quotation.</p>
              ) : (
                <ul className="qlist">{favs.map((f) => item(f.quote))}</ul>
              )}
            </>
          ) : null}

          {tab === 'recent' ? (
            hist.length === 0 ? (
              <p className="empty">Quotations you have seen will appear here.</p>
            ) : (
              <ul className="qlist">
                {hist.map((h) => (
                  <QuoteItem
                    key={h.key}
                    q={h.quote}
                    fav={favorites.has(h.id)}
                    onFav={() => onToggleFavorite(h.quote)}
                    onShare={() => onShare(h.quote)}
                    hour12={settings.hour12}
                  />
                ))}
              </ul>
            )
          ) : null}

          {needsAll && all ? (
            <label className="row">
              <span className="row__label">
                Apply my reading preferences
                <small>Hide quotations your content settings exclude from the clock.</small>
              </span>
              <input type="checkbox" className="switch" checked={respectFilters} onChange={(e) => setRespectFilters(e.target.checked)} />
            </label>
          ) : null}

          {tab === 'search' && all ? (
            <>
              <input
                className="search"
                type="search"
                placeholder="Search words, authors, titles…"
                aria-label="Search the quotation library"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              <p className="hint" aria-live="polite">
                {query.trim().length >= 2 ? `${searchResults.length} quotation${searchResults.length === 1 ? '' : 's'}` : `${visible.length.toLocaleString()} quotations to search`}
              </p>
              <Paged items={searchResults} render={item} />
            </>
          ) : null}

          {tab === 'authors' && all ? (
            author ? (
              <>
                <div className="btn-row">
                  <button className="btn btn--quiet" onClick={() => setAuthor(null)}>← All authors</button>
                </div>
                <h2 style={{ fontWeight: 500 }}>{author}</h2>
                <Paged items={visible.filter((q) => q.author === author)} render={item} />
              </>
            ) : (
              <ul className="index-list">
                {authors.map(([a, n]) => (
                  <li key={a}>
                    <button onClick={() => setAuthor(a)}>
                      <span>{a}</span>
                      <span className="count">{n}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {tab === 'works' && all ? (
            work ? (
              <>
                <div className="btn-row">
                  <button className="btn btn--quiet" onClick={() => setWork(null)}>← All works</button>
                </div>
                <h2 style={{ fontWeight: 500, fontStyle: 'italic' }}>{work.split('\u0000')[0]}</h2>
                <Paged items={visible.filter((q) => `${q.title}\u0000${q.author}` === work)} render={item} />
              </>
            ) : (
              <ul className="index-list">
                {works.map(([k, w]) => (
                  <li key={k}>
                    <button onClick={() => setWork(k)}>
                      <span>
                        <i>{w.title}</i> <span className="count">· {w.author}</span>
                      </span>
                      <span className="count">{w.n}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {tab === 'times' && all ? (
            <>
              <div className="row">
                <label htmlFor="preview-time" className="row__label">
                  Preview any time
                  <small>See every quotation for a minute of your choosing.</small>
                </label>
                <input
                  id="preview-time"
                  type="time"
                  value={`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(':').map(Number);
                    if (Number.isFinite(h) && Number.isFinite(m)) {
                      setHour(h);
                      setMinute(h * 60 + m);
                    }
                  }}
                />
              </div>
              <div className="hours" role="group" aria-label="Hour">
                {Array.from({ length: 24 }, (_, h) => (
                  <button key={h} aria-pressed={hour === h} onClick={() => { setHour(h); setMinute(h * 60 + (minute % 60)); }}>
                    {formatMinute(h * 60, settings.hour12).replace(':00', '')}
                  </button>
                ))}
              </div>
              <div className="minute-grid" role="group" aria-label={`Minutes of ${formatMinute(hour * 60, settings.hour12)}`}>
                {Array.from({ length: 60 }, (_, m) => {
                  const mm = hour * 60 + m;
                  const n = perMinute[mm];
                  return (
                    <button
                      key={m}
                      aria-pressed={minute === mm}
                      data-empty={n === 0}
                      style={{ ['--d' as string]: Math.min(26, n * 2) }}
                      aria-label={`${formatMinute(mm, settings.hour12)}: ${n} quotation${n === 1 ? '' : 's'}`}
                      onClick={() => setMinute(mm)}
                    >
                      :{String(m).padStart(2, '0')}
                    </button>
                  );
                })}
              </div>
              <h2 style={{ fontWeight: 500 }}>
                {formatMinute(minute, settings.hour12)} <span className="count hint" style={{ display: 'inline' }}>· {perMinute[minute]} quotation{perMinute[minute] === 1 ? '' : 's'}</span>
              </h2>
              <Paged items={visible.filter((q) => q.minute === minute)} render={item} />
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
