/**
 * Landing visuals: what a prompt actually produces. Two panels — the Studio
 * Explorer hierarchy and the Luau that lands in it — drawn in CSS/SVG rather
 * than screenshots so they stay sharp, themed, and translatable.
 *
 * These are illustrations of real output shapes, not fabricated claims.
 */

type Node = {
  label: string;
  kind: "folder" | "model" | "part" | "script" | "remote" | "gui";
  depth: number;
};

const TREE: Node[] = [
  { label: "Workspace", kind: "folder", depth: 0 },
  { label: "Arena", kind: "model", depth: 1 },
  { label: "Floor", kind: "part", depth: 2 },
  { label: "SpawnPads", kind: "folder", depth: 2 },
  { label: "Walls", kind: "model", depth: 2 },
  { label: "ServerScriptService", kind: "folder", depth: 0 },
  { label: "RoundManager", kind: "script", depth: 1 },
  { label: "DamageHandler", kind: "script", depth: 1 },
  { label: "ReplicatedStorage", kind: "folder", depth: 0 },
  { label: "Remotes", kind: "folder", depth: 1 },
  { label: "RoundState", kind: "remote", depth: 2 },
  { label: "StarterGui", kind: "folder", depth: 0 },
  { label: "TimerHud", kind: "gui", depth: 1 },
];

const KIND_COLOR: Record<Node["kind"], string> = {
  folder: "text-muted",
  model: "text-sky-400",
  part: "text-zinc-400",
  script: "text-emerald-400",
  remote: "text-amber-400",
  gui: "text-violet-400",
};

function NodeIcon({ kind }: { kind: Node["kind"] }) {
  const cls = `size-3.5 shrink-0 ${KIND_COLOR[kind]}`;
  if (kind === "script") {
    return (
      <svg viewBox="0 0 16 16" fill="none" className={cls}>
        <rect
          x="3"
          y="2"
          width="10"
          height="12"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <path
          d="M5.5 6h5M5.5 8.5h5M5.5 11h3"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === "folder") {
    return (
      <svg viewBox="0 0 16 16" fill="none" className={cls}>
        <path
          d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.4l1.2 1.5h5.4A1.5 1.5 0 0 1 14 6v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12V4.5Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === "remote") {
    return (
      <svg viewBox="0 0 16 16" fill="none" className={cls}>
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M4.5 4.5a5 5 0 0 0 0 7M11.5 4.5a5 5 0 0 1 0 7"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === "gui") {
    return (
      <svg viewBox="0 0 16 16" fill="none" className={cls}>
        <rect
          x="2.5"
          y="3"
          width="11"
          height="10"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <path d="M2.5 6h11" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    );
  }
  // part / model
  return (
    <svg viewBox="0 0 16 16" fill="none" className={cls}>
      <path
        d="M8 2.2 13.5 5v6L8 13.8 2.5 11V5L8 2.2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M2.5 5 8 7.8 13.5 5M8 7.8v6"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExplorerPanel() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-red-500/70" />
          <span className="size-2.5 rounded-full bg-amber-500/70" />
          <span className="size-2.5 rounded-full bg-emerald-500/70" />
        </span>
        <span className="text-[11px] font-medium text-muted">Explorer</span>
      </div>
      <div className="p-3 font-mono text-[12px] leading-6">
        {TREE.map((n, i) => (
          <div
            key={`${n.label}-${i}`}
            className="flex items-center gap-1.5 rounded px-1 hover:bg-hover"
            style={{ paddingLeft: `${n.depth * 14 + 4}px` }}
          >
            <NodeIcon kind={n.kind} />
            <span
              className={
                n.depth === 0 ? "text-muted" : "text-foreground/90"
              }
            >
              {n.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Minimal Luau colouring — hand-spanned, no highlighter dependency. */
const K = "text-sky-400"; // keyword
const S = "text-emerald-400"; // string
const F = "text-amber-300"; // function/api
const C = "text-faint"; // comment

function CodePanel() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" fill="none" className="size-3.5 text-emerald-400">
            <rect
              x="3"
              y="2"
              width="10"
              height="12"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="1.3"
            />
          </svg>
          <span className="text-[11px] font-medium text-muted">
            RoundManager
          </span>
        </span>
        <span className="text-[10px] text-faint">Script</span>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[11.5px] leading-[1.7]">
        <code>
          <span className={C}>-- Runs the round loop and tells clients</span>
          {"\n"}
          <span className={K}>local</span> Players = game:
          <span className={F}>GetService</span>(<span className={S}>&quot;Players&quot;</span>)
          {"\n"}
          <span className={K}>local</span> Remotes = game:
          <span className={F}>GetService</span>(<span className={S}>&quot;ReplicatedStorage&quot;</span>)
          {"\n\n"}
          <span className={K}>local</span> ROUND_TIME = <span className="text-orange-300">90</span>
          {"\n\n"}
          <span className={K}>local function</span> <span className={F}>startRound</span>()
          {"\n  "}
          <span className={K}>for</span> _, player <span className={K}>in</span> Players:
          <span className={F}>GetPlayers</span>() <span className={K}>do</span>
          {"\n    "}
          <span className={K}>local</span> char = player.Character
          {"\n    "}
          <span className={K}>if</span> <span className={K}>not</span> char <span className={K}>then</span> <span className={K}>continue</span> <span className={K}>end</span>
          {"\n    "}
          char:<span className={F}>PivotTo</span>(arenaSpawn.CFrame)
          {"\n  "}
          <span className={K}>end</span>
          {"\n\n  "}
          <span className={K}>for</span> t = ROUND_TIME, <span className="text-orange-300">0</span>, <span className="text-orange-300">-1</span> <span className={K}>do</span>
          {"\n    "}
          Remotes.RoundState:<span className={F}>FireAllClients</span>(t)
          {"\n    "}
          task.<span className={F}>wait</span>(<span className="text-orange-300">1</span>)
          {"\n  "}
          <span className={K}>end</span>
          {"\n"}
          <span className={K}>end</span>
        </code>
      </pre>
    </div>
  );
}

export function StudioPreview() {
  return (
    <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
      <ExplorerPanel />
      <CodePanel />
    </div>
  );
}
