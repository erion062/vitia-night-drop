import { useState } from 'react';

const ADS = [
  { src: '/halloween/02-gishta.jpg', alt: 'Halloween — gishta' },
  { src: '/halloween/03-krahe.jpg', alt: 'Halloween — krahë' },
  { src: '/halloween/06-nate-e-nxehte.jpg', alt: 'Halloween — natë e nxehtë' },
  { src: '/halloween/07-mantija.jpg', alt: 'Halloween — mantija' },
  { src: '/halloween/08-apokalipsi.jpg', alt: 'Halloween — apokalipsi' },
  { src: '/halloween/10-31-tetor.jpg', alt: 'Halloween — 31 tetor' },
];

const SEEN = 'vnd_halloween_ads';

export function HalloweenAds({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const last = i === ADS.length - 1;
  const ad = ADS[i];

  function dismiss() {
    try {
      sessionStorage.setItem(SEEN, '1');
    } catch {
      /* ignore */
    }
    onClose();
  }

  return (
    <div className="hallo-ads" role="dialog" aria-label="Halloween">
      <div className="hallo-ads-card">
        <p className="hallo-ads-kicker">Halloween · deri më 31 tetor</p>
        <img src={ad.src} alt={ad.alt} />
        <div className="hallo-ads-dots">
          {ADS.map((_, n) => (
            <button key={n} type="button" className={n === i ? 'on' : ''} aria-label={`Postimi ${n + 1}`} onClick={() => setI(n)} />
          ))}
        </div>
        <div className="hallo-ads-row">
          {i > 0 && (
            <button type="button" className="btn btn-outline" onClick={() => setI(i - 1)}>
              Mbrapa
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => (last ? dismiss() : setI(i + 1))}>
            {last ? 'Vazhdo' : 'Tjetra'}
          </button>
        </div>
        {!last && (
          <button type="button" className="hallo-ads-skip" onClick={dismiss}>
            Mbylle
          </button>
        )}
      </div>
    </div>
  );
}

export function halloweenAdsPending() {
  try {
    return sessionStorage.getItem(SEEN) !== '1';
  } catch {
    return true;
  }
}
