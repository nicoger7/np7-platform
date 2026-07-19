import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";

/**
 * Hidden, invite-only "trip interest" surveys (migration 078). Admin hand-picks
 * members and sends each a secret token link to gauge demand for a special
 * (non-public) trip. All access is service-role: the member form is served
 * through a token-authed server API, so no anon client ever touches these tables
 * (RLS on, no policies).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;
function db(): DB { return createAdminClient() as DB; }

// A survey option is either a plain destination (label only, paired with separate
// `weeks`) OR a fixed date+place "trip" (start/end + a blurb) that members
// multi-select directly. When any option carries start/end the form switches to
// premium trip-cards and the separate weeks question is hidden.
// One row = a place on ONE date window. Several rows sharing a `groupId` (or, for
// older data, the same label) are the same place with multiple date windows — the
// admin edits them as one card; the member form shows one card with period pills.
export type SurveyDestination = { key: string; groupId?: string | null; label: string; location?: string | null; start?: string | null; end?: string | null; blurb?: string | null; image?: string | null; lat?: number | null; lng?: number | null };
export type SurveyWeek = { key: string; label: string; start: string | null; end: string | null };
export type SurveyStatus = "draft" | "open" | "closed";

export type Survey = {
  id: string;
  title: string;
  intro: string | null;
  status: SurveyStatus;
  destinations: SurveyDestination[];
  weeks: SurveyWeek[];
  budget_anchor: number | null;
  budget_min: number;
  budget_max: number;
  currency: string;
  /** One-click interest mode: email buttons pre-register the answer; the page is
   *  an auto-saving confirmation, not a form. */
  quick: boolean;
  /** Small gold line above the hero title. null = "By private invitation", "" = hidden. */
  eyebrow: string | null;
  /** Join-button label. null = "Count me in" (page) / "I'd join" (email buttons). */
  cta_label: string | null;
  /** Decline-button label (display only). null = "Can't make it this time". */
  decline_label: string | null;
  /** false = no opt-out button on the page, no decline link in the email. */
  show_decline: boolean;
  /** Custom invite-email text (replaces the standard pitch paragraphs). null = built-in copy. */
  email_body: string | null;
  /** false = hide the "What are you looking for?" free-text card (classic form). */
  ask_wishes: boolean;
  /** One-tap date buttons in the invite email (any survey with dated trips). false = single survey button. */
  email_date_buttons: boolean;
  /** Text of the single "open the survey" email button (email_date_buttons off). null = "Take the 2-minute survey". */
  email_button_label: string | null;
  /** Shareable "open link" token (/survey/<open_token>): anyone with it joins by
   *  leaving name + email and gets their own personal invite. */
  open_token: string | null;
  created_at: string;
  archived_at: string | null;
};

export type SurveyResponse = {
  id: string;
  survey_id: string;
  invite_id: string;
  contact_id: string;
  top_destination: string | null;
  other_destinations: string[];
  weeks: string[];
  budget_ok: "yes" | "maybe" | "no" | null;
  budget_min: number | null;
  budget_max: number | null;
  looking_for: string | null;
  submitted_at: string;
};

export type SurveyInvite = {
  id: string;
  survey_id: string;
  contact_id: string;
  token: string;
  status: "invited" | "opened" | "completed";
  invited_at: string;
  opened_at: string | null;
  // joined for admin views
  contactName?: string | null;
  contactEmail?: string | null;
  response?: SurveyResponse | null;
  /** An invite email actually went out (from email_log). */
  emailed?: boolean;
  /** Resend webhook: they opened the invite EMAIL (≠ opened_at, which = visited the page). */
  emailOpenedAt?: string | null;
  /** Latest delivery event: delivered / opened / bounced / complained. */
  emailEvent?: string | null;
  /** When the "Remind non-responders" round re-mailed them (one per invite). */
  remindedAt?: string | null;
  /** null/'admin' = hand-picked; 'open_link' = self-registered via the shared link. */
  source?: string | null;
};

/** Shareable open-link token, `join-` + 14 hex — visibly NOT a personal link. */
export function generateOpenToken(): string {
  let hex = "";
  while (hex.length < 14) hex += Math.random().toString(16).slice(2);
  return `join-${hex.slice(0, 14)}`;
}

