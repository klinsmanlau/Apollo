/**
 * Shared icon set. All icons are stroke-based, inherit `currentColor`, and
 * default to 16px so they optically match 13–14px UI text.
 *
 * Emoji were previously used for several of these; emoji render differently on
 * every OS, can't inherit colour, and are the single loudest "unfinished" tell
 * in an interface. Everything here is a plain inline SVG instead.
 */
type IconProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
};

function Svg({
  size = 16,
  className,
  strokeWidth = 2,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const ChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const ChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);

export const ChevronUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="m18 15-6-6-6 6" />
  </Svg>
);

export const ChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m15 18-6-6 6-6" />
  </Svg>
);

export const ArrowLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </Svg>
);

export const X = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

export const Plus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const Check = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);

export const Play = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 1.5}>
    <path d="M6 4.5v15l13-7.5-13-7.5Z" fill="currentColor" />
  </Svg>
);

export const Pause = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 1.5}>
    <rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" />
    <rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" />
  </Svg>
);

export const Search = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </Svg>
);

export const Archive = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
  </Svg>
);

export const Paperclip = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21.4 11.05 12.25 20.2a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.67 3.67 0 0 1 5.19 5.19l-9.2 9.19a1.83 1.83 0 0 1-2.59-2.59l8.49-8.48" />
  </Svg>
);

export const Trash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6M10 11v6M14 11v6" />
  </Svg>
);

export const Copy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </Svg>
);

export const Folder = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
  </Svg>
);

export const FolderPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
    <path d="M12 12v5M9.5 14.5h5" />
  </Svg>
);

export const Download = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 15v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4M7 10l5 5 5-5M12 15V3" />
  </Svg>
);

export const Upload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 15v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4M17 8l-5-5-5 5M12 3v12" />
  </Svg>
);

export const Filter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />
  </Svg>
);

export const MoreVertical = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
  </Svg>
);

export const Users = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
    <circle cx="9" cy="7" r="3.5" />
    <path d="M22 20v-1.5a4 4 0 0 0-3-3.85M16 3.65a4 4 0 0 1 0 6.7" />
  </Svg>
);

export const Flag = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 1.5}>
    <path d="M5 21V4h13l-2.5 4L18 12H5" fill="currentColor" />
  </Svg>
);

// ---- Rich-text editor toolbar ------------------------------------------
// Letter-based marks (B/I/U/S) use text so their meaning is unmistakable at
// small sizes; the rest are drawn.

const Glyph = ({
  size = 15,
  className,
  children,
  style,
}: IconProps & { children: React.ReactNode; style?: React.CSSProperties }) => (
  <span
    className={className}
    style={{
      fontSize: size,
      lineHeight: 1,
      fontFamily: "Georgia, 'Times New Roman', serif",
      ...style,
    }}
    aria-hidden="true"
  >
    {children}
  </span>
);

export const Bold = (p: IconProps) => (
  <Glyph {...p} style={{ fontWeight: 800 }}>
    B
  </Glyph>
);
export const Italic = (p: IconProps) => (
  <Glyph {...p} style={{ fontStyle: "italic", fontWeight: 600 }}>
    I
  </Glyph>
);
export const Underline = (p: IconProps) => (
  <Glyph {...p} style={{ textDecoration: "underline", fontWeight: 600 }}>
    U
  </Glyph>
);
export const Strikethrough = (p: IconProps) => (
  <Glyph {...p} style={{ textDecoration: "line-through", fontWeight: 600 }}>
    S
  </Glyph>
);
export const Subscript = (p: IconProps) => (
  <Glyph {...p} style={{ fontWeight: 600 }}>
    x<sub style={{ fontSize: "0.7em" }}>2</sub>
  </Glyph>
);
export const Superscript = (p: IconProps) => (
  <Glyph {...p} style={{ fontWeight: 600 }}>
    x<sup style={{ fontSize: "0.7em" }}>2</sup>
  </Glyph>
);

export const ListBullet = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <circle cx="3.5" cy="6" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="3.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="3.5" cy="18" r="1.3" fill="currentColor" stroke="none" />
  </Svg>
);

export const ListOrdered = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 1.8}>
    <path d="M10 6h11M10 12h11M10 18h11" />
    <path d="M3 4.5 4.2 4v3.2M3 15.2c0-.7 1.8-.6 1.8.3 0 .6-1.8 1-1.8 2.2h2" strokeWidth={1.5} />
  </Svg>
);

export const Table = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <path d="M3 10h18M3 15h18M9 4v16M15 4v16" />
  </Svg>
);

export const Image = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="m4 18 5-5 4 4 3-3 4 4" />
  </Svg>
);

export const Link = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 15l6-6" />
    <path d="M11 6.5 12.8 4.7a4 4 0 0 1 5.66 5.66L16.6 12.2" />
    <path d="M13 17.5 11.2 19.3a4 4 0 0 1-5.66-5.66L7.4 11.8" />
  </Svg>
);

export const Code = (p: IconProps) => (
  <Svg {...p}>
    <path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 5l-4 14" />
  </Svg>
);

export const ClearFormat = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 5h14M9 5 7 19M13 12l6 7M19 12l-6 7" />
  </Svg>
);

export const Pencil = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </Svg>
);

export const Ban = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M5.6 5.6 18.4 18.4" />
  </Svg>
);

export const Spinner = ({ size = 16, className = "" }: IconProps) => (
  <span
    className={`inline-block animate-spin rounded-full border-2 border-line border-t-ring ${className}`}
    style={{ width: size, height: size }}
    aria-hidden="true"
  />
);
