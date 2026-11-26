import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BRAND } from '../config/brand';
import type { QuoteStore } from '../core/data';
import type { ClockEngine } from '../core/engine';
import {
  DEFAULT_SETTINGS, clearSettings, sanitizeSettings,
  type Alignment, type DisplayMode, type FontId, type HighlightStyle, type NightMode, type Settings,
} from '../core/settings';
import { downloadBlob, slug } from '../core/share';
import type { Store } from '../core/storage';
import { THEMES, THEME_ORDER, resolveTheme, type ThemeId } from '../core/themes';
import { formatMinute } from '../core/time';
import { CONTENT_FLAGS, type ContentFlag, type DatasetMeta } from '../core/types';
import type { WakeLockStatus } from '../hooks/hooks';
import { isIOS, isStandalone, useMediaQuery } from '../hooks/hooks';
import { FONT_NAMES, FONT_STACKS } from './fonts';
import { Icon } from './icons';

interface Props {
  settings: Settings;
  update: (p: Partial<Settings> | ((s: Settings) => Settings)) => void;
  replace: (s: Settings) => void;
  db: Promise<Store>;
  store: QuoteStore;
  engine: ClockEngine;
  wakeStatus: WakeLockStatus;
  initialSection?: string;
  onClose: () => void;
}

const FLAG_LABELS: Record<ContentFlag, string> = {
  slur: 'Racial and ethnic slurs',
  profanity: 'Profanity and oaths',
  sexual: 'Sexual or suggestive content',
  violence: 'Violence and death',
  drugs: 'Drugs and intoxicants',
};

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="row">
      <span className="row__label">
        {label}
        {hint ? <small>{hint}</small> : null}
      </span>
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function Select<T extends string | number>({ label, hint, value, options, onChange }: {
  label: string; hint?: string; value: T; options: [T, string][]; onChange: (v: T) => void;
}) {
  const id = `sel-${slug(label)}`;
  return (
    <div className="row">
      <label htmlFor={id} className="row__label">
        {label}
        {hint ? <small>{hint}</small> : null}
      </label>
      <select id={id} value={String(value)} onChange={(e) => onChange(options.find(([v]) => String(v) === e.target.value)![0])}>
        {options.map(([v, l]) => (
          <option key={String(v)} value={String(v)}>{l}</option>
        ))}
      </select>
    </div>
  );
}

function ColorRow({ label, value, fallback, onChange }: { label: string; value: string | null; fallback: string; onChange: (v: string | null) => void }) {
  const id = `col-${slug(label)}`;
  return (
    <div className="row">
      <label htmlFor={id} className="row__label">
        {label}
        <small>{value ? 'Custom' : 'From theme'}</small>
      </label>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {value ? <button className="btn btn--quiet" onClick={() => onChange(null)}>Reset</button> : null}
        <input id={id} type="color" value={value ?? fallback} onChange={(e) => onChange(e.target.value)} />
      </span>
    </div>
  );
}

function ThemePreview({ id, selected, onSelect, prefersDark }: { id: ThemeId; selected: boolean; onSelect: () => void; prefersDark: boolean }) {
  const p = resolveTheme(id, prefersDark);
  const name = id === 'system' ? 'System' : THEMES[id].name;
  return (
    <button className="theme-swatch" aria-pressed={selected} onClick={onSelect} style={{ background: p.bg, color: p.text, borderColor: p.rule }}>
      <span className="theme-swatch__sample">
        It was <b style={{ color: p.highlight }}>half past nine</b>, and the lamps were lit.
      </span>
      <span className="theme-swatch__name" style={{ color: p.muted }}>
        {name}
        {id === 'system' ? ' · follows device' : ''}
      </span>
    </button>
  );
}