/** Readable, hard-to-guess token like `nico-3f9a2b`. */
export function generateSurveyToken(firstName?: string): string {
  const rand = Math.random().toString(16).slice(2, 8);
  const base = (firstName || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12);
  return base ? `${base}-${rand}` : rand + Math.random().toString(16).slice(2, 6);
}

function rowToSurvey(r: Record<string, unknown>): Survey {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    intro: (r.intro as string | null) ?? null,
    status: (r.status as SurveyStatus) ?? "draft",
    destinations: Array.isArray(r.destinations) ? (r.destinations as SurveyDestination[]) : [],
    weeks: Array.isArray(r.weeks) ? (r.weeks as SurveyWeek[]) : [],
    budget_anchor: r.budget_anchor != null ? Number(r.budget_anchor) : null,
    budget_min: r.budget_min != null ? Number(r.budget_min) : 1000,
    budget_max: r.budget_max != null ? Number(r.budget_max) : 8000,
    currency: String(r.currency ?? "EUR"),
    quick: r.quick === true,
    eyebrow: (r.eyebrow as string | null) ?? null,
    cta_label: (r.cta_label as string | null) ?? null,
    decline_label: (r.decline_label as string | null) ?? null,
    show_decline: r.show_decline !== false,
    email_body: (r.email_body as string | null) ?? null,
    ask_wishes: r.ask_wishes !== false,
    email_date_buttons: r.email_date_buttons !== false,
    email_button_label: (r.email_button_label as string | null) ?? null,
    open_token: (r.open_token as string | null) ?? null,
    created_at: String(r.created_at ?? ""),
    archived_at: (r.archived_at as string | null) ?? null,
  };
}

function rowToResponse(r: Record<string, unknown>): SurveyResponse {
  return {
    id: String(r.id),
    survey_id: String(r.survey_id),
    invite_id: String(r.invite_id),
    contact_id: String(r.contact_id),
    top_destination: (r.top_destination as string | null) ?? null,
    other_destinations: Array.isArray(r.other_destinations) ? (r.other_destinations as string[]) : [],
    weeks: Array.isArray(r.weeks) ? (r.weeks as string[]) : [],
    budget_ok: (r.budget_ok as SurveyResponse["budget_ok"]) ?? null,
    budget_min: r.budget_min != null ? Number(r.budget_min) : null,
    budget_max: r.budget_max != null ? Number(r.budget_max) : null,
    looking_for: (r.looking_for as string | null) ?? null,
    submitted_at: String(r.submitted_at ?? ""),
  };
}

/** All surveys (newest first, non-archived) with invited/responded counts. */
export async function listSurveys(): Promise<(Survey & { invited: number; responded: number })[]> {
  const sb = db();
  const { data } = await sb.from("exp_surveys").select("*").is("archived_at", null).order("created_at", { ascending: false });
  const surveys = ((data ?? []) as Record<string, unknown>[]).map(rowToSurvey);
  if (!surveys.length) return [];
  const ids = surveys.map((s) => s.id);
  const [{ data: inv }, { data: resp }] = await Promise.all([
    sb.from("exp_survey_invites").select("survey_id").in("survey_id", ids),
    sb.from("exp_survey_responses").select("survey_id").in("survey_id", ids),
  ]);
  const count = (rows: { survey_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.survey_id === id).length;
  return surveys.map((s) => ({ ...s, invited: count(inv, s.id), responded: count(resp, s.id) }));
}

export async function getSurvey(id: string): Promise<Survey | null> {
  const { data } = await db().from("exp_surveys").select("*").eq("id", id).maybeSingle();
  return data ? rowToSurvey(data) : null;
}

export async function createSurvey(input: Partial<Survey>): Promise<Survey | null> {
  const { data } = await db().from("exp_surveys").insert({
    title: input.title || "Untitled survey",
    intro: input.intro ?? null,
    status: input.status ?? "draft",
    destinations: input.destinations ?? [],
    weeks: input.weeks ?? [],
    budget_anchor: input.budget_anchor ?? null,
    budget_min: input.budget_min ?? 1000,
    budget_max: input.budget_max ?? 8000,
    currency: input.currency ?? "EUR",
    open_token: generateOpenToken(),
  }).select("*").single();
  return data ? rowToSurvey(data) : null;
}

export async function updateSurvey(id: string, patch: Partial<Survey>): Promise<Survey | null> {
  const clean: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ["title", "intro", "status", "destinations", "weeks", "budget_anchor", "budget_min", "budget_max", "currency", "quick", "eyebrow", "cta_label", "decline_label", "show_decline", "email_body", "ask_wishes", "email_date_buttons", "email_button_label"] as const) {
    if (k in patch) clean[k] = patch[k];
  }
  const { data } = await db().from("exp_surveys").update(clean).eq("id", id).select("*").single();
  return data ? rowToSurvey(data) : null;
}

