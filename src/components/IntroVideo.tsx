"use client";

import { useRef, useState } from "react";

/**
 * Landing-page intro video. Click-to-play with preload="none" so the (large)
 * mp4 is only downloaded by visitors who actually press play — keeps the page
 * fast and bandwidth sane.
 */
export function IntroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const play = () => {
    setPlaying(true);
    void videoRef.current?.play();
  };

  return (
    <div className="relative mx-auto w-full max-w-3xl">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 rounded-[32px]"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(245,158,11,0.14), transparent 65%)",
        }}
      />
      <div className="relative overflow-hidden rounded-2xl border border-line-strong bg-stone-950 shadow-2xl shadow-black/50">
        <video
          ref={videoRef}
          src="/intro.mp4"
          preload="none"
          controls={playing}
          playsInline
          onEnded={() => setPlaying(false)}
          className="aspect-video w-full"
        />
        {!playing && (
          <button
            type="button"
            onClick={play}
            aria-label="Play the intro video"
            className="group absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-stone-950/85 to-stone-900/60"
          >
            <span className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-ember to-ember-strong shadow-[0_0_40px_-8px_rgba(245,158,11,0.8)] transition group-hover:scale-110">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="ml-1 size-7 text-stone-950"
              >
                <path d="M8 5.5v13l11-6.5-11-6.5Z" />
              </svg>
            </span>
            <span className="text-sm font-medium text-foreground">
              Watch the intro
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
