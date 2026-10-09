// Brand mark: slanted VND letters (same geometry as scripts/make-icons.mjs).
const D = 'M0 0H9L15 24L21 0H30L20 40H10Z M32 40V0H41L51 22V0H60V40H51L41 18V40Z M63 0H83L93 10V30L83 40H63Z M72 8V32H79L84 27V13L79 8Z';

export function LogoMark({ height = 28 }: { height?: number }) {
  return (
    <svg height={height} viewBox="0 0 106 40" role="img" aria-label="VND">
      <g transform="translate(12 0) skewX(-16.7)">
        <path d={D} fill="var(--accent)" fillRule="evenodd" />
      </g>
    </svg>
  );
}

export function Logo({ size = 'md', tagline = false }: { size?: 'sm' | 'md' | 'lg'; tagline?: boolean }) {
  const h = size === 'lg' ? 56 : size === 'md' ? 30 : 22;
  return (
    <div className={`logo logo-${size}`}>
      <LogoMark height={h} />
      <div className="logo-sub">VITIA NIGHT DROP</div>
      {tagline && <div className="logo-tag">NE DALIM PËR TY.</div>}
    </div>
  );
}