export async function archiveSurvey(id: string): Promise<void> {
  await db().from("exp_surveys").update({ archived_at: new Date().toISOString() }).eq("id", id);
}

/** Invites for a survey, joined with the contact + their response (admin view). */
export async function listInvites(surveyId: string): Promise<SurveyInvite[]> {
  const sb = db();
  const { data: invites } = await sb.from("exp_survey_invites").select("*").eq("survey_id", surveyId).order("invited_at", { ascending: true });
  const rows = (invites ?? []) as Record<string, unknown>[];
  if (!rows.length) return [];
  const contactIds = [...new Set(rows.map((r) => String(r.contact_id)))];
  const [{ data: contacts }, { data: responses }, { data: sends }] = await Promise.all([
    sb.from("contacts").select("id,name,email").in("id", contactIds),
    sb.from("exp_survey_responses").select("*").eq("survey_id", surveyId),
    sb.from("email_log").select("dedupe_key, opened_at, last_event").eq("template_key", "survey_invite").eq("status", "sent")
      .in("dedupe_key", rows.flatMap((r) => [`survey_invite:${r.id}`, `survey_remind:${r.id}`])),
  ]);
  const sendRows = (sends ?? []) as { dedupe_key: string | null; opened_at?: string | null; last_event?: string | null }[];
  const sentKeys = new Set(sendRows.map((x) => x.dedupe_key));
  const sendByKey = new Map(sendRows.map((x) => [x.dedupe_key, x]));
  // ✉ badge merges invite + reminder sends: an open of EITHER counts, and a
  // bounce/spam on either screams (same address — the signal is per person).
  const mailFor = (inviteId: unknown) => {
    const a = sendByKey.get(`survey_invite:${inviteId}`), b = sendByKey.get(`survey_remind:${inviteId}`);
    const bad = [a, b].find((x) => x?.last_event === "bounced" || x?.last_event === "complained");
    return {
      openedAt: a?.opened_at ?? b?.opened_at ?? null,
      event: bad?.last_event ?? ((a?.opened_at || b?.opened_at) ? "opened" : (a?.last_event ?? b?.last_event ?? null)),
    };
  };
  const cById = new Map<string, Record<string, unknown>>(((contacts ?? []) as Record<string, unknown>[]).map((c) => [String(c.id), c]));
  const rById = new Map<string, SurveyResponse>(((responses ?? []) as Record<string, unknown>[]).map((r) => [String(r.invite_id), rowToResponse(r)]));
  return rows.map((r) => {
    const c = cById.get(String(r.contact_id));
    return {
      id: String(r.id), survey_id: String(r.survey_id), contact_id: String(r.contact_id),
      token: String(r.token), status: (r.status as SurveyInvite["status"]) ?? "invited",
      invited_at: String(r.invited_at ?? ""), opened_at: (r.opened_at as string | null) ?? null,
      contactName: (c?.name as string | null) ?? null, contactEmail: (c?.email as string | null) ?? null,
      emailed: sentKeys.has(`survey_invite:${r.id}`),
      emailOpenedAt: mailFor(r.id).openedAt,
      emailEvent: mailFor(r.id).event,
      remindedAt: (r.reminded_at as string | null) ?? null,
      source: (r.source as string | null) ?? null,
      response: rById.get(String(r.id)) ?? null,
    };
  });
}

/** Add invites for a set of contacts (skips any already invited). Returns the
 *  newly-created invites (with fresh tokens). */
/** Contact ids carrying a tag (exact match, e.g. "Tenerife") that have an email —
 *  the bulk feed for survey invites ("add everyone tagged …"). */
