"use client";

import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { FontFamily, FontSize, LineHeight, TextStyle } from "@tiptap/extension-text-style";
import { Underline } from "@tiptap/extension-underline";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useMemo, useRef, useState } from "react";

export type PageMargins = { top: number; right: number; bottom: number; left: number };

type Props = {
  initialHtml: string;
  onChange: (html: string) => void;
  onUpload: (file: File) => Promise<string>;
  startInSource?: boolean;
  complex?: boolean;
  placeholder?: string;
  /** Document mode: Word-like typing, formatting ribbon, and page margins. */
  variant?: "story" | "homework" | "exam";
};

const FONT_FACES = [
  { label: "Calibri", value: "Calibri, Candara, Segoe UI, sans-serif" },
  { label: "Segoe UI", value: "Segoe UI, system-ui, sans-serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Times New Roman", value: "\"Times New Roman\", Times, serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Courier New", value: "\"Courier New\", Courier, monospace" },
];

const FONT_SIZES = ["10", "11", "12", "14", "16", "18", "20", "24", "28", "32", "36"];

const LINE_HEIGHTS = [
  { label: "1.0", value: "1" },
  { label: "1.15", value: "1.15" },
  { label: "1.5", value: "1.5" },
  { label: "2.0", value: "2" },
];

const MARGIN_PRESETS: { id: string; label: string; margins: PageMargins }[] = [
  { id: "narrow", label: "Narrow", margins: { top: 12, right: 12, bottom: 12, left: 12 } },
  { id: "moderate", label: "Moderate", margins: { top: 19, right: 19, bottom: 19, left: 19 } },
  { id: "normal", label: "Normal", margins: { top: 25, right: 25, bottom: 25, left: 25 } },
  { id: "wide", label: "Wide", margins: { top: 25, right: 38, bottom: 25, left: 38 } },
];

const TEXT_COLORS = ["#1a2330", "#b91c1c", "#1d4ed8", "#127238", "#7c3aed", "#c2410c", "#0f766e", "#6b7280"];
const HIGHLIGHTS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca", "#e9d5ff", "#fde68a", "#ffffff"];

const DEFAULT_MARGINS: PageMargins = MARGIN_PRESETS[2].margins;

