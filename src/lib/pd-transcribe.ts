import "server-only";

/**
 * Voice notes to text (Nico, 5 Oct: "i want to be able to put my phone to the
 * side, take the measurements and speak").
 *
 * The Claude API takes no audio, so this is ChatGPT's speech-to-text only. The
 * prompt tells it what a measuring session sounds like, so "one-ten, two
 * millimetres" comes back as numbers, not words. It holds vocabulary and no
 * readings on purpose: on silence these models hand the prompt back, and an
 * example reading echoed into a note would be filed as a real one.
 */

export const PD_TRANSCRIBE_MODEL = process.env.PD_OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe";

/** OpenAI's upload limit for one file. */
export const TRANSCRIBE_MAX_BYTES = 25 * 1024 * 1024;

/** gpt-4o-transcribe refuses audio over 1500 s; whisper-1 has no length limit. */
const GPT4O_MAX_SEC = 1450;

const PROMPT =
  "A board builder measuring a windsurf foil board, speaking German or English. " +
  "Words: rocker, tail kick, scoop, V, inverted V, double concave, width, thickness, rail, station. " +
  "Stations in centimetres from the tail, readings in millimetres. Write numbers as digits.";

export class NeedsTranscribeKey extends Error {}

/**
 * The OpenAI key, wherever it was put. Not pdAiKey(): that returns the first
 * Product Dev key that is set, and a Claude key there would hide an OpenAI key
 * in the next variable.
 */
function openAiKey(): string | null {
  return [process.env.PD_OPENAI_API_KEY, process.env.PD_ANTHROPIC_API_KEY, process.env.OPENAI_API_KEY, process.env.ANTHROPIC_API_KEY]
    .map((v) => (v ?? "").trim())
    .find((k) => k && !k.startsWith("sk-ant-")) ?? null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
// What these models write for a recording with nothing in it.
const SILENCE = [/^(thank you|thanks for watching|vielen dank|danke)( fürs zuschauen)?$/, /amara org/, /^untertitel/];

function heardNothing(text: string): boolean {
  const n = norm(text);
  return !n || norm(PROMPT).includes(n) || SILENCE.some((r) => r.test(n));
}

/**
 * Text of one recording ("" when nothing was said). Throws NeedsTranscribeKey
 * when no OpenAI key is set. `deadline` is when the calling function is cut off.
 */
export async function transcribeAudio(
  audio: Blob, filename: string, opts: { durationS?: number | null; deadline: number },
): Promise<{ text: string; model: string }> {
  const key = openAiKey();
  if (!key) {
    throw new NeedsTranscribeKey(
      "Turning speech into text needs a ChatGPT (OpenAI) key in Vercel as PD_OPENAI_API_KEY. Until then, play the note and type what you said.",
    );
  }
  if (audio.size > TRANSCRIBE_MAX_BYTES) {
    throw new Error("This recording is over 25 MB, too long to write down in one go. Split it into shorter notes.");
  }
  const models = (opts.durationS ?? 0) > GPT4O_MAX_SEC
    ? ["whisper-1"]
    : Array.from(new Set([PD_TRANSCRIBE_MODEL, "whisper-1"]));

  let lastError = "";
  for (const model of models) {
    // "auto" splits on the pauses, which is most of a measuring session
    let chunked = model.startsWith("gpt-4o");
    for (;;) {
      const left = opts.deadline - Date.now();
      if (left < 5_000) throw new Error("Writing it down took too long. Press Write it down to try again.");
      const fd = new FormData();
      fd.append("file", new File([audio], filename, { type: audio.type || "audio/mp4" }));
      fd.append("model", model);
      fd.append("prompt", PROMPT);
      fd.append("response_format", "json");
      if (chunked) fd.append("chunking_strategy", "auto");
      let res: Response;
      try {
        res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd, signal: AbortSignal.timeout(left),
        });
      } catch (e) {
        if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
          throw new Error("Writing it down took too long. Press Write it down to try again.");
        }
        throw e;
      }
      const j = (await res.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
      if (res.ok) {
        const text = (j.text ?? "").trim();
        return { text: heardNothing(text) ? "" : text, model };
      }
      const message = j.error?.message ?? "";
      lastError = `ChatGPT answered ${res.status}: ${message || "no details"}`;
      if (chunked && res.status === 400 && /chunking/i.test(message)) { chunked = false; continue; }
      // the next model only when this one is missing or the audio is too long for it
      if (res.status === 404 || /model|longer than|duration/i.test(message)) break;
      throw new Error(lastError);
    }
  }
  throw new Error(lastError || "The recording couldn't be written down.");
}