export async function contactIdsByTag(tag: string): Promise<string[]> {
  // paged: Supabase caps reads at 1000 rows, and big tags (Clinic ≈ 900,
  // maillist ≈ 13.5k) blow straight past that
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db()
      .from("contacts")
      .select("id")
      .contains("tags", [tag.trim()])
      .not("email", "is", null)
      .is("archived_at", null)
      .order("id")
      .range(from, from + 999);
    ids.push(...((data ?? []) as { id: string }[]).map((c) => c.id));
    if (!data || data.length < 1000) break;
  }
  return ids;
}

export async function addInvites(surveyId: string, contactIds: string[]): Promise<SurveyInvite[]> {
  const sb = db();
  const { data: existing } = await sb.from("exp_survey_invites").select("contact_id").eq("survey_id", surveyId);
  const have = new Set((existing ?? []).map((r: { contact_id: string }) => String(r.contact_id)));
  const toAdd = [...new Set(contactIds)].filter((id) => id && !have.has(id));
  if (!toAdd.length) return [];
  const { data: contacts } = await sb.from("contacts").select("id,name").in("id", toAdd);
  const nameById = new Map<string, string>(((contacts ?? []) as Record<string, unknown>[]).map((c) => [String(c.id), String(c.name ?? "")]));
  const rows = toAdd.map((contactId) => ({
    survey_id: surveyId, contact_id: contactId,
    token: generateSurveyToken(nameById.get(contactId)?.split(/\s+/)[0]),
  }));
  const { data } = await sb.from("exp_survey_invites").insert(rows).select("*");
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id), survey_id: String(r.survey_id), contact_id: String(r.contact_id),
    token: String(r.token), status: "invited" as const, invited_at: String(r.invited_at ?? ""), opened_at: null,
    contactName: nameById.get(String(r.contact_id)) ?? null,
  }));
}

export async function removeInvite(inviteId: string): Promise<void> {
  await db().from("exp_survey_invites").delete().eq("id", inviteId);
}

/** Open-link lookup: the survey behind a shareable `join-…` token. */
export async function getSurveyByOpenToken(token: string): Promise<Survey | null> {
  if (!token.startsWith("join-")) return null;
  const { data } = await db().from("exp_surveys").select("*").eq("open_token", token).is("archived_at", null).maybeSingle();
  return data ? rowToSurvey(data) : null;
}

/** Someone arrived via the open link and left name + email: find-or-create the
 *  contact, find-or-create their invite, hand back their PERSONAL token — so
 *  the same email always resumes its own saved answer, never a duplicate. */
