import { useEffect, useRef, useState } from 'react';
import type { Quote } from '../core/types';
import { downloadBlob, quoteAsText, renderQuoteImage, slug, type ImageStyle } from '../core/share';
import { formatMinute } from '../core/time';

export function ShareDialog({
  quote,
  style,
  hour12,
  onClose,
}: {
  quote: Quote;
  style: ImageStyle;
  hour12: boolean;
  onClose: () => void;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const first = useRef<HTMLButtonElement>(null);
  const text = quoteAsText(quote, hour12);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    renderQuoteImage(quote, style)
      .then((b) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(b);
        setBlob(b);
        setUrl(objectUrl);
      })
      .catch(() => setStatus('Image could not be generated on this device.'));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [quote, style]);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fileName = `${slug(quote.author)}-${formatMinute(quote.minute, false).replace(':', '')}.png`;
  const canShareText = typeof navigator !== 'undefined' && !!navigator.share;
  const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;
  const canShareFile = !!file && typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [file] });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Copied to clipboard.');
    } catch {
      setStatus('Copying is not available here — select the text below instead.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="share-title">Share this quotation</h2>
        {url ? <img className="share-preview" src={url} alt="Preview of the shareable quotation image" /> : <p className="hint">Setting the type…</p>}
        <div className="btn-row">
          {canShareFile ? (
            <button
              ref={first}
              className="btn btn--solid"
              onClick={() => navigator.share({ files: [file!], text }).catch(() => undefined)}
            >
              Share image
            </button>
          ) : null}
          <button ref={canShareFile ? undefined : first} className="btn" disabled={!blob} onClick={() => blob && downloadBlob(blob, fileName)}>
            Save image
          </button>
          {canShareText ? (
            <button className="btn" onClick={() => navigator.share({ text }).catch(() => undefined)}>
              Share text
            </button>
          ) : null}
          <button className="btn" onClick={copy}>
            Copy text
          </button>
          <button className="btn btn--quiet" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="hint" role="status" aria-live="polite">
          {status}
        </p>
        <textarea className="field" readOnly value={text} rows={5} style={{ width: '100%', maxWidth: '100%' }} aria-label="Quotation as text" />
      </div>
    </div>
  );
}
