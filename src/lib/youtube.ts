/**
 * Reading a YouTube video as text.
 *
 * Nico's videos carry the real spot knowledge — the description under a spot
 * video is often a better brief than anything anyone would retype. This turns
 * a pasted link into text the intake can structure.
 *
 * Three ways to get there, best first, because none is guaranteed:
 *   1. YouTube Data API — reliable, needs YOUTUBE_API_KEY.
 *   2. The watch page — keyless and works today, but it is scraping: YouTube
 *      can change the markup whenever it likes.
 *   3. oEmbed — always works, but only gives a title.
 *
 * Every path can come back thin, so the caller shows the admin what was found
 * and lets them edit it BEFORE anything is extracted. No silent black box.
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
  via: "api" | "page" | "oembed";
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

  // 1 — the supported route
  const key = process.env.YOUTUBE_API_KEY;
  if (key) {
    try {
      const r = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${id}&key=${key}`,
        { cache: "no-store" },
      );
      const j = await r.json();
      const sn = j?.items?.[0]?.snippet;
      if (sn) {
        return {
          id,
          title: String(sn.title ?? ""),
          description: String(sn.description ?? ""),
          channel: sn.channelTitle ? String(sn.channelTitle) : null,
          via: "api",
        };
      }
    } catch { /* fall through */ }
  }

  // 2 — scrape the watch page
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

  // 3 — title only, but it always answers
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
