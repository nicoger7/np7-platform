/**
 * Reading a YouTube video as text.
 *
 * Nico's videos carry the real spot knowledge — the description under a spot
 * video is often a better brief than anything anyone would retype. This turns
 * a pasted link into text the intake can structure.
 *
 * No API key involved, by design. Two keyless paths:
 *   1. The watch page — carries the full description. Verified working, but it
 *      IS scraping and YouTube owns that markup.
 *   2. oEmbed — always answers, but only gives a title.
 *
 * When both come back thin the answer isn't a key, it's jibe: the caller hands
 * the link to the intake queue and jibe watches the video on its next run,
 * exactly as it already does for free text it can't structure on the spot.
 *
 * What we DO get is shown to the admin and editable BEFORE anything is
 * extracted. No silent black box.
 */

/** Video id from any YouTube URL shape (watch, youtu.be, embed, shorts). */
export function youtubeId(url?: string | null): string | null {
  if (!url) return null;
  const m = String(url).match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

export type VideoText = {
  id: string;
  title: string;
  description: string;
  channel: string | null;
  /** which path produced it — surfaced so a thin result is explainable */
  via: "page" | "oembed";
};

/** Undo the JSON string escaping used inside the watch page's inline JSON. */
function unescapeJsonish(s: string): string {
  try {
    return JSON.parse(`"${s}"`) as string;
  } catch {
    return s.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}

export async function fetchVideoText(url: string): Promise<VideoText | { error: string }> {
  const id = youtubeId(url);
  if (!id) return { error: "That doesn't look like a YouTube link." };

  // 1 — the watch page
  try {
    const r = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, {
      cache: "no-store",
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    if (r.ok) {
      const html = await r.text();
      const desc = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/)?.[1];
      const title = html.match(/"title":\{"simpleText":"((?:[^"\\]|\\.)*)"/)?.[1]
        ?? html.match(/<meta name="title" content="([^"]*)"/)?.[1];
      const channel = html.match(/"ownerChannelName":"((?:[^"\\]|\\.)*)"/)?.[1];
      if (desc || title) {
        return {
          id,
          title: title ? unescapeJsonish(title) : "",
          description: desc ? unescapeJsonish(desc) : "",
          channel: channel ? unescapeJsonish(channel) : null,
          via: "page",
        };
      }
    }
  } catch { /* fall through */ }

  // 2 — title only, but it always answers
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
      { cache: "no-store" },
    );
    if (r.ok) {
      const j = await r.json();
      return {
        id,
        title: String(j?.title ?? ""),
        description: "",
        channel: j?.author_name ? String(j.author_name) : null,
        via: "oembed",
      };
    }
  } catch { /* fall through */ }

  return { error: "Couldn't read that video — it may be private, age-restricted or removed." };
}
