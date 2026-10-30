import React from 'react'

export interface TotwPaintProps {
  variant: number
  className?: string
}

/**
 * High-energy grunge brushpaint patterns behind player cards.
 * 6 unique variations inspired by esports / sports poster art,
 * featuring multi-tone layered brush strokes, stepped dry bristles,
 * neon laser streaks, and dynamic splatter flecks.
 */
export function TotwPaint({ variant, className }: TotwPaintProps) {
  const v = Math.abs(variant) % 6

  return (
    <svg
      className={`totw-card__paint totw-paint--v${v} ${className ?? ''}`}
      viewBox="0 0 200 240"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`tp-volt-${v}`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#9ee810" />
          <stop offset="60%" stopColor="#c8ff3d" />
          <stop offset="100%" stopColor="#e4ff75" />
        </linearGradient>
        <linearGradient id={`tp-emerald-${v}`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#047857" stopOpacity="0.85" />
          <stop offset="70%" stopColor="#10b981" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id={`tp-dark-${v}`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#030712" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#064e3b" stopOpacity="0.6" />
        </linearGradient>
        <filter id={`tp-glow-${v}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {v === 0 && (
        <g>
          {/* Dark Charcoal & Deep Emerald Under-layer */}
          <polygon
            points="28,240 128,38 152,48 142,88 64,240"
            fill={`url(#tp-dark-${v})`}
          />
          {/* Emerald Midtone Brush */}
          <polygon
            points="36,240 120,44 136,40 132,60 148,54 138,82 72,240"
            fill={`url(#tp-emerald-${v})`}
            opacity="0.9"
          />
          {/* Primary Volt Stroke with Stepped Bristles */}
          <polygon
            className="totw-paint__main"
            points="46,240 124,46 138,42 134,58 152,52 144,76 136,98 84,240"
            fill={`url(#tp-volt-${v})`}
          />
          {/* Secondary Volt Slash */}
          <polygon
            points="106,240 166,82 178,88 170,108 120,240"
            fill={`url(#tp-volt-${v})`}
            opacity="0.85"
          />
          {/* Razor Beam */}
          <line
            className="totw-paint__beam"
            x1="22"
            y1="228"
            x2="174"
            y2="34"
            stroke="#f4ffe0"
            strokeWidth="1.8"
            strokeLinecap="round"
            filter={`url(#tp-glow-${v})`}
            opacity="0.9"
          />
          {/* Splatter flecks */}
          <circle cx="148" cy="32" r="2.2" fill="#c8ff3d" />
          <circle cx="162" cy="46" r="1.6" fill="#c8ff3d" />
          <circle cx="176" cy="62" r="2.8" fill="#e4ff75" />
          <circle cx="184" cy="80" r="1.4" fill="#c8ff3d" />
          <polygon points="156,22 160,26 158,30 154,26" fill="#c8ff3d" />
          <polygon points="168,40 173,43 170,47 165,44" fill="#34d399" />
          <circle cx="34" cy="204" r="1.8" fill="#c8ff3d" opacity="0.7" />
          <circle cx="48" cy="180" r="1.4" fill="#10b981" opacity="0.8" />
        </g>
      )}

      {v === 1 && (
        <g>
          {/* Dark Wedge */}
          <polygon
            points="38,240 114,18 144,26 76,240"
            fill={`url(#tp-dark-${v})`}
          />
          {/* Emerald Broad Bed */}
          <polygon
            points="44,240 122,22 148,30 84,240"
            fill={`url(#tp-emerald-${v})`}
            opacity="0.88"
          />
          {/* Volt Stepped Sweep */}
          <polygon
            className="totw-paint__main"
            points="52,240 116,30 130,28 126,44 142,38 134,62 90,240"
            fill={`url(#tp-volt-${v})`}
          />
          {/* Left Flank Blade */}
          <polygon
            points="26,220 74,96 86,102 42,226"
            fill={`url(#tp-volt-${v})`}
            opacity="0.8"
          />
          {/* High-Intensity Laser Flare Beam */}
          <line
            x1="12"
            y1="236"
            x2="182"
            y2="16"
            stroke="#10b981"
            strokeWidth="4"
            opacity="0.45"
            strokeLinecap="round"
          />
          <line
            className="totw-paint__beam"
            x1="14"
            y1="234"
            x2="180"
            y2="18"
            stroke="#ffffff"
            strokeWidth="1.9"
            strokeLinecap="round"
            filter={`url(#tp-glow-${v})`}
          />
          {/* Top Spray Spatter */}
          <circle cx="152" cy="18" r="2.4" fill="#ffffff" />
          <circle cx="166" cy="28" r="3" fill="#c8ff3d" />
          <circle cx="178" cy="42" r="1.8" fill="#e4ff75" />
          <circle cx="188" cy="56" r="2.2" fill="#c8ff3d" />
          <polygon points="144,12 148,16 146,19 142,15" fill="#c8ff3d" />
          <polygon points="160,22 164,25 162,29 158,26" fill="#34d399" />
          <circle cx="82" cy="80" r="1.5" fill="#c8ff3d" opacity="0.75" />
        </g>
      )}

      {v === 2 && (
        <g>
          {/* Tri-Blade Shredded Streaks */}
          <polygon
            points="24,240 84,78 96,84 38,240"
            fill={`url(#tp-emerald-${v})`}
            opacity="0.8"
          />
          {/* Blade 1 (Left Volt) */}
          <polygon
            points="20,240 80,82 92,88 34,240"
            fill={`url(#tp-volt-${v})`}
            opacity="0.9"
          />
          {/* Blade 2 (Center Heavy Blade with Teeth) */}
          <polygon
            points="48,240 134,26 150,34 142,54 156,48 146,72 74,240"
            fill={`url(#tp-dark-${v})`}
          />
          <polygon
            className="totw-paint__main"
            points="54,240 136,30 152,38 144,56 158,50 148,74 78,240"
            fill={`url(#tp-volt-${v})`}
          />
          {/* Blade 3 (Right Razor Blade) */}
          <polygon
            points="92,236 170,76 182,84 108,240"
            fill={`url(#tp-volt-${v})`}
            opacity="0.85"
          />
          {/* Floating dynamic shards */}
          <polygon points="102,68 112,62 108,74" fill="#c8ff3d" />
          <polygon points="162,60 170,54 166,66" fill="#e4ff75" />
          {/* Laser needle */}
          <line
            className="totw-paint__beam"
            x1="36"
            y1="214"
            x2="182"
            y2="46"
            stroke="#f4ffe0"
            strokeWidth="1.6"
            strokeLinecap="round"
            filter={`url(#tp-glow-${v})`}
          />
          {/* Splatter */}
          <circle cx="140" cy="22" r="2" fill="#c8ff3d" />
          <circle cx="158" cy="32" r="2.6" fill="#e4ff75" />
          <circle cx="174" cy="50" r="1.6" fill="#c8ff3d" />
          <circle cx="186" cy="70" r="2.2" fill="#34d399" />
          <circle cx="48" cy="172" r="1.5" fill="#c8ff3d" opacity="0.7" />
        </g>
      )}

      {v === 3 && (
        <g>
          {/* Heavy Grunge Scrape & Splatter */}
          <polygon
            points="28,240 136,36 172,56 86,240"
            fill={`url(#tp-dark-${v})`}
          />
          <polygon
            points="34,240 138,40 162,54 148,82 72,240"
            fill={`url(#tp-emerald-${v})`}
            opacity="0.9"
          />
          {/* Stepped Serrated Stroke */}
          <polygon
            className="totw-paint__main"
            points="44,240 98,124 92,120 120,68 114,64 138,36 154,44 146,62 162,56 152,78 144,98 80,240"
            fill={`url(#tp-volt-${v})`}
          />
          {/* Secondary Wing */}
          <polygon
            points="14,212 66,84 78,90 28,220"
            fill={`url(#tp-volt-${v})`}
            opacity="0.75"
          />
          {/* Laser Glint */}
          <line
            className="totw-paint__beam"
            x1="26"
            y1="230"
            x2="168"
            y2="42"
            stroke="#ffffff"
            strokeWidth="1.7"
            strokeLinecap="round"
            filter={`url(#tp-glow-${v})`}
          />
          {/* Heavy Splatter Cascade */}
          <circle cx="146" cy="26" r="2.2" fill="#c8ff3d" />
          <circle cx="158" cy="36" r="3.2" fill="#e4ff75" />
          <circle cx="168" cy="48" r="1.8" fill="#c8ff3d" />
          <circle cx="178" cy="64" r="2.5" fill="#34d399" />
          <circle cx="188" cy="82" r="1.6" fill="#c8ff3d" />
          <circle cx="132" cy="52" r="1.5" fill="#c8ff3d" />
          <circle cx="162" cy="74" r="2" fill="#e4ff75" />
          <polygon points="152,18 157,22 154,26 149,22" fill="#c8ff3d" />
          <polygon points="174,38 180,42 176,46 171,42" fill="#10b981" />
        </g>
      )}

      {v === 4 && (
        <g>
          {/* Twin Fang Razor */}
          <polygon
            points="40,240 134,22 152,30 136,72 154,64 64,240"
            fill={`url(#tp-dark-${v})`}
          />
          {/* Emerald Center Infill */}
          <polygon
            points="58,232 144,52 158,58 76,236"
            fill={`url(#tp-emerald-${v})`}
            opacity="0.9"
          />
          {/* Fang 1 (Upper Volt Blade) */}
          <polygon
            className="totw-paint__main"
            points="42,240 130,24 146,30 134,66 148,60 62,240"
            fill={`url(#tp-volt-${v})`}
          />
          {/* Fang 2 (Lower Volt Blade) */}
          <polygon
            points="76,240 166,62 178,70 164,108 96,240"
            fill={`url(#tp-volt-${v})`}
            opacity="0.88"
          />
          {/* Laser Needle */}
          <line
            className="totw-paint__beam"
            x1="24"
            y1="232"
            x2="174"
            y2="38"
            stroke="#f4ffe0"
            strokeWidth="1.8"
            strokeLinecap="round"
            filter={`url(#tp-glow-${v})`}
          />
          {/* Droplets & Flecks */}
          <circle cx="138" cy="18" r="2" fill="#c8ff3d" />
          <circle cx="152" cy="24" r="2.8" fill="#e4ff75" />
          <circle cx="168" cy="44" r="1.8" fill="#c8ff3d" />
          <circle cx="182" cy="66" r="2.6" fill="#34d399" />
          <circle cx="190" cy="88" r="1.4" fill="#c8ff3d" />
          <polygon points="144,12 148,15 146,18 142,15" fill="#c8ff3d" />
          <circle cx="42" cy="190" r="1.4" fill="#c8ff3d" opacity="0.75" />
        </g>
      )}

      {v === 5 && (
        <g>
          {/* Ascending Nova / Crown Burst */}
          <polygon
            points="42,240 106,12 136,18 76,240"
            fill={`url(#tp-dark-${v})`}
          />
          <polygon
            points="48,240 114,16 140,22 84,240"
            fill={`url(#tp-emerald-${v})`}
            opacity="0.85"
          />
          {/* Monumental Central Volt Slash */}
          <polygon
            className="totw-paint__main"
            points="54,240 112,16 128,14 124,34 138,28 130,52 82,240"
            fill={`url(#tp-volt-${v})`}
          />
          {/* Left Wing */}
          <polygon
            points="22,222 70,96 82,102 36,228"
            fill={`url(#tp-volt-${v})`}
            opacity="0.8"
          />
          {/* Right Wing */}
          <polygon
            points="86,226 166,60 178,68 98,234"
            fill={`url(#tp-volt-${v})`}
            opacity="0.85"
          />
          {/* Crossing Laser Flares */}
          <line
            className="totw-paint__beam"
            x1="16"
            y1="228"
            x2="178"
            y2="28"
            stroke="#ffffff"
            strokeWidth="1.9"
            strokeLinecap="round"
            filter={`url(#tp-glow-${v})`}
          />
          {/* Radiating Crown Burst */}
          <circle cx="118" cy="12" r="2.8" fill="#ffffff" />
          <circle cx="132" cy="16" r="2" fill="#c8ff3d" />
          <circle cx="146" cy="28" r="3.2" fill="#e4ff75" />
          <circle cx="164" cy="48" r="2" fill="#c8ff3d" />
          <circle cx="178" cy="68" r="2.4" fill="#34d399" />
          <polygon points="124,6 128,9 126,12 122,9" fill="#e4ff75" />
          <circle cx="68" cy="85" r="1.6" fill="#c8ff3d" opacity="0.8" />
        </g>
      )}
    </svg>
  )
}
