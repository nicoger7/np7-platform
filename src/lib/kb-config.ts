/**
 * Knowledge-base section templates — the contract the AI assistant enforces.
 * Every section lists the questions that MUST be answered before it may be
 * marked complete; the assistant maps a braindump onto sections and asks
 * exactly the questions that remain open.
 */
export type KbSectionTemplate = {
  key: string;
  label: string;
  hint: string;
  /** The checklist the assistant works through. */
  questions: string[];
};

export const KB_TEMPLATES: Record<"skill" | "equipment", KbSectionTemplate[]> = {
  skill: [
    { key: "what", label: "What it is", hint: "One-sentence definition a guest understands; link a video if one exists.",
      questions: ["How would you explain this skill in one sentence to a guest?", "Is there a reference video (YouTube/Wind Coach)?"] },
    { key: "when", label: "When to learn it", hint: "Prerequisites come from the skill chain automatically — describe readiness signs.",
      questions: ["How does a coach recognise a rider is ready for this skill?", "What conditions (wind/water) suit the first attempts?"] },
    { key: "teach", label: "How to teach it", hint: "The coaching progression, step by step, in NP7 voice.",
      questions: ["What are the teaching steps, in order?", "What is the ONE cue that unlocks it for most riders?", "On land or on water first — and why?"] },
    { key: "drills", label: "Drills", hint: "Each drill: setup · task · success criterion.",
      questions: ["Which drills build this skill (setup + task)?", "For each drill: how does the coach SEE that it sits (success criterion)?"] },
    { key: "mistakes", label: "Common mistakes & fixes", hint: "Symptom → why it happens → correction. Wind Coach focus points dock here.",
      questions: ["What are the typical failure patterns (symptom)?", "WHY does each happen (root cause)?", "What correction fixes each one?"] },
    { key: "conditions", label: "Conditions & gear", hint: "Wind range, water state, board/sail guidance for practising.",
      questions: ["What wind/water is ideal for practising this?", "Any gear guidance (size, setup) for learning it?"] },
  ],
  equipment: [
    { key: "what", label: "What it is", hint: "Plain-language definition.",
      questions: ["What is it, in one guest-friendly sentence?"] },
    { key: "who", label: "Who it's for & when", hint: "Level, conditions, use case.",
      questions: ["Which rider level / discipline is this for?", "In which conditions does it shine — and when not?"] },
    { key: "setup", label: "Setup & trim", hint: "How to set it up right; the usual ranges.",
      questions: ["How is it set up / trimmed correctly?", "What are the typical adjustment ranges and their effect?"] },
    { key: "mistakes", label: "Common mistakes", hint: "Symptom → cause → fix, same shape as skills.",
      questions: ["What do people get wrong with it?", "How do you spot and fix each mistake?"] },
    { key: "care", label: "Care & maintenance", hint: "Keep it alive.",
      questions: ["How is it stored/maintained?", "What wears first, and what's the check?"] },
    { key: "np7", label: "The NP7 take", hint: "Our gear, our philosophy, links to our products where relevant.",
      questions: ["How does NP7 gear relate (which board/fin, why ours)?"] },
  ],
};