export default function SettingsPanel({ settings: s, update, replace, db, store, engine, wakeStatus, initialSection, onClose }: Props) {
  const [meta, setMeta] = useState<DatasetMeta | null>(null);
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const palette = resolveTheme(s.theme, prefersDark);

  useEffect(() => {
    void store.meta().then(setMeta).catch(() => undefined);
  }, [store]);

  useEffect(() => {
    if (initialSection) document.getElementById(`settings-${initialSection}`)?.scrollIntoView();
    else heading.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [initialSection, onClose]);

  const say = (t: string) => {
    setNotice(t);
    setTimeout(() => setNotice(''), 4000);
  };

  const exportPrefs = () => {
    const body = JSON.stringify({ app: BRAND.name, kind: 'preferences', exportedAt: new Date().toISOString(), settings: s }, null, 2);
    downloadBlob(new Blob([body], { type: 'application/json' }), `${slug(BRAND.name)}-preferences.json`);
  };

  const importPrefs = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      replace(sanitizeSettings(json.settings ?? json));
      say('Preferences imported.');
    } catch {
      say('That file could not be read as exported preferences.');
    }
  };

  const covered = meta ? meta.counts.filter((c) => c > 0).length : 0;
  const ios = isIOS();
  const standalone = isStandalone();

  const wakeText: Record<WakeLockStatus, string> = {
    off: 'Off.',
    active: 'Active — the screen will stay on while the clock is visible.',
    released: 'Released by the system; it will be requested again when the clock is visible.',
    denied: 'The browser declined the request (often due to Low Power Mode or battery saver).',
    unsupported: 'This browser does not support the Screen Wake Lock API. Use your device’s Auto-Lock / screen timeout setting instead.',
  };

  return (
    <section className="sheet" aria-labelledby="settings-title">
      <header className="sheet__head">
        <button className="icon-btn" onClick={onClose} aria-label="Back to the clock">
          <Icon name="back" />
        </button>
        <h1 className="sheet__title" id="settings-title" tabIndex={-1} ref={heading}>
          Settings
        </h1>
      </header>
      <div className="sheet__body">
        <div>
          <p className="hint" role="status" aria-live="polite" style={{ minHeight: '1.4em' }}>{notice}</p>

          <div className="section" id="settings-appearance">
            <h2>Theme</h2>
            <div className="theme-grid">
              {THEME_ORDER.map((id) => (
                <ThemePreview key={id} id={id} prefersDark={prefersDark} selected={s.theme === id} onSelect={() => update({ theme: id })} />
              ))}
            </div>
          </div>

          <div className="section">
            <h2>Typography</h2>
            <div className="preview-box" style={{ fontFamily: FONT_STACKS[s.font], fontWeight: s.fontWeight, textAlign: s.alignment }}>
              <span className={`hl-${s.highlightStyle}`} style={{ fontSize: 22 * s.fontScale, lineHeight: 1.35 }}>
                “I shall be back by <mark className="tp">a quarter to seven</mark>,” said he, and was gone.
              </span>
            </div>
            <Select<FontId> label="Typeface" value={s.font} onChange={(font) => update({ font })} options={(Object.keys(FONT_NAMES) as FontId[]).map((f) => [f, FONT_NAMES[f]])} />
            <div className="row">
              <label htmlFor="font-scale" className="row__label">
                Text size
                <small>Quotations are fitted to the screen automatically; this scales the result ({Math.round(s.fontScale * 100)}%).</small>
              </label>
              <input id="font-scale" type="range" min={0.6} max={1.2} step={0.05} value={s.fontScale} onChange={(e) => update({ fontScale: Number(e.target.value) })} />
            </div>
            <Select<Settings['fontWeight']> label="Weight" value={s.fontWeight} onChange={(fontWeight) => update({ fontWeight })} options={[[300, 'Light'], [400, 'Regular'], [500, 'Medium']]} />
            <Select<Alignment> label="Alignment" value={s.alignment} onChange={(alignment) => update({ alignment })} options={[['left', 'Left'], ['center', 'Centred'], ['justify', 'Justified']]} />
            <Select<HighlightStyle>
              label="Time phrase style"
              value={s.highlightStyle}
              onChange={(highlightStyle) => update({ highlightStyle })}
              options={[['bold', 'Bold'], ['bold-color', 'Bold, highlight colour'], ['underline', 'Underlined'], ['marker', 'Marker'], ['small-caps', 'Small capitals']]}
            />
            <ColorRow label="Background colour" value={s.customBg} fallback={palette.bg} onChange={(customBg) => update({ customBg })} />
            <ColorRow label="Text colour" value={s.customText} fallback={palette.text} onChange={(customText) => update({ customText })} />
            <ColorRow label="Highlight colour" value={s.customHighlight} fallback={palette.highlight} onChange={(customHighlight) => update({ customHighlight })} />
          </div>

          <div className="section" id="settings-clock">
            <h2>Clock</h2>
            <Select<DisplayMode>
              label="Display mode"
              hint="Bedside dims the screen and enlarges the time; Minimal shows only the quotation."
              value={s.displayMode}
              onChange={(displayMode) => update({ displayMode })}
              options={[['standard', 'Standard'], ['bedside', 'Bedside'], ['minimal', 'Minimal']]}
            />
            <Toggle label="Show numerical time" checked={s.showClock} onChange={(showClock) => update({ showClock })} />
            <Toggle label="24-hour time" checked={!s.hour12} onChange={(v) => update({ hour12: !v })} />
            <Toggle label="Show seconds" checked={s.showSeconds} onChange={(showSeconds) => update({ showSeconds })} />
            <Toggle label="Show date" checked={s.showDate} onChange={(showDate) => update({ showDate })} />
            <Toggle label="Show author and title" checked={s.showAttribution} onChange={(showAttribution) => update({ showAttribution })} />
            <Select<number>
              label="Hide controls after"
              value={s.autoHideSeconds}
              onChange={(autoHideSeconds) => update({ autoHideSeconds })}
              options={[[3, '3 seconds'], [4, '4 seconds'], [6, '6 seconds'], [10, '10 seconds'], [20, '20 seconds']]}
            />
            <Select<Settings['reduceMotion']>
              label="Reduce motion"
              value={s.reduceMotion}
              onChange={(reduceMotion) => update({ reduceMotion })}
              options={[['system', 'Follow device'], ['on', 'Always'], ['off', 'Never']]}
            />
          </div>

          <div className="section" id="settings-display">
            <h2>Always-on display</h2>
            <Toggle
              label="Keep screen awake"
              hint={s.wakeLock ? wakeText[wakeStatus] : 'Uses the Screen Wake Lock API while the clock is on screen. It cannot prevent the device from locking when you leave the app.'}
              checked={s.wakeLock}
              onChange={(wakeLock) => update({ wakeLock })}
            />
            <Toggle label="Burn-in protection" hint="Moves the text a few pixels every few minutes — useful on OLED screens." checked={s.burnInShift} onChange={(burnInShift) => update({ burnInShift })} />
            <Select<NightMode>
              label="Night mode"
              hint="Lowers apparent brightness beyond the system minimum."
              value={s.nightMode}
              onChange={(nightMode) => update({ nightMode })}
              options={[['off', 'Off'], ['on', 'On'], ['scheduled', 'At night (schedule below)']]}
            />
            <div className="row">
              <label htmlFor="night-dim" className="row__label">
                Night brightness
                <small>{Math.round(s.nightDim * 100)}%</small>
              </label>
              <input id="night-dim" type="range" min={0.2} max={0.9} step={0.05} value={s.nightDim} onChange={(e) => update({ nightDim: Number(e.target.value) })} />
            </div>
          </div>

          <div className="section" id="settings-schedule">
            <h2>Theme schedule</h2>
            <Toggle
              label="Switch themes by time of day"
              checked={s.themeSchedule.enabled}
              onChange={(enabled) => update({ themeSchedule: { ...s.themeSchedule, enabled } })}
            />
            <Select<ThemeId>
              label="Day theme"
              value={s.themeSchedule.dayTheme}
              onChange={(dayTheme) => update({ themeSchedule: { ...s.themeSchedule, dayTheme } })}
              options={THEME_ORDER.map((t) => [t, t === 'system' ? 'System' : THEMES[t].name])}
            />
            <Select<ThemeId>
              label="Night theme"
              value={s.themeSchedule.nightTheme}
              onChange={(nightTheme) => update({ themeSchedule: { ...s.themeSchedule, nightTheme } })}
              options={THEME_ORDER.map((t) => [t, t === 'system' ? 'System' : THEMES[t].name])}
            />
            <div className="row">
              <label htmlFor="day-start" className="row__label">Day begins</label>
              <input id="day-start" type="time" value={s.themeSchedule.dayStart} onChange={(e) => e.target.value && update({ themeSchedule: { ...s.themeSchedule, dayStart: e.target.value } })} />
            </div>
            <div className="row">
              <label htmlFor="night-start" className="row__label">Night begins<small>Also used by scheduled night mode.</small></label>
              <input id="night-start" type="time" value={s.themeSchedule.nightStart} onChange={(e) => e.target.value && update({ themeSchedule: { ...s.themeSchedule, nightStart: e.target.value } })} />
            </div>
          </div>

          <div className="section" id="settings-content">
            <h2>Reading preferences</h2>
            <Toggle
              label="Family-friendly"
              hint="Hides every quotation flagged for slurs, profanity, sexual content, violence or drugs. Flags come from automated word lists, so they are cautious rather than perfect."
              checked={s.familyFriendly}
              onChange={(familyFriendly) => update({ familyFriendly })}
            />
            {!s.familyFriendly
              ? CONTENT_FLAGS.map((f) => (
                  <Toggle
                    key={f}
                    label={`Hide: ${FLAG_LABELS[f]}`}
                    checked={s.excludedFlags.includes(f)}
                    onChange={(v) => update({ excludedFlags: v ? [...s.excludedFlags, f] : s.excludedFlags.filter((x) => x !== f) })}
                  />
                ))
              : null}
            <Toggle
              label="Allow quotations that don’t say AM or PM"
              hint="“Three o’clock” can be read at 3:00 AM and 3:00 PM. Turn off to see only quotations whose time of day is explicit (fewer minutes will have a quotation)."
              checked={s.allowAmbiguous}
              onChange={(allowAmbiguous) => update({ allowAmbiguous })}
            />
            <Toggle label="Allow approximate times" hint="e.g. “nearly six o’clock”, “just after midnight”." checked={s.allowApproximate} onChange={(allowApproximate) => update({ allowApproximate })} />
            <Toggle label="Include translations" checked={s.includeTranslations} onChange={(includeTranslations) => update({ includeTranslations })} />
            <Select<number>
              label="Longest quotation"
              value={s.maxLength ?? 0}
              onChange={(v) => update({ maxLength: v === 0 ? null : v })}
              options={[[0, 'No limit'], [400, 'About 400 characters'], [250, 'About 250 characters'], [160, 'Short only (160)']]}
            />
          </div>

          <div className="section" id="settings-rotation">
            <h2>Repetition</h2>
            <Select<Settings['repeatMode']>
              label="Choosing quotations"
              hint="“No repeats” shows every eligible quotation for a minute before any appears again, remembered across sessions."
              value={s.repeatMode}
              onChange={(repeatMode) => update({ repeatMode })}
              options={[['exhaust', 'No repeats until all are shown'], ['random', 'Fully random']]}
            />
            <div className="btn-row">
              <button className="btn" onClick={() => void engine.resetRotation().then(() => say('Rotation memory cleared.'))}>Forget what I’ve seen</button>
            </div>
          </div>

          <div className="section" id="settings-history">
            <h2>History &amp; data</h2>
            <p className="hint">Your history, favourites and preferences are stored only on this device. Nothing is sent anywhere.</p>
            <div className="btn-row">
              <button className="btn" onClick={() => void db.then((d) => d.clearHistory()).then(() => say('History cleared.'))}>Clear history</button>
              <button className="btn" onClick={exportPrefs}>Export preferences</button>
              <button className="btn" onClick={() => fileInput.current?.click()}>Import preferences</button>
              <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void importPrefs(e.target.files[0])} />
            </div>
            <div className="btn-row">
              <button className="btn" onClick={() => { clearSettings(); replace({ ...DEFAULT_SETTINGS }); say('Settings restored to defaults.'); }}>
                Reset settings
              </button>
              <button
                className="btn"
                onClick={() => {
                  if (!confirm('Erase favourites, history and settings on this device?')) return;
                  void db.then((d) => d.clearAll()).then(() => {
                    clearSettings();
                    replace({ ...DEFAULT_SETTINGS });
                    location.reload();
                  });
                }}
              >
                Erase everything
              </button>
            </div>
          </div>

          <div className="section" id="settings-install">
            <h2>Install</h2>
            {standalone ? (
              <p>{BRAND.name} is installed and running as an app.</p>
            ) : ios ? (
              <ol className="prose">
                <li>Open this page in <b>Safari</b>.</li>
                <li>Tap the <b>Share</b> button (the square with an arrow).</li>
                <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
                <li>Open {BRAND.shortName} from your Home Screen. It works offline from then on.</li>
              </ol>
            ) : (
              <p className="prose">Use your browser’s <b>Install app</b> or <b>Add to Home screen</b> menu item. Once installed, the clock works without a connection.</p>
            )}
            <p className="hint">
              For a desk or bedside clock on iPhone or iPad, set <b>Settings → Display &amp; Brightness → Auto-Lock</b> to <b>Never</b> while charging, or turn on
              “Keep screen awake” above. A web app cannot run in the background, override the system lock or provide Home Screen widgets; when you return, the clock
              resynchronises instantly.
            </p>
          </div>

          <div className="section" id="settings-dataset">
            <h2>The library</h2>
            {meta ? (
              <>
                <p>
                  {meta.uniqueQuotes.toLocaleString()} distinct quotations from {meta.works.length.toLocaleString()} works, covering {covered.toLocaleString()} of 1,440 minutes
                  ({((covered / 1440) * 100).toFixed(1)}%). Edition {meta.version}.
                </p>
                <div className="coverage-bar" role="img" aria-label={`Coverage across the day: ${covered} of 1440 minutes have a quotation`}>
                  {Array.from({ length: 48 }, (_, i) => {
                    const slice = meta.counts.slice(i * 30, i * 30 + 30);
                    const frac = slice.filter((c) => c > 0).length / 30;
                    return <span key={i} title={`${formatMinute(i * 30, s.hour12)}: ${Math.round(frac * 100)}%`} style={{ opacity: 0.15 + frac * 0.85 }} />;
                  })}
                </div>
                <p className="hint">Each bar is half an hour, from midnight to midnight; darker means more minutes have at least one quotation.</p>
              </>
            ) : (
              <p className="hint">Loading…</p>
            )}
          </div>

          <div className="section" id="settings-about">
            <h2>Sources &amp; licensing</h2>
            {meta?.sources.map((src) => (
              <p key={src.key}>
                <b>{src.name}</b> — {src.license}. {src.attribution}{' '}
                <a href={src.url} target="_blank" rel="noreferrer">{src.url.replace(/^https?:\/\//, '')}</a>
              </p>
            ))}
            <p className="hint">
              Quotations are drawn only from works believed to be in the public domain in the United States. Some may still be protected elsewhere; readers outside
              the US should check local law before redistributing them. Each quotation keeps its author, title and source. {BRAND.name} is not affiliated with
              Standard Ebooks or Project Gutenberg.
            </p>
            <p className="hint">
              Typefaces: EB Garamond, Libre Baskerville, Literata, Crimson Pro, Cormorant Garamond and Source Serif 4, each under the SIL Open Font License 1.1,
              bundled locally via Fontsource.
            </p>
            <p className="hint">
              <a href="./THIRD_PARTY_NOTICES.txt" target="_blank" rel="noreferrer">Full third-party notices</a>
            </p>
            <p className="hint">
              {BRAND.name} {__APP_VERSION__} · built {__BUILD_TIME__.slice(0, 10)} · no analytics, tracking or advertising.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
