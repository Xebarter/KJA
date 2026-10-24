"use client";

import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";

type Props = {
  initialHtml: string;
  onChange: (html: string) => void;
  onUpload: (file: File) => Promise<string>;
  startInSource?: boolean;
  complex?: boolean;
  placeholder?: string;
};

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

export function RichTextEditor({ initialHtml, onChange, onUpload, startInSource, complex, placeholder }: Props) {
  const [source, setSource] = useState(initialHtml);
  const [mode, setMode] = useState<"visual" | "html">(startInSource ? "html" : "visual");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const latest = useRef(initialHtml);
  const change = useRef(onChange);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    change.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      Image,
      Placeholder.configure({
        placeholder: placeholder || "Tell the story… Use headings to break it into sections.",
      }),
    ],
    content: initialHtml,
    editorProps: { attributes: { class: "rte-prose", spellcheck: "true" } },
    onUpdate: ({ editor: current }) => {
      const html = current.isEmpty ? "" : current.getHTML();
      latest.current = html;
      change.current(html);
    },
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return null;
      return {
        block: current.isActive("heading", { level: 2 })
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
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
      };
    },
  });

  const visual = mode === "visual";
  const off = !editor || !visual;

  const toggleMode = () => {
    if (visual) {
      setSource(latest.current);
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

  return (
    <div className={`rte${visual ? "" : " is-source"}`}>
      <div className="rte-toolbar" role="toolbar" aria-label="Formatting">
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

      {complex && visual ? (
        <p className="rte-note">
          <i className="fa-solid fa-circle-info" aria-hidden="true" /> This content was imported with custom layout (tables, embeds or WordPress blocks).
          Editing it visually may simplify that layout. Use <button type="button" className="app-link-btn" onClick={toggleMode}>HTML mode</button> to keep it exactly.
        </p>
      ) : null}
      {uploading ? <p className="rte-note"><i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> Uploading image…</p> : null}
      {uploadError ? <p className="rte-note is-error">{uploadError}</p> : null}

      <div className="rte-body" hidden={!visual}>
        {editor ? <EditorContent editor={editor} /> : <div className="rte-loading">Loading editor…</div>}
      </div>
      {!visual ? (
        <textarea
          className="rte-source"
          aria-label="Story HTML"
          spellCheck={false}
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
            latest.current = event.target.value;
            change.current(event.target.value);
          }}
        />
      ) : null}
    </div>
  );
}
