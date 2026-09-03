/**
 * Knowledge-base section SPEC — the shape the assistant sorts a braindump into.
 *
 * Every section used to be one free textarea with the wanted structure written
 * above it in English ("Each drill: setup · task · success criterion"), where
 * nothing could enforce it and the model was free to ignore it. The structure
 * now lives in the row.
 *
 * ONE spec drives four things that would otherwise drift apart: the editor's
 * field renderer, the JSON Schema handed to the model, the completeness
 * calculation, and the wording of the open questions. Add a field here and all
 * four follow.
 *
 * Two rules that are not negotiable and are enforced in code, never by the
 * model:
 *  - `required` decides completeness. A model does not get to say it is done.
 *  - `public` decides what a member sees. A braindump must never be able to
 *    publish NP7's coaching method by accident, so the default is internal and
 *    only the guest-facing one-liner ships public out of the box.
 * Every section ends with `notes`, which the model never writes: the structure
 * must not become the reason someone stops writing something down.
 */

export type KbFieldKind =
  | "text" | "longtext" | "number" | "url" | "enum" | "multi_enum" | "list";

export type KbField = {
  key: string;
  label: string;
  kind: KbFieldKind;
  required?: boolean;
  /** The question shown while this is empty. The only place questions live. */
  ask: string;
  placeholder?: string;
  help?: string;
  /** enum / multi_enum */
  options?: readonly string[];
  /** list */
  minItems?: number;
  itemLabel?: string;
  fields?: KbField[];
  /** Members can see this field. Default false, see the header. */
  public?: boolean;
  /** The assistant never writes this field (notes, and anything human-only). */
  humanOnly?: boolean;
};

export type KbSectionTemplate = {
  key: string;
  label: string;
  hint: string;
  fields: KbField[];
};

/** Water states, borrowed from the spotguide rather than reinvented. */
export const KB_WATER = [
  "flat", "chop", "small_waves", "medium_waves", "big_waves", "shallow", "deep",
] as const;

const NOTES: KbField = {
  key: "notes", label: "Notes", kind: "longtext", ask: "", humanOnly: true,
  help: "Anything that does not fit a field. The assistant never touches this.",
};

const MISTAKE_ROW: KbField[] = [
  { key: "symptom", label: "Symptom", kind: "longtext", required: true, ask: "What does the coach SEE from the beach?" },
  { key: "cause", label: "Root cause", kind: "longtext", required: true, ask: "WHY does it happen? Not a restatement of the symptom." },
  { key: "fix", label: "Fix", kind: "longtext", required: true, ask: "What does the coach change?" },
  { key: "cue", label: "Cue", kind: "text", ask: "The words to shout, if there is one." },
  { key: "frequency", label: "How often", kind: "enum", options: ["very_common", "common", "occasional"], ask: "How often does this one come up?" },
];

