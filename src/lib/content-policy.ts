/**
 * Hard content block, checked on the SERVER before the model runs.
 *
 * Prompt rules alone proved unreliable — GLM would acknowledge the rule and
 * build the thing anyway. This layer never reaches the model at all, so it
 * cannot be talked around.
 *
 * Scope is narrow on purpose: real atrocities, real victims and hate
 * symbols. Ordinary game violence (swords, zombies, shooters, explosions,
 * horror) must keep working, so nothing here matches generic combat.
 */

export type PolicyHit =
  | { blocked: true; reason: string }
  | {
      /**
       * Could be innocent, could be the banned thing. Rather than guess —
       * blocking breaks real city builds, allowing lets the evasion through
       * — the server asks the user to say which it is.
       */
      blocked: false;
      confirm: { question: string; safe: string; unsafe: string; reason: string };
    }
  | { blocked: false; confirm?: undefined };

/** Lowercase, punctuation collapsed to spaces. Digits are preserved. */
function plain(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Leetspeak folded to letters ("tw1n t0wers" -> "twin towers").
 *
 * This destroys real numbers (9/11 becomes "9 ii"), so it is only ever an
 * ADDITIONAL view — patterns are tested against the plain form too.
 */
const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};
function deLeet(text: string): string {
  return plain(text).replace(/[0134579@$]/g, (c) => LEET[c] ?? c);
}

/** Phrases that identify a real atrocity or hate content outright. */
const BLOCKED: { re: RegExp; reason: string }[] = [
  {
    re: /\b(twin towers?|world trade cent(er|re)|wtc)\b/,
    reason: "the Twin Towers or the 11 September attacks",
  },
  {
    re: /\b(9 11|911) (attack|attacks|memorial|simulator|plane|tower|towers|jumper|jumpers)\b|\bseptember 11\b|\bsept 11 (attack|towers)\b|\btwin tower\b/,
    reason: "the 11 September attacks",
  },
  {
    re: /\b(school|columbine|sandy hook|parkland|uvalde|virginia tech) (shooting|shooter|massacre)\b|\bschool shoot(er|ing)\b/,
    reason: "a school shooting",
  },
  {
    re: /\b(christchurch|bataclan|utoya|utøya|oklahoma city|boston marathon|manchester arena|pulse nightclub) (attack|shooting|bombing|massacre)\b/,
    reason: "a real terrorist attack",
  },
  {
    re: /\b(terrorist attack|suicide bomb(er|ing)|mass shooting) (simulator|game|map|experience|roleplay|rp)\b|\b(simulator|roleplay|rp) (of|for) a (terrorist attack|mass shooting|school shooting)\b/,
    reason: "a playable recreation of a terrorist attack",
  },
  {
    re: /\b(holocaust|auschwitz|treblinka|concentration camp|gas chamber)\b/,
    reason: "the Holocaust",
  },
  {
    re: /\b(swastika|nazi flag|ss bolts|third reich|heil hitler|kkk|ku klux klan)\b/,
    reason: "hate symbols",
  },
  {
    re: /\b(isis|isil|al qaeda|taliban) (base|camp|attack|flag|recruit)\b/,
    reason: "extremist organisations",
  },
];

/**
 * Assembling the 9/11 scene without naming it: an aircraft aimed at towers.
 * Both halves must be present, so "a plane" or "two towers" alone is fine.
 */
const AIRCRAFT = /\b(plane|planes|airplane|aeroplane|jet|jets|airliner|boeing|747|767)\b/;
const TOWERS = /\b(twin|two|2|双) (towers?|skyscrapers?|buildings?)\b|\btowers?\b|\bskyscrapers?\b/;
const IMPACT =
  /\b(crash|crashes|crashing|fly into|flying into|flies into|hit|hits|hitting|smash|slam|ram|impact|explode|explodes|collaps(e|es|ing)|attack)\b/;

/**
 * Ambiguous shapes. Each is a perfectly normal build on its own, and also
 * the shape people reach for after a refusal, so the user is asked which
 * they mean instead of the server guessing.
 */
const CONFIRM: {
  re: RegExp;
  question: string;
  safe: string;
  unsafe: string;
  reason: string;
}[] = [
  {
    re: /\b(two|2|twin|double|matching|identical|pair of) (tall |big |large |huge |giant )?(towers?|skyscrapers?|buildings?)\b|\btowers? (next to|beside|side by side with) (each ?other|another|the other)\b/,
    question: "Quick check — which of these are you building?",
    safe: "Just a city skyline",
    unsafe: "The Twin Towers",
    reason: "the Twin Towers",
  },
  {
    // Words can sit between ("a plane FLYING toward the buildings").
    re: /\b(plane|planes|jet|jets|airliner|aircraft)\b[^.]{0,24}\b(near|over|above|toward|towards|approaching|at)\b[^.]{0,24}\b(tower|towers|building|buildings|skyscraper|skyscrapers)\b/,
    question: "Quick check — what is this for?",
    safe: "A normal flight scene",
    unsafe: "A plane hitting the buildings",
    reason: "an aircraft attack on buildings",
  },
];

export function checkContentPolicy(text: string): PolicyHit {
  const forms = [plain(text), deLeet(text)].filter(Boolean);
  if (forms.length === 0) return { blocked: false };

  for (const { re, reason } of BLOCKED) {
    if (forms.some((f) => re.test(f))) return { blocked: true, reason };
  }

  // Aircraft + towers + impact together is the attack, however it's worded.
  if (
    forms.some((f) => AIRCRAFT.test(f) && TOWERS.test(f) && IMPACT.test(f))
  ) {
    return {
      blocked: true,
      reason: "a recreation of an aircraft attack on towers",
    };
  }

  for (const c of CONFIRM) {
    if (forms.some((f) => c.re.test(f))) {
      return {
        blocked: false,
        confirm: {
          question: c.question,
          safe: c.safe,
          unsafe: c.unsafe,
          reason: c.reason,
        },
      };
    }
  }

  return { blocked: false };
}

/** What the user sees. Never hints at what wording would have passed. */
export function policyRefusalMessage(reason: string): string {
  return `I won't build ${reason}. Real tragedies aren't something I'll recreate as a game. I'm happy to build something else — a modern skyscraper district, an action map, or whatever you had in mind that isn't based on a real attack.`;
}
