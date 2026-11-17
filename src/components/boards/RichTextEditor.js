'use client';

import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  Highlighter,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';

function ToolbarButton({ label, active = false, disabled, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`btn btn-ghost btn-icon min-h-8 min-w-8 ${active ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : ''}`}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({ name, value, onChange, disabled = false }) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
        underline: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color.configure({ types: ['textStyle'] }),
      Highlight.configure({ multicolor: true }),
    ],
    content: value || '',
    onUpdate: ({ editor: currentEditor }) => onChange(currentEditor.getHTML()),
    editorProps: {
      attributes: {
        class: 'min-h-36 px-3 py-2 text-sm leading-6 outline-none',
        'aria-label': 'Ticket description',
      },
    },
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== (value || '<p></p>')) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  function addLink() {
    if (!editor) return;
    const currentHref = editor.getAttributes('link').href || '';
    const href = window.prompt('Enter a link URL', currentHref);
    if (href === null) return;
    const cleanHref = href.trim();
    if (!cleanHref) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    try {
      const parsed = new URL(cleanHref);
      if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) throw new Error('Unsupported URL protocol.');
      editor.chain().focus().extendMarkRange('link').setLink({ href: parsed.toString() }).run();
    } catch {
      window.alert('Enter a valid http, https, or mailto link.');
    }
  }

  const toolbarDisabled = disabled || !editor;

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Description</span>
      <div className={`rich-text-editor overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] ${disabled ? 'opacity-70' : ''}`}>
        <div className="flex flex-wrap items-center gap-1 border-b border-[var(--border)] p-1.5" role="toolbar" aria-label="Description formatting">
          <ToolbarButton label="Bold" active={editor?.isActive('bold')} disabled={toolbarDisabled} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={15} /></ToolbarButton>
          <ToolbarButton label="Italic" active={editor?.isActive('italic')} disabled={toolbarDisabled} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={15} /></ToolbarButton>
          <ToolbarButton label="Underline" active={editor?.isActive('underline')} disabled={toolbarDisabled} onClick={() => editor?.chain().focus().toggleUnderline().run()}><UnderlineIcon size={15} /></ToolbarButton>
          <ToolbarButton label="Strikethrough" active={editor?.isActive('strike')} disabled={toolbarDisabled} onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough size={15} /></ToolbarButton>
          <ToolbarButton label="Heading 1" active={editor?.isActive('heading', { level: 1 })} disabled={toolbarDisabled} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={15} /></ToolbarButton>
          <ToolbarButton label="Heading 2" active={editor?.isActive('heading', { level: 2 })} disabled={toolbarDisabled} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></ToolbarButton>
          <ToolbarButton label="Bulleted list" active={editor?.isActive('bulletList')} disabled={toolbarDisabled} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={15} /></ToolbarButton>
          <ToolbarButton label="Numbered list" active={editor?.isActive('orderedList')} disabled={toolbarDisabled} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={15} /></ToolbarButton>
          <ToolbarButton label="Align left" active={editor?.isActive({ textAlign: 'left' })} disabled={toolbarDisabled} onClick={() => editor?.chain().focus().setTextAlign('left').run()}><AlignLeft size={15} /></ToolbarButton>
          <ToolbarButton label="Align center" active={editor?.isActive({ textAlign: 'center' })} disabled={toolbarDisabled} onClick={() => editor?.chain().focus().setTextAlign('center').run()}><AlignCenter size={15} /></ToolbarButton>
          <ToolbarButton label="Align right" active={editor?.isActive({ textAlign: 'right' })} disabled={toolbarDisabled} onClick={() => editor?.chain().focus().setTextAlign('right').run()}><AlignRight size={15} /></ToolbarButton>
          <label className="btn btn-ghost btn-icon relative min-h-8 min-w-8 cursor-pointer" title="Text color">
            <span aria-hidden="true" className="text-sm font-bold">A</span>
            <input
              type="color"
              aria-label="Text color"
              disabled={toolbarDisabled}
              onChange={(event) => editor?.chain().focus().setColor(event.target.value).run()}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
          <label className="btn btn-ghost btn-icon relative min-h-8 min-w-8 cursor-pointer" title="Highlight color">
            <Highlighter size={15} aria-hidden="true" />
            <input
              type="color"
              aria-label="Highlight color"
              disabled={toolbarDisabled}
              onChange={(event) => editor?.chain().focus().toggleHighlight({ color: event.target.value }).run()}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
          <ToolbarButton label="Insert or edit link" active={editor?.isActive('link')} disabled={toolbarDisabled} onClick={addLink}><LinkIcon size={15} /></ToolbarButton>
          <ToolbarButton label="Undo" disabled={toolbarDisabled || !editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={15} /></ToolbarButton>
          <ToolbarButton label="Redo" disabled={toolbarDisabled || !editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={15} /></ToolbarButton>
        </div>
        <EditorContent editor={editor} />
      </div>
      <input type="hidden" name={name} value={value || ''} />
    </div>
  );
}
