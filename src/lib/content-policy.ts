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

/**
 * Lowercase, punctuation collapsed to spaces, digits preserved. CamelCase
 * is split first, because instance names arrive as "TwinTowers" with no
 * separator at all and the patterns are word-anchored.
 */
function plain(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
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
  {
    re: /\b(ground zero|falling man|jumpers? from the tower|the planes hit)\b/,
    reason: "the 11 September attacks",
  },
  {
    re: /\b(hiroshima|nagasaki|chernobyl|grenfell|titanic sinking) (bomb|attack|disaster|simulator|recreation|map)\b|\b(nuke|nuclear bomb) (on|over) (a )?real\b/,
    reason: "a real disaster",
  },
  {
    re: /\b(pentagon|white house|buckingham palace|eiffel tower|empire state) (attack|bombing|crash|explosion|destroy|destruction)\b/,
    reason: "an attack on a real landmark",
  },
  {
    re: /\b(mass|public|mall|church|mosque|synagogue|nightclub|concert) (shooting|shooter|massacre)\b/,
    reason: "a mass shooting",
  },
  {
    re: /\b(genocide|ethnic cleansing|lynching|slave (auction|whipping))\b/,
    reason: "real atrocities against a group",
  },
  {
    re: /\b(suicide|self harm|hanging|noose) (simulator|game|roleplay|rp|map|challenge)\b|\bkill (yourself|myself) (simulator|game)\b/,
    reason: "self-harm content",
  },
  // --- Things that would get the USER banned from Roblox -------------------
  {
    re: /\b(free robux|robux (generator|gen|hack)|robux for free)\b|\b(steal|steals|stealing|phish|phishes|grab|grabs|log|logs) (their |the |someone ?s |a )?(password|passwords|account|accounts|cookie|cookies|login|logins)\b|\broblox (account )?(stealer|logger)\b/,
    reason: "a Robux scam or account-stealing setup",
  },
  {
    re: /\b(backdoor|remote (code )?exec)\b|\bscript that (lets me|gives me) (control|admin) (of|in) (any|other) (game|place)\b/,
    reason: "a game backdoor",
  },
  {
    re: /\b(bypass|get around|defeat|evade) (the )?(roblox )?(chat )?(filter|moderation|tos|rules)\b|\bfilter bypass\b|\bsay (swear|curse) words? (past|through) the filter\b/,
    reason: "bypassing Roblox moderation",
  },
  // --- Sexual / minors ------------------------------------------------------
  {
    re: /\b(condo|scented con|nsfw|sex|porn|hentai|strip club|brothel) (game|map|place|room|build|world)\b|\b(make|build) (a |an )?(sex|nsfw|porn) \w+/,
    reason: "sexual content",
  },
  {
    re: /\b(child|kid|minor|underage|loli|shota)\b[\s\S]{0,30}\b(sexual|nude|naked|strip|porn|nsfw)\b|\b(sexual|nude|naked|nsfw)\b[\s\S]{0,30}\b(child|kid|minor|underage)\b/,
    reason: "content sexualising minors",
  },
  // --- Real-world harm ------------------------------------------------------
  {
    // Two shapes: an item with no innocent game meaning, or an explicitly
    // REAL weapon. Bare "bomb" is left out so "bomb defusal game" builds.
    re: /\bhow to (make|build|cook)\b[^.]{0,24}\b(pipe bomb|meth|napalm|silencer|nerve gas|thermite)\b|\bhow to (make|build|cook)\b[^.]{0,16}\b(real|working|functional|actual)\b[^.]{0,16}\b(bomb|explosive|gun|firearm)\b|\b(real|working) (bomb|explosive|gun|firearm) (instructions|recipe|blueprint)\b/,
    reason: "real weapon or drug instructions",
  },
  {
    // Note: normalisation turns "someone's" into "someone s".
    re: /\b(dox|doxx|doxxing)\b|\b(find|leak|post|get) (their|his|her|someone ?s|a players?) (home address|address|phone number|ip address|real name)\b/,
    reason: "doxxing someone",
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

/**
 * Same screen applied to what the model is about to CREATE — instance names,
 * script contents, GUI text. This is the last line: even if a request slips
 * past the message check and the prompt, the artifact itself is inspected
 * before it reaches Studio.
 */
export function checkBuildArtifact(text: string): PolicyHit {
  const forms = [plain(text), deLeet(text)].filter(Boolean);
  if (forms.length === 0) return { blocked: false };
  for (const { re, reason } of BLOCKED) {
    if (forms.some((f) => re.test(f))) return { blocked: true, reason };
  }
  return { blocked: false };
}

/**
 * Once a conversation has produced a refusal, ambiguity stops getting the
 * benefit of the doubt: the same shapes we would normally ask about are
 * refused outright, because we already know what is being attempted.
 */
export function checkContentPolicyStrict(text: string): PolicyHit {
  const hit = checkContentPolicy(text);
  if (hit.blocked) return hit;
  if (hit.confirm) return { blocked: true, reason: hit.confirm.reason };
  return { blocked: false };
}

/** What the user sees. Never hints at what wording would have passed. */
export function policyRefusalMessage(reason: string): string {
  return `I won't build ${reason}. Real tragedies aren't something I'll recreate as a game. I'm happy to build something else — a modern skyscraper district, an action map, or whatever you had in mind that isn't based on a real attack.`;
}
