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
  placeholder = "Click to type the actual result",
  minHeight = 92,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [empty, setEmpty] = useState(!value || value === "<br>");

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

  function insertImage() {
    const url = window.prompt("Image URL (or leave blank to cancel)", "https://");
    if (url) exec("insertImage", url);
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

      <div className="relative">
        {empty && (
          <span className="pointer-events-none absolute left-3 top-2 text-sm text-subtle">
            {placeholder}
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
            if (ref.current) onChange(isBlank(ref.current) ? "" : ref.current.innerHTML);
          }}
          onInput={sync}
          style={{ minHeight }}
          className="prose-actual w-full px-3 py-2 text-sm text-fg outline-none"
        />
      </div>
    </div>
  );
}

/** True when the editor holds no meaningful content (only whitespace / <br>). */
function isBlank(el: HTMLElement): boolean {
  if (el.querySelector("img,table,pre,ul,ol,li")) return false;
  return el.textContent?.trim().length === 0;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