/** Strip Word/Office cruft while keeping structure, tables, and basic formatting. */
function sanitizeWordHtml(html: string) {
  return html
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?(o|w|m):[^>]*>/gi, "")
    .replace(/\sclass=("|&quot;)?Mso[^"'\s>]*/gi, "")
    .replace(/\sstyle="[^"]*mso-[^"]*"/gi, (match) => {
      const cleaned = match
        .replace(/mso-[^:;"]+:[^;"]+;?/gi, "")
        .replace(/font-family:[^;"]+;?/gi, "")
        .replace(/;;+/g, ";")
        .replace(/style="\s*;?\s*"/i, "");
      return cleaned === ' style=""' || cleaned === ' style=""' ? "" : cleaned;
    })
    .replace(/<(meta|link|xml|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(meta|link|xml)[^>]*\/?>/gi, "")
    .trim();
}

function parseDocPayload(raw: string): { html: string; margins: PageMargins } {
  const trimmed = raw.trim();
  if (!trimmed) return { html: "", margins: DEFAULT_MARGINS };
  if (typeof window === "undefined") return { html: trimmed, margins: DEFAULT_MARGINS };
  try {
    const doc = new DOMParser().parseFromString(trimmed, "text/html");
    const wrap = doc.querySelector("[data-kja-doc]");
    if (!wrap) return { html: trimmed, margins: DEFAULT_MARGINS };
    const parts = (wrap.getAttribute("data-margins") || "")
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0);
    const margins =
      parts.length === 4
        ? { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] }
        : DEFAULT_MARGINS;
    return { html: wrap.innerHTML, margins };
  } catch {
    return { html: trimmed, margins: DEFAULT_MARGINS };
  }
}

function serializeDoc(html: string, margins: PageMargins) {
  const body = html.trim();
  if (!body || body === "<p></p>") return "";
  const attr = `${margins.top},${margins.right},${margins.bottom},${margins.left}`;
  return `<div data-kja-doc="1" data-margins="${attr}">${body}</div>`;
}

function sameMargins(a: PageMargins, b: PageMargins) {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

function ToolButton({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rte-btn${active ? " is-active" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <i className={icon} aria-hidden="true" />
    </button>
  );
}

function ColorSwatch({
  colors,
  label,
  value,
  onPick,
  disabled,
}: {
  colors: string[];
  label: string;
  value?: string;
  onPick: (color: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rte-swatches" role="group" aria-label={label}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          className={`rte-swatch${value?.toLowerCase() === color.toLowerCase() ? " is-on" : ""}`}
          style={{ background: color, borderColor: color === "#ffffff" ? "#d4cdc0" : color }}
          title={label}
          aria-label={`${label} ${color}`}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(color)}
        />
      ))}
    </div>
  );
}

export function RichTextEditor({
  initialHtml,
  onChange,
  onUpload,
  startInSource,
  complex,
  placeholder,
  variant = "story",
}: Props) {
  const documentMode = variant === "homework" || variant === "exam";
  const parsed = useMemo(() => parseDocPayload(initialHtml), [initialHtml]);
  const [source, setSource] = useState(parsed.html);
  const [mode, setMode] = useState<"visual" | "html">(startInSource && !documentMode ? "html" : "visual");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [margins, setMargins] = useState<PageMargins>(parsed.margins);
  const [showMargins, setShowMargins] = useState(false);
  const [ribbonTab, setRibbonTab] = useState<"home" | "insert" | "layout">("home");
  const latestHtml = useRef(parsed.html);
  const marginsRef = useRef(parsed.margins);
  const change = useRef(onChange);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    change.current = onChange;
  }, [onChange]);

  useEffect(() => {
    marginsRef.current = margins;
    if (documentMode) change.current(serializeDoc(latestHtml.current, margins));
  }, [margins, documentMode]);

  const emit = (html: string) => {
    latestHtml.current = html;
    change.current(documentMode ? serializeDoc(html, marginsRef.current) : html);
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: documentMode ? [1, 2, 3, 4] : [2, 3, 4] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      LineHeight,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      ...(documentMode
        ? [
            Table.configure({
              resizable: true,
              HTMLAttributes: { class: "rte-table" },
            }),
            TableRow,
            TableHeader,
            TableCell,
          ]
        : []),
      Image,
      Placeholder.configure({
        placeholder:
          placeholder ||
          (documentMode
            ? "Start typing the homework… or paste from Word."
            : "Tell the story… Use headings to break it into sections."),
      }),
    ],
    content: parsed.html,
    editorProps: {
      attributes: {
        class: documentMode ? "rte-prose rte-doc-prose" : "rte-prose",
        spellcheck: "true",
      },
      transformPastedHTML(html) {
        return sanitizeWordHtml(html);
      },
    },
    onUpdate: ({ editor: current }) => {
      emit(current.isEmpty ? "" : current.getHTML());
    },
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return null;
      const textStyle = current.getAttributes("textStyle") as {
        fontFamily?: string;
        fontSize?: string;
        color?: string;
        lineHeight?: string;
      };
      return {
        block: current.isActive("heading", { level: 1 })
          ? "h1"
          : current.isActive("heading", { level: 2 })
            ? "h2"
            : current.isActive("heading", { level: 3 })
              ? "h3"
              : current.isActive("heading", { level: 4 })
                ? "h4"
                : "p",
        bold: current.isActive("bold"),
        italic: current.isActive("italic"),
        underline: current.isActive("underline"),
        strike: current.isActive("strike"),
        link: current.isActive("link"),
        bullet: current.isActive("bulletList"),
        ordered: current.isActive("orderedList"),
        quote: current.isActive("blockquote"),
        align: current.isActive({ textAlign: "center" })
          ? "center"
          : current.isActive({ textAlign: "right" })
            ? "right"
            : current.isActive({ textAlign: "justify" })
              ? "justify"
              : "left",
        table: current.isActive("table"),
        fontFamily: textStyle.fontFamily || "",
        fontSize: (textStyle.fontSize || "12pt").replace(/pt$/i, ""),
        color: textStyle.color || "#1a2330",
        highlight: (current.getAttributes("highlight").color as string | undefined) || "",
        lineHeight: textStyle.lineHeight || "1.5",
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
        canIndent: current.can().sinkListItem("listItem"),
        canOutdent: current.can().liftListItem("listItem"),
      };
    },
  });

  const visual = mode === "visual";
  const off = !editor || !visual;
  const marginPreset = MARGIN_PRESETS.find((preset) => sameMargins(preset.margins, margins))?.id || "custom";

  const toggleMode = () => {
    if (visual) {
      setSource(latestHtml.current);
      setMode("html");
      return;
    }
    editor?.commands.setContent(source, { emitUpdate: false });
    setMode("visual");
  };

  const setLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link address (leave empty to remove the link)", previous ?? "https://");
    if (url === null) return;
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!url.trim() || url.trim() === "https://") chain.unsetLink().run();
    else chain.setLink({ href: url.trim() }).run();
  };

  const insertImage = async (file: File) => {
    setUploading(true);
    setUploadError("");
    try {
      const src = await onUpload(file);
      const alt = window.prompt("Describe the image for screen readers (optional)", "") ?? "";
      editor?.chain().focus().setImage({ src, alt }).run();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const pageStyle = documentMode
    ? {
        paddingTop: `${margins.top}mm`,
        paddingRight: `${margins.right}mm`,
        paddingBottom: `${margins.bottom}mm`,
        paddingLeft: `${margins.left}mm`,
      }
    : undefined;

  const clearFormatting = () => {
    editor
      ?.chain()
      .focus()
      .unsetAllMarks()
      .clearNodes()
      .unsetFontFamily()
      .unsetFontSize()
      .unsetLineHeight()
      .unsetColor()
      .unsetHighlight()
      .run();
  };

  const marginLabel =
    MARGIN_PRESETS.find((preset) => sameMargins(preset.margins, margins))?.label || "Custom";

  return (
    <div className={`rte${visual ? "" : " is-source"}${documentMode ? " is-doc" : ""}`}>
      {documentMode ? (
        <div className="rte-tabs" role="tablist" aria-label="Ribbon">
          {(
            [
              ["home", "Home"],
              ["insert", "Insert"],
              ["layout", "Layout"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={ribbonTab === id}
              className={ribbonTab === id ? "is-on" : ""}
              onClick={() => {
                setRibbonTab(id);
                if (id !== "layout") setShowMargins(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className={`rte-toolbar${documentMode ? " is-ribbon" : ""}`} role="toolbar" aria-label="Formatting">
        {documentMode ? (
          ribbonTab === "home" ? (
            <>
              <div className="rte-group" aria-label="Clipboard">
                <div className="rte-group-body">
                  <div className="rte-group-row">
                    <ToolButton icon="fa-solid fa-rotate-left" label="Undo" disabled={off || !state?.canUndo} onClick={() => editor!.chain().focus().undo().run()} />
                    <ToolButton icon="fa-solid fa-rotate-right" label="Redo" disabled={off || !state?.canRedo} onClick={() => editor!.chain().focus().redo().run()} />
                    <ToolButton icon="fa-solid fa-eraser" label="Clear formatting" disabled={off} onClick={clearFormatting} />
                  </div>
                </div>
                <span className="rte-group-label">Clipboard</span>
              </div>

              <div className="rte-group" aria-label="Font">
                <div className="rte-group-body">
                  <div className="rte-group-row">
                    <select
                      aria-label="Font"
                      className="rte-font-face"
                      value={state?.fontFamily || FONT_FACES[0].value}
                      disabled={off}
                      onChange={(event) => editor!.chain().focus().setFontFamily(event.target.value).run()}
                    >
                      {FONT_FACES.map((face) => (
                        <option key={face.label} value={face.value}>
                          {face.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Font size"
                      className="rte-font-size"
                      value={state?.fontSize || "12"}
                      disabled={off}
                      onChange={(event) => editor!.chain().focus().setFontSize(`${event.target.value}pt`).run()}
                    >
                      {FONT_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="rte-group-row">
                    <ToolButton icon="fa-solid fa-bold" label="Bold (Ctrl+B)" active={state?.bold} disabled={off} onClick={() => editor!.chain().focus().toggleBold().run()} />
                    <ToolButton icon="fa-solid fa-italic" label="Italic (Ctrl+I)" active={state?.italic} disabled={off} onClick={() => editor!.chain().focus().toggleItalic().run()} />
                    <ToolButton icon="fa-solid fa-underline" label="Underline (Ctrl+U)" active={state?.underline} disabled={off} onClick={() => editor!.chain().focus().toggleUnderline().run()} />
                    <ToolButton icon="fa-solid fa-strikethrough" label="Strikethrough" active={state?.strike} disabled={off} onClick={() => editor!.chain().focus().toggleStrike().run()} />
                    <span className="rte-sep" />
                    <div className="rte-color-pair">
                      <span className="rte-color-chip" style={{ borderBottomColor: state?.color || "#1a2330" }} aria-hidden="true">
                        A
                      </span>
                      <ColorSwatch
                        label="Font colour"
                        colors={TEXT_COLORS}
                        value={state?.color}
                        disabled={off}
                        onPick={(color) => editor!.chain().focus().setColor(color).run()}
                      />
                    </div>
                    <div className="rte-color-pair is-highlight">
                      <span className="rte-color-chip is-highlight" style={{ background: state?.highlight || "#fef08a" }} aria-hidden="true">
                        <i className="fa-solid fa-highlighter" />
                      </span>
                      <ColorSwatch
                        label="Text highlight"
                        colors={HIGHLIGHTS}
                        value={state?.highlight || "#ffffff"}
                        disabled={off}
                        onPick={(color) => {
                          if (color === "#ffffff") editor!.chain().focus().unsetHighlight().run();
                          else editor!.chain().focus().toggleHighlight({ color }).run();
                        }}
                      />
                    </div>
                  </div>
                </div>
                <span className="rte-group-label">Font</span>
              </div>

              <div className="rte-group" aria-label="Paragraph">
                <div className="rte-group-body">
                  <div className="rte-group-row">
                    <ToolButton icon="fa-solid fa-list-ul" label="Bullets" active={state?.bullet} disabled={off} onClick={() => editor!.chain().focus().toggleBulletList().run()} />
                    <ToolButton icon="fa-solid fa-list-ol" label="Numbering" active={state?.ordered} disabled={off} onClick={() => editor!.chain().focus().toggleOrderedList().run()} />
                    <ToolButton icon="fa-solid fa-outdent" label="Decrease indent" disabled={off || !state?.canOutdent} onClick={() => editor!.chain().focus().liftListItem("listItem").run()} />
                    <ToolButton icon="fa-solid fa-indent" label="Increase indent" disabled={off || !state?.canIndent} onClick={() => editor!.chain().focus().sinkListItem("listItem").run()} />
                  </div>
                  <div className="rte-group-row">
                    <ToolButton icon="fa-solid fa-align-left" label="Align left" active={state?.align === "left"} disabled={off} onClick={() => editor!.chain().focus().setTextAlign("left").run()} />
                    <ToolButton icon="fa-solid fa-align-center" label="Align centre" active={state?.align === "center"} disabled={off} onClick={() => editor!.chain().focus().setTextAlign("center").run()} />
                    <ToolButton icon="fa-solid fa-align-right" label="Align right" active={state?.align === "right"} disabled={off} onClick={() => editor!.chain().focus().setTextAlign("right").run()} />
                    <ToolButton icon="fa-solid fa-align-justify" label="Justify" active={state?.align === "justify"} disabled={off} onClick={() => editor!.chain().focus().setTextAlign("justify").run()} />
                    <select
                      aria-label="Line spacing"
                      className="rte-spacing"
                      value={state?.lineHeight || "1.5"}
                      disabled={off}
                      onChange={(event) => editor!.chain().focus().setLineHeight(event.target.value).run()}
                    >
                      {LINE_HEIGHTS.map((row) => (
                        <option key={row.value} value={row.value}>
                          {row.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <span className="rte-group-label">Paragraph</span>
              </div>

              <div className="rte-group" aria-label="Styles">
                <div className="rte-group-body">
                  <div className="rte-styles" role="group" aria-label="Styles">
                    {(
                      [
                        ["p", "Normal"],
                        ["h1", "Title"],
                        ["h2", "Heading 1"],
                        ["h3", "Heading 2"],
                        ["h4", "Heading 3"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`rte-style${(state?.block ?? "p") === value ? " is-on" : ""} rte-style--${value}`}
                        disabled={off}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          const chain = editor!.chain().focus();
                          if (value === "p") chain.setParagraph().run();
                          else chain.setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 | 4 }).run();
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <span className="rte-group-label">Styles</span>
              </div>
            </>
          ) : ribbonTab === "insert" ? (
            <>
              <div className="rte-group" aria-label="Illustrations">
                <div className="rte-group-body">
                  <div className="rte-group-row rte-group-row--tiles">
                    <button type="button" className="rte-tile" disabled={off || uploading} onMouseDown={(e) => e.preventDefault()} onClick={() => fileInput.current?.click()}>
                      <i className="fa-regular fa-image" aria-hidden="true" />
                      <span>Pictures</span>
                    </button>
                    <button
                      type="button"
                      className={`rte-tile${state?.table ? " is-on" : ""}`}
                      disabled={off}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => editor!.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                    >
                      <i className="fa-solid fa-table" aria-hidden="true" />
                      <span>Table</span>
                    </button>
                    <button type="button" className="rte-tile" disabled={off} onMouseDown={(e) => e.preventDefault()} onClick={() => editor!.chain().focus().setHorizontalRule().run()}>
                      <i className="fa-solid fa-minus" aria-hidden="true" />
                      <span>Divider</span>
                    </button>
                  </div>
                </div>
                <span className="rte-group-label">Illustrations</span>
              </div>
              <div className="rte-group" aria-label="Links">
                <div className="rte-group-body">
                  <div className="rte-group-row rte-group-row--tiles">
                    <button type="button" className={`rte-tile${state?.link ? " is-on" : ""}`} disabled={off} onMouseDown={(e) => e.preventDefault()} onClick={setLink}>
                      <i className="fa-solid fa-link" aria-hidden="true" />
                      <span>Link</span>
                    </button>
                    <button
                      type="button"
                      className={`rte-tile${state?.quote ? " is-on" : ""}`}
                      disabled={off}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => editor!.chain().focus().toggleBlockquote().run()}
                    >
                      <i className="fa-solid fa-quote-left" aria-hidden="true" />
                      <span>Quote</span>
                    </button>
                  </div>
                </div>
                <span className="rte-group-label">Links</span>
              </div>
              <div className="rte-group" aria-label="Table tools">
                <div className="rte-group-body">
                  <div className="rte-group-row">
                    <ToolButton icon="fa-solid fa-plus" label="Add row" disabled={off || !state?.table} onClick={() => editor!.chain().focus().addRowAfter().run()} />
                    <ToolButton icon="fa-solid fa-table-columns" label="Add column" disabled={off || !state?.table} onClick={() => editor!.chain().focus().addColumnAfter().run()} />
                    <ToolButton icon="fa-solid fa-trash" label="Delete table" disabled={off || !state?.table} onClick={() => editor!.chain().focus().deleteTable().run()} />
                  </div>
                </div>
                <span className="rte-group-label">Table</span>
              </div>
            </>
          ) : (
            <>
              <div className="rte-group" aria-label="Page setup">
                <div className="rte-group-body">
                  <div className="rte-group-row">
                    <select
                      aria-label="Margins"
                      value={marginPreset === "custom" ? "custom" : marginPreset}
                      disabled={off}
                      onChange={(event) => {
                        const next = MARGIN_PRESETS.find((preset) => preset.id === event.target.value);
                        if (next) {
                          setMargins(next.margins);
                          setShowMargins(false);
                        } else {
                          setShowMargins(true);
                        }
                      }}
                    >
                      {MARGIN_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          Margins: {preset.label}
                        </option>
                      ))}
                      <option value="custom">Custom margins…</option>
                    </select>
                    <button
                      type="button"
                      className={`rte-mode${showMargins ? " is-active" : ""}`}
                      onClick={() => setShowMargins((value) => !value)}
                      aria-pressed={showMargins}
                    >
                      <i className="fa-solid fa-ruler-combined" aria-hidden="true" /> Custom
                    </button>
                  </div>
                  <p className="rte-page-hint">A4 · what you see here is what pupils get as PDF</p>
                </div>
                <span className="rte-group-label">Page Setup</span>
              </div>
              <div className="rte-group" aria-label="Margin presets">
                <div className="rte-group-body">
                  <div className="rte-margin-presets is-ribbon">
                    {MARGIN_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={sameMargins(preset.margins, margins) ? "is-on" : ""}
                        onClick={() => {
                          setMargins(preset.margins);
                          setShowMargins(false);
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <span className="rte-group-label">Margins</span>
              </div>
            </>
          )
        ) : (
          <>
            <select
              aria-label="Text style"
              value={state?.block ?? "p"}
              disabled={off}
              onChange={(event) => {
                const value = event.target.value;
                const chain = editor!.chain().focus();
                if (value === "p") chain.setParagraph().run();
                else chain.setHeading({ level: Number(value.slice(1)) as 2 | 3 | 4 }).run();
              }}
            >
              <option value="p">Paragraph</option>
              <option value="h2">Section heading</option>
              <option value="h3">Sub-heading</option>
              <option value="h4">Small heading</option>
            </select>
            <span className="rte-sep" />
            <ToolButton icon="fa-solid fa-bold" label="Bold (Ctrl+B)" active={state?.bold} disabled={off} onClick={() => editor!.chain().focus().toggleBold().run()} />
            <ToolButton icon="fa-solid fa-italic" label="Italic (Ctrl+I)" active={state?.italic} disabled={off} onClick={() => editor!.chain().focus().toggleItalic().run()} />
            <ToolButton icon="fa-solid fa-underline" label="Underline (Ctrl+U)" active={state?.underline} disabled={off} onClick={() => editor!.chain().focus().toggleUnderline().run()} />
            <ToolButton icon="fa-solid fa-strikethrough" label="Strikethrough" active={state?.strike} disabled={off} onClick={() => editor!.chain().focus().toggleStrike().run()} />
            <ToolButton icon="fa-solid fa-link" label="Link" active={state?.link} disabled={off} onClick={setLink} />
            <span className="rte-sep" />
            <ToolButton icon="fa-solid fa-list-ul" label="Bulleted list" active={state?.bullet} disabled={off} onClick={() => editor!.chain().focus().toggleBulletList().run()} />
            <ToolButton icon="fa-solid fa-list-ol" label="Numbered list" active={state?.ordered} disabled={off} onClick={() => editor!.chain().focus().toggleOrderedList().run()} />
            <ToolButton icon="fa-solid fa-quote-left" label="Quote" active={state?.quote} disabled={off} onClick={() => editor!.chain().focus().toggleBlockquote().run()} />
            <ToolButton icon="fa-solid fa-minus" label="Divider" disabled={off} onClick={() => editor!.chain().focus().setHorizontalRule().run()} />
            <ToolButton icon="fa-regular fa-image" label="Insert image" disabled={off || uploading} onClick={() => fileInput.current?.click()} />
            <span className="rte-sep" />
            <ToolButton icon="fa-solid fa-rotate-left" label="Undo (Ctrl+Z)" disabled={off || !state?.canUndo} onClick={() => editor!.chain().focus().undo().run()} />
            <ToolButton icon="fa-solid fa-rotate-right" label="Redo (Ctrl+Shift+Z)" disabled={off || !state?.canRedo} onClick={() => editor!.chain().focus().redo().run()} />
            <button type="button" className={`rte-mode${visual ? "" : " is-active"}`} onClick={toggleMode} aria-pressed={!visual}>
              <i className="fa-solid fa-code" aria-hidden="true" /> {visual ? "HTML" : "Visual"}
            </button>
          </>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void insertImage(file);
          }}
        />
      </div>

      {documentMode && showMargins ? (
        <div className="rte-margins" role="group" aria-label="Custom page margins">
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <label key={side}>
              <span>{side[0].toUpperCase() + side.slice(1)}</span>
              <input
                type="number"
                min={5}
                max={50}
                step={1}
                value={margins[side]}
                onChange={(event) => {
                  const next = Math.min(50, Math.max(5, Number(event.target.value) || 5));
                  setMargins((current) => ({ ...current, [side]: next }));
                }}
              />
              <em>mm</em>
            </label>
          ))}
        </div>
      ) : null}

      {complex && visual && !documentMode ? (
        <p className="rte-note">
          <i className="fa-solid fa-circle-info" aria-hidden="true" /> This content was imported with custom layout (tables, embeds or WordPress blocks).
          Editing it visually may simplify that layout. Use{" "}
          <button type="button" className="app-link-btn" onClick={toggleMode}>
            HTML mode
          </button>{" "}
          to keep it exactly.
        </p>
      ) : null}
      {uploading ? (
        <p className="rte-note">
          <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> Uploading image…
        </p>
      ) : null}
      {uploadError ? <p className="rte-note is-error">{uploadError}</p> : null}

      <div className={`rte-body${documentMode ? " is-doc-stage" : ""}`} hidden={!visual}>
        {documentMode ? (
          <>
            <div
              className="rte-ruler"
              aria-hidden="true"
              style={{
                ["--m-left" as string]: `${margins.left}mm`,
                ["--m-right" as string]: `${margins.right}mm`,
              }}
            >
              <span className="rte-ruler-track" />
            </div>
            <div className="rte-page" style={pageStyle}>
              {editor ? <EditorContent editor={editor} /> : <div className="rte-loading">Loading editor…</div>}
            </div>
          </>
        ) : editor ? (
          <EditorContent editor={editor} />
        ) : (
          <div className="rte-loading">Loading editor…</div>
        )}
      </div>
      {documentMode && visual ? (
        <div className="rte-statusbar" aria-hidden="true">
          <span>Page 1 of 1</span>
          <span>A4</span>
          <span>Margins: {marginLabel}</span>
          <span className="rte-statusbar-end">100%</span>
        </div>
      ) : null}
      {!visual ? (
        <textarea
          className="rte-source"
          aria-label="HTML"
          spellCheck={false}
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
            emit(event.target.value);
          }}
        />
      ) : null}
    </div>
  );
}
