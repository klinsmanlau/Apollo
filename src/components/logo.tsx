/**
 * The Apollo "a." mark.
 *
 * The artwork lives in `public/` as two files — the dark mark for light mode
 * and the white mark for dark mode — swapped with the `dark:` variant. They're
 * applied as CSS background images rather than <img> tags so that a missing
 * file degrades to empty space instead of a broken-image glyph (the wordmark
 * beside it still identifies the app).
 *
 *   public/apollo-logo-light.png  — dark "a." (used on light backgrounds)
 *   public/apollo-logo-dark.png   — white "a." (used on dark backgrounds)
 *
 * The favicon is separate: drop the same dark mark at `src/app/icon.png` and
 * Next.js wires it up automatically.
 */
// The artwork is trimmed to its ink, so the box is the glyph — no invisible
// padding throwing off alignment. Both files share this framing exactly, so
// the mark doesn't shift when the theme toggles.
const MARK_ASPECT = 192 / 153;

export function LogoMark({
  height = 24,
  className = "",
}: {
  /** Height of the glyph in px; width follows the artwork's aspect ratio. */
  height?: number;
  className?: string;
}) {
  return (
    <span
      style={{ height, width: Math.round(height * MARK_ASPECT) }}
      className={`inline-block shrink-0 bg-contain bg-center bg-no-repeat [background-image:url('/apollo-logo-light.png')] dark:[background-image:url('/apollo-logo-dark.png')] ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * Mark + wordmark, for the app header.
 *
 * Aligned on the baseline, not the box centre. The trimmed artwork has no
 * descender, so its bottom edge *is* its baseline — and an empty inline-block's
 * baseline is its bottom margin edge, so `items-baseline` sits the "a." on the
 * same line as "Apollo". Centring the boxes instead leaves the mark hanging
 * ~6px low, which is what reads as "not quite aligned".
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-baseline gap-2.5 ${className}`}>
      <LogoMark />
      <span className="text-[23px] font-semibold leading-none tracking-tight text-fg">
        Apollo
      </span>
    </span>
  );
}
