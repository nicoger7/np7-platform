/**
 * A copy of a voice note on the phone itself while it is being recorded.
 *
 * The recorder writes every one-second piece here as it arrives, and the copy
 * is dropped once the note is saved. If the page dies first (iOS reloads a
 * page that sat in the background during a call or the camera, a tab gets
 * closed, the upload fails and somebody reloads), the composer offers what is
 * left. Best effort only: every call swallows its errors, and a private window
 * simply has no copy. The recording itself never depends on this.
 *
 * Pieces are stored as ArrayBuffers, not Blobs: older iOS Safari refuses to
 * put a Blob into IndexedDB.
 */

export type VoiceBackup = {
  session: string;
  boardId: string;
  mime: string;
  startedAt: number;
  seconds: number;
  bytes: number;
};

const DB_NAME = "np7-voice-notes";
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("sessions", { keyPath: "session" });
        r.result.createObjectStore("chunks", { keyPath: ["session", "seq"] });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    }).catch((e) => { dbp = null; throw e; });
  }
  return dbp;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

function result<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

const range = (session: string) => IDBKeyRange.bound([session, 0], [session, Infinity]);

export async function backupChunk(meta: VoiceBackup, seq: number, piece: Blob): Promise<void> {
  try {
    const buf = await piece.arrayBuffer();
    const tx = (await db()).transaction(["sessions", "chunks"], "readwrite");
    tx.objectStore("chunks").put({ session: meta.session, seq, buf });
    tx.objectStore("sessions").put(meta);
    await done(tx);
  } catch { /* no copy; the recording goes on */ }
}

/** Recordings for this board that were never saved, oldest first. */
export async function listBackups(boardId: string): Promise<VoiceBackup[]> {
  try {
    const tx = (await db()).transaction("sessions");
    const all = await result(tx.objectStore("sessions").getAll() as IDBRequest<VoiceBackup[]>);
    return all.filter((m) => m.boardId === boardId).sort((a, b) => a.startedAt - b.startedAt);
  } catch { return []; }
}

export async function readBackup(meta: VoiceBackup): Promise<Blob | null> {
  try {
    const tx = (await db()).transaction("chunks");
    const rows = await result(tx.objectStore("chunks").getAll(range(meta.session)) as IDBRequest<{ seq: number; buf: ArrayBuffer }[]>);
    if (!rows.length) return null;
    rows.sort((a, b) => a.seq - b.seq);
    return new Blob(rows.map((r) => r.buf), { type: meta.mime });
  } catch { return null; }
}

export async function dropBackup(session: string): Promise<void> {
  try {
    const tx = (await db()).transaction(["sessions", "chunks"], "readwrite");
    tx.objectStore("sessions").delete(session);
    tx.objectStore("chunks").delete(range(session));
    await done(tx);
  } catch { /* stays; offered again next time */ }
}