export const KB_TEMPLATES: Record<"skill" | "equipment", KbSectionTemplate[]> = {
  skill: [
    {
      key: "what", label: "What it is",
      hint: "One sentence a guest understands, and what it looks like when it is right.",
      fields: [
        { key: "one_liner", label: "One sentence", kind: "text", required: true, public: true,
          ask: "How would you explain this skill in one sentence to a guest?",
          help: "This is the sentence members read on their Progress page." },
        { key: "looks_like", label: "Looks like this when it is right", kind: "longtext", required: true, public: true,
          ask: "What does it look like when it is right? The picture coach and rider share." },
        { key: "why_it_matters", label: "Why it matters", kind: "longtext", public: true,
          ask: "What does it unlock? Why should a rider want it?" },
        { key: "also_called", label: "Also called", kind: "list", itemLabel: "name", public: true,
          ask: "What else do guests call it?",
          fields: [{ key: "name", label: "Name", kind: "text", required: true, ask: "" }] },
        { key: "video_url", label: "Reference video", kind: "url", public: true,
          ask: "Is there a reference video (YouTube or Wind Coach)?" },
        { key: "video_note", label: "What to watch for", kind: "text", public: true, ask: "" },
        NOTES,
      ],
    },
    {
      key: "when", label: "When to learn it",
      hint: "Prerequisites come from the skill chain automatically. This is about the rider.",
      fields: [
        { key: "ready_when", label: "Ready when", kind: "list", required: true, minItems: 2, itemLabel: "signal",
          ask: "How does a coach recognise a rider is ready? Give at least two observable signs.",
          fields: [{ key: "signal", label: "Signal", kind: "longtext", required: true, ask: "" }] },
        { key: "not_yet_if", label: "Not yet if", kind: "list", itemLabel: "stop sign",
          ask: "What tells you to send them back to something else first?",
          fields: [
            { key: "signal", label: "Sign", kind: "longtext", required: true, ask: "" },
            { key: "send_back_to", label: "Send them back to", kind: "text", ask: "" },
          ] },
        { key: "typical_time", label: "Typical time to get it", kind: "text", required: true,
          ask: "How long does this usually take a rider who is ready?" },
        { key: "prereq_note", label: "Note on prerequisites", kind: "longtext",
          ask: "Anything the automatic skill chain does not capture?" },
        NOTES,
      ],
    },
    {
      key: "teach", label: "How to teach it",
      hint: "The section a new coach runs the session from. Steps in order, each with a move-on point.",
      fields: [
        { key: "start_on", label: "Start on", kind: "enum", required: true,
          options: ["land", "water", "land_then_water"],
          ask: "On land or on water first?" },
        { key: "start_on_why", label: "Why", kind: "longtext", ask: "Why that way round?" },
        { key: "key_cue", label: "The one cue", kind: "text", required: true,
          ask: "What is the ONE cue that unlocks it for most riders?" },
        { key: "steps", label: "Steps", kind: "list", required: true, minItems: 3, itemLabel: "step",
          ask: "What are the teaching steps, in order? At least three.",
          fields: [
            { key: "title", label: "Step", kind: "text", required: true, ask: "" },
            { key: "detail", label: "What the rider does", kind: "longtext", required: true, ask: "" },
            { key: "coach_says", label: "Coach says", kind: "longtext", ask: "The literal words, in NP7 voice." },
            { key: "coach_watches", label: "Coach watches", kind: "longtext", ask: "Where do you stand, what do you look at?" },
            { key: "move_on_when", label: "Move on when", kind: "longtext", required: true,
              ask: "What tells you this step is done?" },
          ] },
        { key: "session_shape", label: "Shape of the session", kind: "longtext",
          ask: "How is a session built around it: brief, water time, debrief?" },
        { key: "safety", label: "Safety", kind: "longtext", ask: "What actually goes wrong for real?" },
        NOTES,
      ],
    },
    {
      key: "drills", label: "Drills",
      hint: "Each drill: what it builds, setup, task, and what success looks like.",
      fields: [
        { key: "drills", label: "Drills", kind: "list", required: true, minItems: 2, itemLabel: "drill",
          ask: "Which drills build this skill? At least two.",
          fields: [
            { key: "name", label: "Name", kind: "text", required: true, ask: "What is this drill called?" },
            { key: "builds", label: "Builds", kind: "text", required: true, ask: "Which part of the skill does it train?" },
            { key: "setup", label: "Setup", kind: "longtext", required: true, ask: "Gear, marks, area, wind." },
            { key: "task", label: "Task", kind: "longtext", required: true, ask: "What does the rider actually do?" },
            { key: "success", label: "Success looks like", kind: "longtext", required: true,
              ask: "How does the coach SEE that it sits?" },
            { key: "dose", label: "Dose", kind: "text", ask: "How many reps, or how long?" },
            { key: "easier", label: "Make it easier", kind: "text", ask: "How do you simplify it?" },
            { key: "harder", label: "Make it harder", kind: "text", ask: "How do you progress it?" },
            { key: "video_url", label: "Video", kind: "url", ask: "" },
          ] },
        NOTES,
      ],
    },
    {
      key: "mistakes", label: "Common mistakes & fixes",
      hint: "Symptom, then why it happens, then the correction.",
      fields: [
        { key: "mistakes", label: "Mistakes", kind: "list", required: true, minItems: 3, itemLabel: "mistake",
          ask: "What are the typical failure patterns? At least three.",
          fields: MISTAKE_ROW },
        NOTES,
      ],
    },
    {
      key: "conditions", label: "Conditions & gear",
      hint: "Numbers, not prose. A new coach must not have to guess a wind range out of a paragraph.",
      fields: [
        { key: "wind_min_kn", label: "Wind from (kn)", kind: "number", required: true,
          ask: "What is the lowest wind this works in, in knots?" },
        { key: "wind_max_kn", label: "Wind to (kn)", kind: "number", required: true,
          ask: "And the highest, in knots?" },
        { key: "wind_note", label: "Note on wind", kind: "text", ask: "" },
        { key: "water", label: "Water", kind: "multi_enum", required: true, options: KB_WATER,
          ask: "Which water states suit the first attempts?" },
        { key: "spot_needs", label: "The spot needs", kind: "longtext",
          ask: "What does the spot itself need: side-shore, safe downwind, waist deep?" },
        { key: "board", label: "Board", kind: "text", required: true, ask: "Which board suits learning it?" },
        { key: "sail", label: "Sail", kind: "text", required: true, ask: "Which sail size or type?" },
        { key: "fin", label: "Fin", kind: "text", ask: "" },
        { key: "rig_tweaks", label: "Trim tweaks that help", kind: "list", itemLabel: "tweak",
          ask: "Any trim change that specifically helps someone LEARNING this?",
          fields: [
            { key: "control", label: "Control", kind: "text", required: true, ask: "" },
            { key: "setting", label: "Setting", kind: "text", required: true, ask: "" },
            { key: "why", label: "Why", kind: "longtext", ask: "" },
          ] },
        { key: "avoid_when", label: "Do not teach it when", kind: "longtext",
          ask: "In which conditions should a coach not teach this at all?" },
        NOTES,
      ],
    },
  ],

  equipment: [
    {
      key: "what", label: "What it is", hint: "Plain language, and the job it physically does.",
      fields: [
        { key: "one_liner", label: "One sentence", kind: "text", required: true, public: true,
          ask: "What is it, in one guest-friendly sentence?" },
        { key: "its_job", label: "The job it does", kind: "longtext", required: true, public: true,
          ask: "What does it physically do?" },
        { key: "key_numbers", label: "Key numbers", kind: "list", itemLabel: "number", public: true,
          ask: "Which numbers identify it?",
          fields: [
            { key: "label", label: "Label", kind: "text", required: true, ask: "" },
            { key: "value", label: "Value", kind: "text", required: true, ask: "" },
          ] },
        { key: "video_url", label: "Video", kind: "url", public: true, ask: "" },
        NOTES,
      ],
    },
    {
      key: "who", label: "Who it's for & when", hint: "Level, discipline, and the conditions where it shines.",
      fields: [
        { key: "levels", label: "Levels", kind: "text", ask: "Which rider level is this for?" },
        { key: "disciplines", label: "Disciplines", kind: "text", ask: "Which disciplines?" },
        { key: "shines_when", label: "Shines when", kind: "list", required: true, minItems: 1, itemLabel: "case",
          ask: "In which conditions does it shine?",
          fields: [{ key: "text", label: "Case", kind: "longtext", required: true, ask: "" }] },
        { key: "not_when", label: "Not when", kind: "list", itemLabel: "case",
          ask: "And when is it the wrong choice?",
          fields: [{ key: "text", label: "Case", kind: "longtext", required: true, ask: "" }] },
        { key: "instead_reach_for", label: "Instead reach for", kind: "text",
          ask: "What should they pick instead then?" },
        NOTES,
      ],
    },
    {
      key: "setup", label: "Setup & trim", hint: "The baseline you hand a guest, then what each control does.",
      fields: [
        { key: "baseline", label: "Baseline setting", kind: "longtext", required: true,
          ask: "What is the starting setting you hand a guest?" },
        { key: "steps", label: "Setup steps", kind: "list", itemLabel: "step",
          ask: "How is it set up, in order?",
          fields: [
            { key: "title", label: "Step", kind: "text", required: true, ask: "" },
            { key: "detail", label: "Detail", kind: "longtext", required: true, ask: "" },
            { key: "done_when", label: "Done when", kind: "text", ask: "" },
          ] },
        { key: "adjustments", label: "Adjustments", kind: "list", required: true, minItems: 2, itemLabel: "control",
          ask: "Which controls adjust it, and what does each do?",
          fields: [
            { key: "control", label: "Control", kind: "text", required: true, ask: "" },
            { key: "range", label: "Usable range", kind: "text", required: true, ask: "" },
            { key: "more_does", label: "More of it does", kind: "longtext", required: true, ask: "" },
            { key: "less_does", label: "Less of it does", kind: "longtext", required: true, ask: "" },
          ] },
        NOTES,
      ],
    },
    {
      key: "mistakes", label: "Common mistakes", hint: "Symptom, cause, fix. Same shape as skills.",
      fields: [
        { key: "mistakes", label: "Mistakes", kind: "list", required: true, minItems: 3, itemLabel: "mistake",
          ask: "What do people get wrong with it?", fields: MISTAKE_ROW },
        NOTES,
      ],
    },
    {
      key: "care", label: "Care & maintenance", hint: "Keep it alive: after the session, storage, and what wears first.",
      fields: [
        { key: "after_session", label: "After every session", kind: "list", required: true, minItems: 1, itemLabel: "step",
          ask: "What happens after every session?",
          fields: [{ key: "text", label: "Step", kind: "longtext", required: true, ask: "" }] },
        { key: "storage", label: "Storage", kind: "longtext", required: true, ask: "How is it stored?" },
        { key: "wear_points", label: "Wear points", kind: "list", required: true, minItems: 1, itemLabel: "part",
          ask: "What wears first, and what is the check?",
          fields: [
            { key: "part", label: "Part", kind: "text", required: true, ask: "" },
            { key: "check_for", label: "Check for", kind: "longtext", required: true, ask: "" },
            { key: "replace_when", label: "Replace when", kind: "text", ask: "" },
          ] },
        { key: "service_interval", label: "Service interval", kind: "text", ask: "" },
        NOTES,
      ],
    },
    {
      key: "np7", label: "The NP7 take", hint: "Our view and our gear, including where ours is not the answer.",
      fields: [
        { key: "position", label: "Our position", kind: "longtext", required: true,
          ask: "What is our take on it?" },
        { key: "products", label: "Our products", kind: "list", itemLabel: "product",
          ask: "Which of our products relate, and why ours?",
          fields: [
            { key: "name", label: "Product", kind: "text", required: true, ask: "" },
            { key: "product_slug", label: "Slug", kind: "text", ask: "" },
            { key: "why", label: "Why ours", kind: "longtext", required: true, ask: "" },
          ] },
        { key: "honest_caveat", label: "Where ours is not the answer", kind: "longtext",
          ask: "When would you NOT recommend our gear here?" },
        NOTES,
      ],
    },
  ],
};

