/**
 * アイコン（Lucide https://lucide.dev ／ ISC License, Copyright (c) Lucide Icons and Contributors）
 * 必要なものだけを SVG のまま取り込んでいる。足すときは lucide の icons/<名前>.svg の中身を写す。
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 20, strokeWidth = 2, ...rest }: IconProps) {
  return {
    xmlns: 'http://www.w3.org/2000/svg',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...rest,
    className: `icon ${rest.className ?? ''}`.trim(),
  }
}

export const Bell = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
  </svg>
)

export const Settings = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /><circle cx="12" cy="12" r="3" />
  </svg>
)

export const ArrowLeft = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
  </svg>
)

export const Flag = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528" />
  </svg>
)

export const Play = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
  </svg>
)

export const Square = (p: IconProps) => (
  <svg {...base(p)}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
  </svg>
)

export const X = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
  </svg>
)

export const CircleCheck = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="10" /><path d="m16 9-5.5 5.5L8 12" />
  </svg>
)

export const CircleX = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />
  </svg>
)

export const ChevronRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m9 18 6-6-6-6" />
  </svg>
)

export const Volume2 = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" /><path d="M16 9a5 5 0 0 1 0 6" /><path d="M19.364 18.364a9 9 0 0 0 0-12.728" />
  </svg>
)
