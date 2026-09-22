"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Subscript,
  Superscript,
  ListBullet,
  ListOrdered,
  Table as TableIcon,
  Image as ImageIcon,
  Film as FilmIcon,
  Link as LinkIcon,
  Code,
  ClearFormat,
} from "@/components/icons";

/**
 * Self-contained rich-text editor (contentEditable + document.execCommand).
 * No dependencies — deliberately lightweight for the per-step "Actual Result".
 *
 * The editor is UNCONTROLLED: initial HTML is written to the DOM once on mount
 * so the caret never jumps mid-edit. `onChange` fires on blur with the current
 * HTML. The toolbar only appears while the editor has focus (per the design),
 * and its buttons preventDefault on mousedown so clicking one doesn't blur the
 * editor or lose the selection.
 */

type Cmd =
  | { kind: "cmd"; command: string; value?: string }
  | { kind: "custom"; run: () => void };

export function RichTextEditor({
  value,
  onChange,
  onImageUpload,
  onVideoUpload,
  placeholder = "Click to type the actual result",
  minHeight = 92,
}: {
  value: string;
  onChange: (html: string) => void;
  /**
   * Upload a picked image file and return the URL to embed, or null to abort.
   * When omitted, the image is embedded inline as a base64 data URL instead.
   */
  onImageUpload?: (file: File) => Promise<string | null>;
  /**
   * Upload a picked video file and return the URL to embed as a <video>, or
   * null to abort. Videos are never inlined; when this is omitted the video
   * toolbar button and video paste are disabled.
   */
  onVideoUpload?: (file: File) => Promise<string | null>;
  placeholder?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // The caret position at the moment the image tool is clicked — restored after
  // the (blurring) file dialog closes so the image lands where the user was.
  const savedRange = useRef<Range | null>(null);
  // The media element (image or video) currently showing resize handles, plus
  // its box (relative to the wrapper) so the selection outline can be drawn
  // over it. Images and videos resize identically — both take an inline
  // width/height and report their rendered size via getBoundingClientRect.
  const selEl = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  const [selBox, setSelBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [focused, setFocused] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(!value || value === "<br>");

  // Position the resize outline over the selected media, or clear it.
  function measureMedia() {
    const el = selEl.current;
    const wrap = wrapRef.current;
    if (!el || !wrap || !wrap.contains(el)) {
      selEl.current = null;
      setSelBox(null);
      return;
    }
    const ir = el.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    setSelBox({ x: ir.left - wr.left, y: ir.top - wr.top, w: ir.width, h: ir.height });
  }

  function selectMedia(el: HTMLImageElement | HTMLVideoElement | null) {
    selEl.current = el;
    measureMedia();
  }

  // Drag the bottom-right handle to resize the media, preserving aspect ratio.
  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    const el = selEl.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const startX = e.clientX;
    const startW = rect.width;
    const ratio = rect.height / rect.width || 1;
    const maxW = ref.current?.clientWidth ?? 4000;

    const move = (ev: PointerEvent) => {
      const w = Math.round(Math.min(maxW, Math.max(40, startW + (ev.clientX - startX))));
      el.style.width = `${w}px`;
      el.style.height = `${Math.round(w * ratio)}px`;
      measureMedia();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (ref.current) onChange(ref.current.innerHTML);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Seed the DOM once; thereafter the browser owns the content.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value ?? "")) {
      ref.current.innerHTML = value ?? "";
      setEmpty(isBlank(ref.current));
    }
    // Intentionally mount-only: re-seeding on every prop change fights the caret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exec(command: string, val?: string) {
    ref.current?.focus();
    document.execCommand(command, false, val);
    sync();
  }

  function sync() {
    if (ref.current) setEmpty(isBlank(ref.current));
  }

  function insertHTML(html: string) {
    ref.current?.focus();
    document.execCommand("insertHTML", false, html);
    sync();
  }

  function insertTable() {
    const cell =
      'style="border:1px solid var(--line);padding:6px 8px;min-width:48px"';
    const row = (tag: string) =>
      `<tr>${`<${tag} ${cell}>&nbsp;</${tag}>`.repeat(3)}</tr>`;
    insertHTML(
      `<table style="border-collapse:collapse;margin:6px 0;width:auto"><thead>${row(
        "th"
      )}</thead><tbody>${row("td")}${row("td")}</tbody></table><p><br></p>`
    );
  }

  function insertLink() {
    const url = window.prompt("Link URL", "https://");
    if (url) exec("createLink", url);
  }

  function openPicker(accept: string) {
    // Remember where the caret is, then open the OS file picker.
    const sel = window.getSelection?.();
    savedRange.current =
      sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
    if (fileRef.current) {
      fileRef.current.accept = accept;
      fileRef.current.click();
    }
  }
  function insertImage() {
    openPicker("image/*");
  }
  function insertVideo() {
    openPicker("video/*");
  }

  // Shared by the toolbar button and paste: run the file through the caller's
  // uploader (or the base64 fallback), then insert it at the saved caret.
  async function insertImageFile(file: File) {
    setImgError(null);
    setUploading(true);
    try {
      // onImageUpload may reject (e.g. too large) — surface its message inline.
      const url = onImageUpload
        ? await onImageUpload(file)
        : await fileToDataUrl(file);
      if (!url) return;
      // Restore focus + caret, insert, then persist (blur won't re-fire).
      ref.current?.focus();
      const sel = window.getSelection?.();
      if (sel && savedRange.current) {
        sel.removeAllRanges();
        sel.addRange(savedRange.current);
      }
      document.execCommand("insertImage", false, url);
      sync();
      if (ref.current) onChange(ref.current.innerHTML);
    } catch (err) {
      setImgError(err instanceof Error ? err.message : "Could not add the image.");
    } finally {
      setUploading(false);
    }
  }

  // Upload a video via the caller's uploader and insert a <video> at the caret.
  async function insertVideoFile(file: File) {
    if (!onVideoUpload) return;
    setImgError(null);
    setUploading(true);
    try {
      const url = await onVideoUpload(file);
      if (!url) return;
      ref.current?.focus();
      const sel = window.getSelection?.();
      if (sel && savedRange.current) {
        sel.removeAllRanges();
        sel.addRange(savedRange.current);
      }
      insertHTML(
        `<video controls src="${url}" style="max-width:100%;border-radius:6px"></video><p><br></p>`
      );
      if (ref.current) onChange(ref.current.innerHTML);
    } catch (err) {
      setImgError(err instanceof Error ? err.message : "Could not add the video.");
    } finally {
      setUploading(false);
    }
  }

  // Route a picked file to the right inserter by type.
  async function insertMediaFile(file: File) {
    if (file.type.startsWith("video/")) {
      if (onVideoUpload) await insertVideoFile(file);
      return;
    }
    await insertImageFile(file);
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (file) await insertMediaFile(file);
  }

  // Intercept pasted image (and, when enabled, video) files so they go through
  // the same upload path as the toolbar buttons; other content pastes normally.
  function onPaste(e: React.ClipboardEvent) {
    const media = Array.from(e.clipboardData?.files ?? []).filter(
      (f) =>
        f.type.startsWith("image/") ||
        (onVideoUpload && f.type.startsWith("video/"))
    );
    if (media.length === 0) return;
    e.preventDefault();
    const sel = window.getSelection?.();
    savedRange.current =
      sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
    void (async () => {
      for (const f of media) await insertMediaFile(f);
    })();
  }

  function insertCode() {
    const sel = window.getSelection?.();
    const text = sel && !sel.isCollapsed ? sel.toString() : "";
    if (text) {
      insertHTML(`<code>${escapeHtml(text)}</code>&nbsp;`);
    } else {
      insertHTML(
        `<pre style="background:var(--surface-muted);padding:8px 10px;border-radius:6px;overflow:auto"><code>code</code></pre><p><br></p>`
      );
    }
  }

  function clearFormatting() {
    exec("removeFormat");
    exec("unlink");
  }

  const TOOLS: {
    key: string;
    title: string;
    icon: React.ReactNode;
    action: Cmd;
    text?: string;
  }[] = [
    { key: "bold", title: "Bold", icon: <Bold size={15} />, action: { kind: "cmd", command: "bold" } },
    { key: "italic", title: "Italic", icon: <Italic size={15} />, action: { kind: "cmd", command: "italic" } },
    { key: "underline", title: "Underline", icon: <Underline size={15} />, action: { kind: "cmd", command: "underline" } },
    { key: "strike", title: "Strikethrough", icon: <Strikethrough size={15} />, action: { kind: "cmd", command: "strikeThrough" } },
    { key: "sub", title: "Subscript", icon: <Subscript size={15} />, action: { kind: "cmd", command: "subscript" } },
    { key: "sup", title: "Superscript", icon: <Superscript size={15} />, action: { kind: "cmd", command: "superscript" } },
    { key: "ul", title: "Bulleted list", icon: <ListBullet size={15} />, action: { kind: "cmd", command: "insertUnorderedList" } },
    { key: "ol", title: "Numbered list", icon: <ListOrdered size={15} />, action: { kind: "cmd", command: "insertOrderedList" } },
    { key: "table", title: "Insert table", icon: <TableIcon size={15} />, action: { kind: "custom", run: insertTable } },
    { key: "image", title: "Insert image", icon: <ImageIcon size={15} />, action: { kind: "custom", run: insertImage } },
    ...(onVideoUpload
      ? [{ key: "video", title: "Insert video", icon: <FilmIcon size={15} />, action: { kind: "custom" as const, run: insertVideo } }]
      : []),
    { key: "link", title: "Insert link", icon: <LinkIcon size={15} />, action: { kind: "custom", run: insertLink } },
    { key: "code", title: "Insert code snippet", icon: <Code size={15} />, action: { kind: "custom", run: insertCode } },
    { key: "clear", title: "Clear formatting", icon: <ClearFormat size={15} />, action: { kind: "custom", run: clearFormatting } },
  ];

  const DIVIDERS = new Set(["strike", "sup", "ol", "code"]); // after these keys

  return (
    <div
      className={`overflow-hidden rounded-lg border bg-surface transition-colors ${
        focused ? "border-ring ring-4 ring-ring/12" : "border-line"
      }`}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFilePicked}
      />
      {focused && (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-surface-muted/60 px-1.5 py-1">
          {TOOLS.map((t) => (
            <span key={t.key} className="flex items-center">
              <button
                type="button"
                title={t.title}
                aria-label={t.title}
                // Keep the editor's selection while clicking a tool.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  t.action.kind === "cmd"
                    ? exec(t.action.command, t.action.value)
                    : t.action.run()
                }
                className="flex h-7 w-7 items-center justify-center rounded text-muted transition-colors hover:bg-surface-muted hover:text-fg"
              >
                {t.icon}
              </button>
              {DIVIDERS.has(t.key) && (
                <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
              )}
            </span>
          ))}
        </div>
      )}

      <div ref={wrapRef} className="relative">
        {empty && (
          <span className="pointer-events-none absolute left-3 top-2 text-sm text-subtle">
            {placeholder}
          </span>
        )}
        {uploading && (
          <span className="pointer-events-none absolute right-2 top-2 z-10 rounded bg-surface px-1.5 py-0.5 text-[11px] text-subtle shadow-sm">
            Adding image…
          </span>
        )}
        {imgError && !uploading && (
          <span className="absolute right-2 top-2 z-10 max-w-[85%] rounded bg-red-600 px-1.5 py-0.5 text-[11px] text-white shadow-sm">
            {imgError}
          </span>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            selectMedia(null);
            if (ref.current) onChange(isBlank(ref.current) ? "" : ref.current.innerHTML);
          }}
          onInput={() => {
            sync();
            setImgError(null);
            measureMedia(); // keep the outline aligned as content reflows
          }}
          onClick={(e) => {
            const t = e.target as HTMLElement;
            selectMedia(
              t.tagName === "IMG" || t.tagName === "VIDEO"
                ? (t as HTMLImageElement | HTMLVideoElement)
                : null
            );
          }}
          onPaste={onPaste}
          style={{ minHeight }}
          className="prose-actual w-full px-3 py-2 text-sm text-fg outline-none"
        />
        {selBox && (
          <div
            className="pointer-events-none absolute z-20 rounded-sm ring-2 ring-ring"
            style={{ left: selBox.x, top: selBox.y, width: selBox.w, height: selBox.h }}
          >
            <span
              // Keep focus/selection in the editor so the outline survives the drag.
              onMouseDown={(e) => e.preventDefault()}
              onPointerDown={startResize}
              title="Drag to resize"
              className="pointer-events-auto absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border border-white bg-ring shadow-sm"
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** True when the editor holds no meaningful content (only whitespace / <br>). */
function isBlank(el: HTMLElement): boolean {
  if (el.querySelector("img,video,table,pre,ul,ol,li")) return false;
  return el.textContent?.trim().length === 0;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Embed an image inline as a base64 data URL (the editor's default, and a
 *  reusable helper for callers that compress/cap before embedding). */
export function fileToDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
