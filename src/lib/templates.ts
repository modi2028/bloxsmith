/**
 * One-click starters for the composer. A blank prompt box is the biggest
 * drop-off point for new users, and each template doubles as a landing page
 * at /templates/<slug>.
 */

export type Template = {
  slug: string;
  title: string;
  blurb: string;
  category: "Games" | "Mechanics" | "Systems" | "World";
  /** What the AI actually receives. */
  prompt: string;
  /** Shown on the template page so expectations are concrete. */
  builds: string[];
};

export const TEMPLATES: Template[] = [
  {
    slug: "tycoon-base",
    title: "Tycoon base",
    blurb: "Claimable plot, dropper, collector and a cash counter",
    category: "Games",
    prompt:
      "Build a classic Roblox tycoon starter: one claimable plot with an owner door, a dropper that spawns cash parts on a timer, a conveyor that moves them to a collector pad, and a leaderstats Cash value that goes up when the collector eats a part. Add a simple buy button that upgrades the dropper speed.",
    builds: [
      "Claimable plot with an owner-only door",
      "Dropper, conveyor and collector pad",
      "leaderstats Cash with server-side validation",
      "An upgrade button that speeds the dropper up",
    ],
  },
  {
    slug: "obby-generator",
    title: "Obby course",
    blurb: "Checkpoints, killbricks and a respawn that remembers progress",
    category: "Games",
    prompt:
      "Build an obby course with 10 platforms of increasing difficulty, moving and disappearing platforms, lava killbricks, and numbered checkpoints. When a player touches a checkpoint it saves their progress, and dying respawns them at their last checkpoint instead of the start.",
    builds: [
      "10 platforms with rising difficulty",
      "Moving and vanishing platforms",
      "Killbricks that respawn the player",
      "Checkpoints that persist through death",
    ],
  },
  {
    slug: "round-system",
    title: "Round system",
    blurb: "Intermission, teleports, a timer and a winner",
    category: "Systems",
    prompt:
      "Build a round system: a 20 second intermission, then teleport everyone to an arena for a 90 second round with a countdown shown in the top bar. When the timer ends or one player is left, announce the winner, award them a point on the leaderboard, and teleport everyone back to the lobby.",
    builds: [
      "Intermission and round state machine",
      "Lobby and arena spawn teleports",
      "Countdown UI driven by a RemoteEvent",
      "Winner detection and leaderboard points",
    ],
  },
  {
    slug: "combat-system",
    title: "Sword combat",
    blurb: "Swing animation, damage, blocking and a cooldown",
    category: "Mechanics",
    prompt:
      "Build a sword combat system: a Tool with a swing animation, server-validated damage on hit with a debounce so it cannot be spammed, a block ability on right click that halves incoming damage, and a health bar above each player's head.",
    builds: [
      "Sword Tool with swing animation",
      "Server-validated damage with debounce",
      "Blocking that reduces incoming damage",
      "Overhead health bars",
    ],
  },
  {
    slug: "shop-system",
    title: "In-game shop",
    blurb: "A GUI shop that sells items for in-game currency",
    category: "Systems",
    prompt:
      "Build an in-game shop: a ScreenGui with a scrolling list of 6 items showing name and price, a Buy button per item, and a server script that checks the player's Coins leaderstat, deducts the price, and gives the item. Reject any purchase the player cannot afford server-side.",
    builds: [
      "Scrolling shop GUI with prices",
      "RemoteFunction purchase flow",
      "Server-side affordability checks",
      "Items delivered to the player's Backpack",
    ],
  },
  {
    slug: "double-jump",
    title: "Double jump and dash",
    blurb: "Movement abilities with cooldowns that exploiters cannot spam",
    category: "Mechanics",
    prompt:
      "Add a double jump and a dash ability. Double jump triggers on a second jump input while airborne. Dash is on Q, launches the character forward, and has a 3 second cooldown with a small UI indicator. Validate both on the server so exploiters cannot spam them.",
    builds: [
      "Double jump on a second airborne input",
      "Dash on Q with a 3 second cooldown",
      "Cooldown indicator in the HUD",
      "Server-side rate validation",
    ],
  },
  {
    slug: "day-night-cycle",
    title: "Day and night cycle",
    blurb: "Smooth lighting transitions with a clock",
    category: "World",
    prompt:
      "Build a day and night cycle: the sun moves across the sky over a 10 minute full cycle with smooth lighting and atmosphere changes for dawn, day, dusk and night. Show the in-game time in the corner of the screen, and turn on street lamps automatically at night.",
    builds: [
      "10 minute lighting cycle",
      "Dawn, day, dusk and night presets",
      "On-screen clock",
      "Street lamps that switch on at night",
    ],
  },
  {
    slug: "zombie-survival",
    title: "Zombie survival",
    blurb: "Waves of NPCs that get harder, with rewards",
    category: "Games",
    prompt:
      "Build a zombie wave survival mode: a spawner that sends waves of zombie NPCs that chase the nearest player, each wave bigger and faster than the last, a wave counter in the HUD, and coins awarded per kill that persist between waves.",
    builds: [
      "Zombie NPCs that path to the nearest player",
      "Wave manager with rising difficulty",
      "Wave counter HUD",
      "Coins per kill, saved between waves",
    ],
  },
];

export function templateBySlug(slug: string): Template | undefined {
  return TEMPLATES.find((t) => t.slug === slug);
}

export const TEMPLATE_CATEGORIES = [
  "Games",
  "Mechanics",
  "Systems",
  "World",
] as const;