/* ─────────────────────── derived, used everywhere ─────────────────────── */

const isEmpty = (v: unknown): boolean =>
  v == null || v === "" || (Array.isArray(v) && v.length === 0);

/** Is one field satisfied? A list also has to meet its minItems and have every
 *  required sub-field filled on every row it does have. */
export function fieldFilled(f: KbField, value: unknown): boolean {
  if (f.kind === "list") {
    const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
    if (rows.length < (f.minItems ?? (f.required ? 1 : 0))) return false;
    const sub = (f.fields ?? []).filter((x) => x.required);
    return rows.every((r) => sub.every((x) => !isEmpty(r?.[x.key])));
  }
  return !isEmpty(value);
}

/** The questions a section still leaves open. Computed here, never asked of
 *  the model: it is the judgement a cheap model gets wrong, and it is a pure
 *  function of the data. */
export function openQuestionsFor(tpl: KbSectionTemplate, data: Record<string, unknown>): string[] {
  return tpl.fields
    .filter((f) => f.required && f.ask && !fieldFilled(f, data?.[f.key]))
    .map((f) => f.ask);
}

export function sectionStatus(
  tpl: KbSectionTemplate,
  data: Record<string, unknown>,
): "missing" | "draft" | "complete" {
  const touched = tpl.fields.some((f) => !isEmpty(data?.[f.key]));
  if (!touched) return "missing";
  return tpl.fields.every((f) => !f.required || fieldFilled(f, data?.[f.key])) ? "complete" : "draft";
}

/** What a member is allowed to see of one section: public fields only, and
 *  only the ones a human actually released. */
export function publicFieldKeys(tpl: KbSectionTemplate): string[] {
  return tpl.fields.filter((f) => f.public).map((f) => f.key);
}

export const templateFor = (kind: string, sectionKey: string) =>
  (KB_TEMPLATES[kind as "skill" | "equipment"] ?? []).find((t) => t.key === sectionKey) ?? null;