export async function joinSurveyByOpenToken(openToken: string, nameRaw: string, emailRaw: string): Promise<{ token: string } | { error: string }> {
  const survey = await getSurveyByOpenToken(openToken);
  if (!survey) return { error: "This link is no longer valid." };
  if (survey.status === "closed") return { error: "This invitation has closed." };
  const name = nameRaw.trim().replace(/\s+/g, " ").slice(0, 80);
  const email = emailRaw.trim().toLowerCase().slice(0, 120);
  if (!name) return { error: "Please tell us your name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: "That email address doesn't look right." };

  const sb = db();
  // Find the contact case-insensitively (escape ilike wildcards — emails may
  // legally contain _). Checks the secondary address too, so a member who
  // signed up under their other email doesn't get duplicated.
  const pattern = email.replace(/[%_]/g, (m) => `\\${m}`);
  let contactId: string | null = null;
  for (const col of ["email", "email2"] as const) {
    if (contactId) break;
    const { data } = await sb.from("contacts").select("id").ilike(col, pattern).is("archived_at", null).limit(1);
    contactId = data?.[0]?.id ?? null;
  }
  if (!contactId) {
    const { data: created, error } = await sb.from("contacts").insert({ name, email, source: "survey_open_link" }).select("id").single();
    if (error || !created) return { error: "Something went wrong — please try again." };
    contactId = String(created.id);
  }

  return findOrCreateOpenInvite(survey.id, contactId, name.split(/\s+/)[0]);
}

/** A logged-in member clicked the open link — join with their account contact
 *  directly, no name/email form. Returns their personal survey token. */
export async function joinSurveyAsMember(openToken: string, contactId: string): Promise<{ token: string } | { error: string }> {
  const survey = await getSurveyByOpenToken(openToken);
  if (!survey) return { error: "This link is no longer valid." };
  if (survey.status === "closed") return { error: "This invitation has closed." };
  const { data: c } = await db().from("contacts").select("name").eq("id", contactId).maybeSingle();
  return findOrCreateOpenInvite(survey.id, contactId, String(c?.name ?? "").split(/\s+/)[0]);
}

/** Find this contact's existing invite for the survey, or create one (open-link source). */
async function findOrCreateOpenInvite(surveyId: string, contactId: string, firstName?: string): Promise<{ token: string } | { error: string }> {
  const sb = db();
  const { data: existing } = await sb.from("exp_survey_invites").select("token").eq("survey_id", surveyId).eq("contact_id", contactId).maybeSingle();
  if (existing?.token) return { token: String(existing.token) };
  const { data: inv, error: invErr } = await sb.from("exp_survey_invites").insert({
    survey_id: surveyId, contact_id: contactId,
    token: generateSurveyToken(firstName), source: "open_link",
  }).select("token").single();
  if (invErr || !inv) return { error: "Something went wrong — please try again." };
  return { token: String(inv.token) };
}

/** The member form's data for a token: the survey, who they are, and any
 *  existing response. Marks the invite "opened" on first view. */
export async function getSurveyForToken(token: string): Promise<{
  survey: Survey; invite: SurveyInvite; contactName: string | null; loggedInMatchesInvitee: boolean; response: SurveyResponse | null;
} | null> {
  const sb = db();
  const { data: inv } = await sb.from("exp_survey_invites").select("*").eq("token", token).maybeSingle();
  if (!inv) return null;
  const survey = await getSurvey(String(inv.survey_id));
  if (!survey || survey.archived_at) return null;
  const [{ data: contact }, { data: resp }] = await Promise.all([
    sb.from("contacts").select("name").eq("id", inv.contact_id).maybeSingle(),
    sb.from("exp_survey_responses").select("*").eq("invite_id", inv.id).maybeSingle(),
  ]);
  if (inv.status === "invited") {
    await sb.from("exp_survey_invites").update({ status: "opened", opened_at: new Date().toISOString() }).eq("id", inv.id);
  }
  return {
    survey,
    invite: {
      id: String(inv.id), survey_id: String(inv.survey_id), contact_id: String(inv.contact_id),
      token: String(inv.token), status: (inv.status as SurveyInvite["status"]) ?? "invited",
      invited_at: String(inv.invited_at ?? ""), opened_at: (inv.opened_at as string | null) ?? null,
    },
    contactName: (contact?.name as string | null) ?? null,
    loggedInMatchesInvitee: false,
    response: resp ? rowToResponse(resp) : null,
  };
}

export type SurveyAnswer = {
  top_destination?: string | null;
  other_destinations?: string[];
  weeks?: string[];
  budget_ok?: "yes" | "maybe" | "no" | null;
  budget_min?: number | null;
  budget_max?: number | null;
  looking_for?: string | null;
};

/** Save (or overwrite) a member's response for a token; marks invite completed. */
export async function submitResponse(token: string, answer: SurveyAnswer): Promise<{ ok: boolean; error?: string }> {
  const sb = db();
  const { data: inv } = await sb.from("exp_survey_invites").select("*").eq("token", token).maybeSingle();
  if (!inv) return { ok: false, error: "This survey link is no longer valid." };
  const survey = await getSurvey(String(inv.survey_id));
  if (!survey || survey.archived_at) return { ok: false, error: "This survey is closed." };
  if (survey.status === "closed") return { ok: false, error: "This survey is closed." };

  const payload = {
    survey_id: inv.survey_id,
    invite_id: inv.id,
    contact_id: inv.contact_id,
    top_destination: answer.top_destination ?? null,
    other_destinations: answer.other_destinations ?? [],
    weeks: answer.weeks ?? [],
    budget_ok: answer.budget_ok ?? null,
    budget_min: answer.budget_min ?? null,
    budget_max: answer.budget_max ?? null,
    looking_for: answer.looking_for ?? null,
    submitted_at: new Date().toISOString(),
  };
  // one response per invite → upsert on the unique invite_id
  const { error } = await sb.from("exp_survey_responses").upsert(payload, { onConflict: "invite_id" });
  if (error) return { ok: false, error: error.message };
  await sb.from("exp_survey_invites").update({ status: "completed" }).eq("id", inv.id);
  return { ok: true };
}

/** Build the survey_invite template vars for one recipient — shared by the real
 *  send AND the admin email preview, so what you preview is what goes out. */
export function surveyInviteVars(survey: Survey | null, contactName: string | null | undefined, url: string): Record<string, string> {
  const vars: Record<string, string> = {
    firstName: String(contactName ?? "").trim().split(/\s+/)[0] || "there",
    surveyTitle: survey?.title || "a quick question from NP7",
    surveyIntro: survey?.intro || "",
    surveyLink: url,
  };
  if (survey?.email_body?.trim()) vars.emailBody = survey.email_body.trim();
  const cta = (survey?.cta_label ?? "").trim();
  // One-tap date buttons: each button's link carries the answer (pre-registers
  // it; the page opens with it selected). Any survey with dated trips can use
  // them — quick mode always does, classic mode via email_date_buttons.
  const dated = survey?.destinations.filter((d) => d.start || d.end) ?? [];
  if (survey && dated.length && (survey.quick || survey.email_date_buttons !== false)) {
    const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    const range = (a?: string | null, b?: string | null) => a && b ? `${+a.slice(8, 10)}–${fmt(b)}` : fmt((a ?? b)!);
    // No default prefix: an empty CTA means the button is JUST the date.
    vars.quickChoices = JSON.stringify(dated.map((d) => ({
      label: `${cta ? `${cta} — ` : ""}${range(d.start, d.end)}${dated.length > 1 && d.label ? ` (${d.label})` : ""}`,
      url: `${url}?pick=${encodeURIComponent(d.key)}`,
    })));
    if (survey.show_decline) vars.quickDeclineUrl = `${url}?pick=none`;
  } else {
    // single-button email: its text is its own field (falls back to the join
    // label, then the template default "Take the 2-minute survey")
    const btn = (survey?.email_button_label ?? "").trim() || cta;
    if (btn) vars.surveyCtaText = btn;
  }
  return vars;
}

/** Send the branded invite email for one invite. Returns send status. */
export async function sendSurveyInviteEmail(inviteId: string, url: string): Promise<"sent" | "skipped" | "failed"> {
  const sb = db();
  const { data: inv } = await sb.from("exp_survey_invites").select("*").eq("id", inviteId).maybeSingle();
  if (!inv) return "failed";
  const [{ data: contact }, survey] = await Promise.all([
    sb.from("contacts").select("name,email").eq("id", inv.contact_id).maybeSingle(),
    getSurvey(String(inv.survey_id)),
  ]);
  if (!contact?.email) return "skipped";
  const vars = surveyInviteVars(survey, contact.name as string | null, url);
  // Quick surveys: the email buttons carry the answer — one tap on a date link
  // pre-registers it (the page then confirms and lets them adjust).
  const res = await sendEmail({
    to: contact.email,
    templateKey: "survey_invite",
    vars,
    dedupeKey: `survey_invite:${inviteId}`,
    // explicit admin button press ("Send invites") — must go out during the
    // soft launch too, like every other manual send
    manual: true,
  });
  return res.status;
}

/** Re-send the invite email as a REMINDER (fresh subject, same body + one-tap
 *  buttons). One per invite — the dedupe key makes a second press a no-op —
 *  and marks the invite reminded_at so the admin list shows the round. */
export async function sendSurveyReminderEmail(inviteId: string, url: string, subject?: string): Promise<"sent" | "skipped" | "failed"> {
  const sb = db();
  const { data: inv } = await sb.from("exp_survey_invites").select("*").eq("id", inviteId).maybeSingle();
  if (!inv) return "failed";
  const [{ data: contact }, survey] = await Promise.all([
    sb.from("contacts").select("name,email").eq("id", inv.contact_id).maybeSingle(),
    getSurvey(String(inv.survey_id)),
  ]);
  if (!contact?.email) return "skipped";
  const vars = surveyInviteVars(survey, contact.name as string | null, url);
  const res = await sendEmail({
    to: contact.email,
    templateKey: "survey_invite",
    vars,
    dedupeKey: `survey_remind:${inviteId}`,
    subjectOverride: subject?.trim() || `Quick reminder 🤙 — ${survey?.title ?? "your NP7 invite"}`,
    manual: true,
  });
  if (res.status === "sent") {
    await sb.from("exp_survey_invites").update({ reminded_at: new Date().toISOString() }).eq("id", inviteId);
  }
  return res.status;
}
