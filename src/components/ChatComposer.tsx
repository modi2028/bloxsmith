"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCredits } from "@/lib/credits-format";
import { CoinStack } from "./BrandMarks";
import { ModelPicker, type ChatModel } from "./ModelPicker";
import { StudioStatus } from "./StudioStatus";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGES = 4;

type PendingImage = {
  id: string;
  url: string; // object URL preview
  name: string;
  file: File;
};

/**
 * Prompt composer with drag-and-drop / paste / browse image references and a
 * model switcher. Controlled by ChatApp: calls onSend(text) and disables
 * itself while a turn is streaming.
 *
 * NOTE: images are previewed client-side; sending them to the model ships
 * with project storage (a notice is shown if images are attached).
 */
export function ChatComposer({
  onSend,
  onStop,
  busy,
  models,
  modelId,
  onModelChange,
  compact = false,
  autoFocus = false,
  initialText,
  balance,
  studioConnected,
}: {
  onSend: (text: string) => void;
  onStop?: () => void;
  busy: boolean;
  models: ChatModel[];
  modelId: string;
  onModelChange: (id: string) => void;
  compact?: boolean;
  autoFocus?: boolean;
  /** Initial text (suggestion chips) — pair with a `key` to re-seed. */
  initialText?: string;
  balance?: number;
  /** Plugin connection at render time — shows the live green/red chip. */
  studioConnected?: boolean | null;
}) {
  const [text, setText] = useState(initialText ?? "");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [dragActive, setDragActive] = useState(false);
  // Attached image being previewed full-size (click a thumbnail to open).
  const [preview, setPreview] = useState<PendingImage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [preview]);

  const addFiles = useCallback((files: FileList | File[]) => {
    setImages((prev) => {
      const next = [...prev];
      for (const file of Array.from(files)) {
        if (!ACCEPTED_TYPES.includes(file.type)) continue;
        if (next.length >= MAX_IMAGES) break;
        next.push({
          id: crypto.randomUUID(),
          url: URL.createObjectURL(file),
          name: file.name,
          file,
        });
      }
      return next;
    });
  }, []);

  const removeImage = (id: string) => {
    setPreview((p) => (p?.id === id ? null : p));
    setImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((img) => img.id !== id);
    });
  };

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    onSend(trimmed);
    setText("");
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files).filter((f) =>
      ACCEPTED_TYPES.includes(f.type),
    );
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const canSend = text.trim().length > 0 && !busy;

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={`glass relative rounded-2xl border transition-colors ${
          dragActive
            ? "border-ember shadow-[0_0_0_3px_rgba(245,158,11,0.15)]"
            : "border-white/10 focus-within:border-ember/60"
        }`}
      >
        {dragActive && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/80">
            <span className="text-sm font-medium text-ember">
              Drop images to attach as references
            </span>
          </div>
        )}

        {images.length > 0 && (
          <div className="px-4 pt-4">
            <div className="flex flex-wrap gap-2">
              {images.map((img) => (
                <div key={img.id} className="group relative">
                  <button
                    type="button"
                    title={`Preview ${img.name}`}
                    onClick={() => setPreview(img)}
                    className="block cursor-zoom-in rounded-lg transition hover:brightness-110"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.name}
                      className="h-14 w-14 rounded-lg border border-line object-cover"
                    />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${img.name}`}
                    onClick={() => removeImage(img.id)}
                    className="absolute -right-1.5 -top-1.5 hidden size-5 items-center justify-center rounded-full bg-stone-800 text-xs text-stone-300 ring-1 ring-line-strong group-hover:flex hover:bg-stone-700"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-faint">
              Image references aren&apos;t sent to the AI yet — coming with
              project storage.
            </p>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={compact ? 2 : 3}
          autoFocus={autoFocus}
          placeholder={busy ? "Working…" : "Describe a game mechanic…"}
          className="w-full resize-none bg-transparent px-5 pt-4 pb-2 text-[15px] leading-relaxed placeholder:text-faint focus:outline-none"
        />

        <div className="flex items-center justify-between px-3.5 pb-3.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach reference images (or drag & drop / paste)"
              className="flex size-8 items-center justify-center rounded-lg text-muted transition hover:bg-white/5 hover:text-foreground"
            >
              <svg viewBox="0 0 20 20" fill="none" className="size-[18px]">
                <path
                  d="M13.5 8.5 8.9 13.1a2.2 2.2 0 0 1-3.1-3.1l5.3-5.3a3.4 3.4 0 0 1 4.8 4.8l-5.3 5.3a4.6 4.6 0 0 1-6.5-6.5L8.7 3.7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <ModelPicker
              models={models}
              modelId={modelId}
              onChange={onModelChange}
              disabled={busy}
            />
            {balance != null && (
              <span
                className="glass-chip flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-xs text-muted"
                title="Your credit balance"
              >
                <CoinStack className="size-3.5 text-ember" />
                <span className="font-semibold text-ember">
                  {formatCredits(balance)}
                </span>
              </span>
            )}
            {studioConnected != null && (
              <StudioStatus initial={studioConnected} />
            )}
          </div>

          {busy ? (
            <button
              type="button"
              onClick={onStop}
              title="Stop generating"
              className="flex size-9 items-center justify-center rounded-xl border border-line-strong bg-surface text-foreground transition hover:border-red-500/60 hover:text-red-300"
            >
              <svg viewBox="0 0 20 20" className="size-3.5">
                <rect
                  x="4"
                  y="4"
                  width="12"
                  height="12"
                  rx="2"
                  fill="currentColor"
                />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              disabled={!canSend}
              onClick={submit}
              title="Send (Enter)"
              className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-ember to-ember-strong text-stone-950 transition enabled:hover:brightness-110 disabled:opacity-30"
            >
              <svg viewBox="0 0 20 20" fill="none" className="size-4">
                <path
                  d="M10 16V4m0 0 -5 5m5-5 5 5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Full-size preview of an attached image (click backdrop / Esc closes). */}
      {preview && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview of ${preview.name}`}
        >
          <button
            type="button"
            aria-label="Close preview"
            onClick={() => setPreview(null)}
            className="absolute inset-0 cursor-zoom-out bg-black/80 backdrop-blur-sm"
          />
          <div className="fade-up pointer-events-none relative flex max-h-full max-w-full flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.url}
              alt={preview.name}
              className="max-h-[82vh] max-w-[92vw] rounded-xl border border-white/15 object-contain shadow-2xl shadow-black/60"
            />
            <span className="glass-chip pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 py-1.5 pl-4 pr-1.5 text-xs text-muted">
              <span className="max-w-[50vw] truncate">{preview.name}</span>
              <button
                type="button"
                onClick={() => removeImage(preview.id)}
                className="rounded-full border border-line-strong px-2.5 py-1 text-xs text-muted transition hover:border-red-500/60 hover:text-red-300"
              >
                Remove
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
