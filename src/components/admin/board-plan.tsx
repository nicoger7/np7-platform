"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clientSpaceFactor, cssZoomOf, screenToArtboard } from "@/lib/promo-pointer";
import { keyUrl } from "@/lib/img";
import { PhotoLoadError, fitPhoto, matchPhoto, readPhotoMask, type PhotoFit, type PhotoMask } from "@/components/admin/board-photo-outline";
import { fittingsImage, type FoundFitting } from "@/components/admin/board-fittings";
import { InfoTip } from "@/components/admin/pd-ui";
import {
  BOARD_METRICS, BOARD_METRIC_BY_KEY, disciplineLabel, effectiveValue, exactValue, fmtReading, interpolate, methodForScale, metricUnit, round, riseMarkerStation,
  rockerReadout, seriesPoints, smoothPath, toMm, topPhoto, widestPoint, zeroCrossing,
  type BoardPhoto, type PdBoard, type PdBoardCutout, type PdBoardPoint, type PdBoardSeries, type SavedTape, type SeriesPoints,
} from "@/lib/board-measurements";

/**
 * The 2D plan — outline, rocker and cross-section, drawn from the readings.
 *
 * Three rules this file is built around:
 *
 *   1. It draws ONLY what was measured. The curves are monotone cubic, which
 *      cannot overshoot between two readings, and they stop dead at the last
 *      station instead of extrapolating a nose nobody put a tape on. A drawing
 *      that invents shape is worse than no drawing, because it looks like
 *      information.
 *
 *   2. Every measured point is marked and labelled on the curve. The drawing is
 *      a reading aid for the numbers, not a replacement — the dots are where
 *      the data is, and the smooth line between them is the guess.
 *
 *   3. The vertical scale of the rocker and section views is EXAGGERATED,
 *      because 35 mm of scoop over 230 cm of board is two pixels at true scale.
 *      The factor is a control, it is drawn in the corner, and 1:1 is always
 *      one click away — an unlabelled exaggeration is how a 3 mm V ends up
 *      looking like a wave board's.
 *
 *   4. A slice can be looked at ANYWHERE, and between two readings its values
 *      are THEORETICAL: read off the same monotone curve between the two
 *      neighbouring readings, never past the first or the last one, and always
 *      marked (≈, dashed, "theoretical"), never stored. Nico, 2026-09-23: "keep
 *      it separate from the real plan that we measured, or at least mark
 *      theoretical numbers. But I would like to see measurements at whichever
 *      slice I want."
 */

/** A theoretical value between two readings, or null: at a reading (that is a
 *  measurement), outside the readings (never extrapolated), or with fewer than
 *  two readings (one thickness at 90 cm says nothing about 60). */
function theoryAt(pts: SeriesPoints, station: number): { value: number; from: number; to: number } | null {
  if (pts.length < 2 || pts.some((p) => p.station === station)) return null;
  if (station < pts[0].station || station > pts[pts.length - 1].station) return null;
  const v = interpolate(pts, station);
  if (v == null) return null;
  let i = 0;
  while (i < pts.length - 2 && pts[i + 1].station < station) i++;
  return { value: v, from: pts[i].station, to: pts[i + 1].station };
}

/** What a series says at a station: the reading, or (theory on) the marked
 *  value between two readings, or nothing. */
function valueAt(pts: SeriesPoints, station: number, theory: boolean): { value: number; exact: boolean } | null {
  const hit = pts.find((p) => p.station === station);
  if (hit) return { value: hit.value, exact: true };
  const th = theory ? theoryAt(pts, station) : null;
  return th ? { value: th.value, exact: false } : null;
}

type Props = {
  board: PdBoard;
  series: PdBoardSeries[];
  points: PdBoardPoint[];
  cutouts: PdBoardCutout[];
  /** Straight to the picture search (Photos tab, searching). */
  onFindPicture?: () => void;
  /** After cut-outs were added from the picture: reload the board. */
  onChanged?: () => void;
};

/** A fitting the AI found, in the plan's own stations and offsets. */
type PlanFitting = FoundFitting & { id: string; stFrom: number; stTo: number; offFrom: number; offTo: number; pick: boolean };
type TapeSeg = { a: { st: number; off: number }; b: { st: number; off: number } };

type View = "outline" | "rocker" | "section";

const AXIS = "var(--admin-border)";
const INK = "var(--admin-text)";
const FAINT = "var(--admin-text-faint)";

/** Readings for one metric, converted to millimetres and scale applied. */
function mmSeries(points: PdBoardPoint[], series: PdBoardSeries[], metric: string): SeriesPoints {
  const s = series.find((x) => x.metric === metric) ?? null;
  const unit = metricUnit(metric, s);
  return points
    .filter((p) => p.metric === metric && p.value != null)
    .map((p) => ({ station: p.station, value: toMm(effectiveValue(p, s) as number, unit) }))
    .sort((a, b) => a.station - b.station);
}

export function BoardPlan({ board, series, points, cutouts, onFindPicture, onChanged }: Props) {
  const [view, setView] = useState<View>("outline");
  const [exag, setExag] = useState(6);
  const [station, setStation] = useState<number | null>(null);
  const [theory, setTheory] = useState(true);
  const [labels, setLabels] = useState(true);
  const [photoOn, setPhotoOn] = useState(true);
  const [matchOn, setMatchOn] = useState(false);
  const [numbersOn, setNumbersOn] = useState(false);
  const [tapeOn, setTapeOn] = useState(false);
  const [tape, setTape] = useState<TapeSeg[]>([]);
  // Kept measurements live on the board (migration 259); shown until removed.
  const [saved, setSaved] = useState<SavedTape[]>(board.tape ?? []);
  const [tapeMsg, setTapeMsg] = useState("");
  async function keepTape(next: SavedTape[]) {
    const before = saved;
    setSaved(next); setTapeMsg("");
    const res = await fetch(`/api/admin/product-dev/boards/${board.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tape: next }),
    });
    if (!res.ok) { setSaved(before); setTapeMsg((await res.json().catch(() => ({}))).error ?? "Couldn't save the tape."); }
  }
  const [finder, setFinder] = useState<{ busy: boolean; error?: string; items?: PlanFitting[]; view?: string } | null>(null);
  const top = topPhoto(board.photos);


  const width = useMemo(() => mmSeries(points, series, "width"), [points, series]);
  const widthTop = useMemo(() => mmSeries(points, series, "width_top"), [points, series]);
  const rocker = useMemo(() => mmSeries(points, series, "rocker"), [points, series]);
  const rockerOff = useMemo(() => mmSeries(points, series, "rocker_off"), [points, series]);
  const thickness = useMemo(() => mmSeries(points, series, "thickness"), [points, series]);
  const vee = useMemo(() => mmSeries(points, series, "v"), [points, series]);
  const concave = useMemo(() => mmSeries(points, series, "concave"), [points, series]);
  const railT = useMemo(() => mmSeries(points, series, "rail_thickness"), [points, series]);
  const shot = usePhotoFit(board, photoOn ? top : null, width, widthTop, matchOn);

  // Nico, 24.09.2026: "i still dont see a button where the system searches for
  // the board 2d and matches it to our measurements". One button: without a
  // picture it searches and keeps the one that is clearly this board (cut
  // apart, deck picked out), then lays it under the plan matched to our widths;
  // with a picture it matches the one there is.
  const widthReadings = Math.max(width.length, widthTop.length);
  const [search, setSearch] = useState<{ busy: boolean; msg: string } | null>(null);
  function showMatched() {
    setPhotoOn(true); setNumbersOn(true);
    if (widthReadings >= 3) setMatchOn(true);
  }
  async function findAndMatch() {
    setSearch({ busy: true, msg: "" });
    const res = await fetch(`/api/admin/product-dev/boards/${board.id}/images`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    const j = await res.json().catch(() => ({}));
    if (j.kept) {
      showMatched();
      setSearch({ busy: false, msg: `${j.note ?? "Picture kept."}${widthReadings >= 3 ? " Matched to our widths." : " Scaled by the stated length and width (fewer than 3 width readings to match)."}` });
      onChanged?.();
      return;
    }
    if (j.needsKey) { setSearch({ busy: false, msg: j.message }); return; }
    if (!res.ok) { setSearch({ busy: false, msg: j.error ?? "The search failed." }); return; }
    // Pictures, but none clearly this board: a person picks on the Photos tab.
    setSearch({ busy: false, msg: "" });
    onFindPicture?.();
  }

  async function findFittings() {
    const fit = shot.fit, mask = shot.mask;
    if (!fit || !mask || !shot.url) return;
    setFinder({ busy: true });
    try {
      const { dataUrl, lengthCm, halfWidthCm } = await fittingsImage(mask.drawUrl ?? shot.url, mask, fit);
      const res = await fetch(`/api/admin/product-dev/boards/${board.id}/fittings`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, lengthCm, halfWidthCm, finBox: board.fin_box ?? null, discipline: disciplineLabel(board.category) }),
      });
      const j = await res.json().catch(() => ({}));
      if (j.needsKey) { setFinder({ busy: false, error: j.message }); return; }
      if (!res.ok) { setFinder({ busy: false, error: j.error ?? "Reading the picture failed." }); return; }
      // The picture's "cm from the tail" starts at its own tail end, which sits
      // `shift` behind station 0; a board measured from the nose turns round.
      const toSt = (cm: number) => (board.station_origin === "tail" ? cm - fit.shiftCm : fit.lengthCm - (cm - fit.shiftCm));
      const toOff = (cm: number) => (board.station_origin === "tail" ? cm : -cm);
      const items: PlanFitting[] = (j.items ?? []).map((it: FoundFitting, i: number) => ({
        ...it, id: String(i),
        stFrom: toSt(it.from_cm), stTo: toSt(it.to_cm), offFrom: toOff(it.offset_from_cm), offTo: toOff(it.offset_to_cm),
        pick: it.confidence !== "low",
      }));
      setFinder({ busy: false, items, view: j.view });
    } catch (e) {
      setFinder({ busy: false, error: e instanceof Error ? e.message : "Reading the picture failed." });
    }
  }

  // The drawing's x-extent: every station anybody measured, plus the board's
  // stated length if it is longer than the last reading.
  const stations = useMemo(() => {
    const all = points.map((p) => p.station);
    const max = Math.max(board.length_cm ?? 0, ...(all.length ? all : [0]));
    const min = Math.min(0, ...(all.length ? all : [0]));
    return { min, max: max || 100 };
  }, [points, board.length_cm]);

  const measuredStations = useMemo(
    () => Array.from(new Set(points.filter((p) => p.value != null).map((p) => p.station))).sort((a, b) => a - b),
    [points],
  );

  // What the section can draw at each station — shown in the picker so a
  // thin station is chosen knowingly, and used to default to the fullest one.
  const coverage = useMemo(() => {
    const has = (pts: SeriesPoints, st: number) => pts.some((p) => p.station === st);
    return new Map(measuredStations.map((st) => [st, [
      has(width, st) ? "W" : null, has(vee, st) ? "V" : null,
      has(concave, st) ? "C" : null, has(thickness, st) ? "T" : null,
    ].filter(Boolean) as string[]]));
  }, [measuredStations, width, vee, concave, thickness]);
  const fullestStation = useMemo(() => {
    let best: number | null = null, n = -1;
    for (const st of measuredStations) {
      const c = coverage.get(st) ?? [];
      if (c.includes("W") && c.length > n) { best = st; n = c.length; }
    }
    return best ?? measuredStations[Math.floor(measuredStations.length / 2)];
  }, [measuredStations, coverage]);

  const anyData = points.some((p) => p.value != null);
  // A click on the outline or the rocker puts the slice there and shows its
  // numbers right under the drawing; the view stays (Nico, 24.09.2026: "when
  // I click it takes me to cross section").
  const pickSlice = (st: number) => setStation(st);
  const sliceShown = view === "section" || station != null;

  if (!anyData && !top) {
    return (
      <div className="py-16 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
        <p className="text-sm admin-faint max-w-md mx-auto leading-relaxed">
          Nothing to draw yet. Add a width or rocker series on the Measurements tab, or a top-view picture:
          with the stated length and width it gives the whole outline.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
          {([["outline", "Outline"], ["rocker", "Rocker"], ["section", "Cross-section"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setView(k)} aria-pressed={view === k}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${view === k ? "" : "admin-muted"}`}
              style={view === k ? { backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" } : undefined}>
              {label}
            </button>
          ))}
        </div>

        {sliceShown && (
          <div className="flex items-center gap-2 text-xs admin-muted pl-1">
            <span>Slice at</span>
            <input type="range" min={Math.floor(stations.min)} max={Math.ceil(stations.max)} step={1}
              value={station ?? fullestStation} onChange={(e) => setStation(Number(e.target.value))} className="w-36 accent-[var(--admin-accent)]" />
            <input type="number" className="w-16 px-2 py-1 admin-input border rounded text-xs text-right" value={station ?? fullestStation}
              onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setStation(v); }} />
            <span>cm</span>
            {measuredStations.length > 0 && (
              <select className="px-2 py-1 admin-input border rounded text-xs" title="Jump to a measured station"
                value={measuredStations.includes(station ?? fullestStation) ? (station ?? fullestStation) : ""}
                onChange={(e) => setStation(Number(e.target.value))}>
                {!measuredStations.includes(station ?? fullestStation) && <option value="">between readings</option>}
                {measuredStations.map((st) => (
                  <option key={st} value={st}>{st} cm · {(coverage.get(st) ?? []).join(" ") || "—"}</option>
                ))}
              </select>
            )}
            {view !== "section" && (
              <button onClick={() => setStation(null)} title="Hide the slice" className="w-6 h-6 rounded-md inline-flex items-center justify-center admin-faint hover:text-[var(--admin-accent)]">×</button>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {view === "outline" && !top && (
            <ToolButton onClick={findAndMatch} active
              title="Searches the web for this board's top-view picture (the pages Research found first), keeps the one that is clearly this size, cuts it apart if it shows the deck and the bottom, and matches it to our widths">
              {search?.busy ? "Searching…" : "🔎 Find the picture & match"}
            </ToolButton>
          )}
          {view === "outline" && top && (
            <ToolButton onClick={() => { if (photoOn && matchOn) setMatchOn(false); else showMatched(); }} active={photoOn && matchOn}
              title={widthReadings >= 3
                ? "Lays the picture under the plan and scales and shifts it until it fits our measured widths best; the numbers show what the picture says where we did not measure"
                : "Needs at least 3 width readings to match against; until then the picture is scaled by the stated length and width"}>
              Match to our measurements
            </ToolButton>
          )}
          {view === "outline" && top && (
            <Menu label="Picture" active={photoOn}>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={photoOn} onChange={(e) => setPhotoOn(e.target.checked)} />
                Show the picture under the outline
              </label>
              {photoOn && (
                <>
                  <div className="text-[10px] font-bold uppercase tracking-[0.08em] admin-faint pt-1">Scale it by</div>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="radio" checked={!matchOn} onChange={() => setMatchOn(false)} />
                    The stated length and width
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="radio" checked={matchOn} onChange={() => setMatchOn(true)} />
                    Matching it to our widths
                  </label>
                  <div className="h-px my-1" style={{ backgroundColor: "var(--admin-border)" }} />
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={numbersOn} disabled={!shot.fit} onChange={(e) => setNumbersOn(e.target.checked)} />
                    Numbers from the picture
                  </label>
                  <button onClick={findFittings} disabled={!shot.fit || !!finder?.busy}
                    className="w-full text-left text-xs font-semibold px-2 py-1.5 rounded-lg transition-colors hover:bg-[var(--admin-surface-hover)] disabled:opacity-40"
                    style={{ color: "var(--admin-accent)" }}>
                    {finder?.busy ? "Looking at the picture…" : "Find the fittings (AI)"}
                  </button>
                </>
              )}
              {onFindPicture && (
                <button onClick={onFindPicture}
                  className="w-full text-left text-xs px-2 py-1.5 rounded-lg admin-muted hover:bg-[var(--admin-surface-hover)]">
                  Find another picture…
                </button>
              )}
            </Menu>
          )}
          {view === "outline" && (
            <ToolButton onClick={() => setTapeOn(!tapeOn)} active={tapeOn}
              title="Measure on the plan: drag from one point to another. Hold Shift for straight along or across.">
              📏 Tape
            </ToolButton>
          )}
          {view !== "outline" && (
            <label className="flex items-center gap-1.5 text-xs admin-muted">
              Vertical
              <select className="px-2 py-1 admin-input border rounded text-xs" value={exag} onChange={(e) => setExag(Number(e.target.value))}>
                <option value={1}>1 : 1</option><option value={3}>×3</option><option value={6}>×6</option>
                <option value={12}>×12</option><option value={25}>×25</option>
              </select>
            </label>
          )}
          <Menu label="View">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />
              Value labels on the curves
            </label>
            <label className="flex items-center gap-2 text-xs" title="Between readings: read off the curve between the two neighbouring readings, marked ≈">
              <input type="checkbox" checked={theory} onChange={(e) => setTheory(e.target.checked)} />
              Theoretical values between readings
            </label>
          </Menu>
        </div>
      </div>

      {search?.msg && (
        <p className="text-xs admin-muted mb-2 flex items-start gap-2">
          <span>{search.msg}</span>
          <button onClick={() => setSearch(null)} className="admin-faint underline shrink-0">OK</button>
        </p>
      )}
      {view === "outline" && (
        <OutlineView board={board} width={width} widthTop={widthTop} cutouts={cutouts} stations={stations} labels={labels}
          shot={shot} wanted={photoOn && !!top} slice={station} onPick={pickSlice} theory={theory}
          tapeOn={tapeOn} tape={tape} setTape={setTape} saved={saved} fittings={finder?.items ?? []} />
      )}
      {view === "outline" && (tape.length > 0 || saved.length > 0) && (
        <TapeList board={board} tape={tape} saved={saved} msg={tapeMsg}
          onClear={() => setTape([])} onRemove={(i) => setTape(tape.filter((_, j) => j !== i))}
          onSave={(i) => {
            const t = tape[i];
            setTape(tape.filter((_, j) => j !== i));
            void keepTape([...saved, { a: t.a, b: t.b, label: null, saved_at: new Date().toISOString() }]);
          }}
          onSaveAll={() => {
            const at = new Date().toISOString();
            void keepTape([...saved, ...tape.map((t) => ({ a: t.a, b: t.b, label: null, saved_at: at }))]);
            setTape([]);
          }}
          onLabel={(i, label) => keepTape(saved.map((t, j) => (j === i ? { ...t, label: label.trim() || null } : t)))}
          onForget={(i) => keepTape(saved.filter((_, j) => j !== i))} />
      )}
      {view === "outline" && finder && !finder.busy && (
        <FittingsPanel board={board} finder={finder} cutouts={cutouts} onChanged={onChanged}
          onToggle={(id) => setFinder({ ...finder, items: (finder.items ?? []).map((f) => (f.id === id ? { ...f, pick: !f.pick } : f)) })}
          onClose={() => setFinder(null)} />
      )}
      {view === "outline" && numbersOn && shot.fit && <PictureNumbers board={board} fit={shot.fit} width={width} widthTop={widthTop} />}
      {view === "rocker" && (
        <RockerView board={board} rocker={rocker} rockerOff={rockerOff}
          rockerOffNote={series.find((x) => x.metric === "rocker_off")?.convention ?? null}
          thickness={thickness} points={points} stations={stations} exag={exag} labels={labels} slice={station} onPick={pickSlice} theory={theory} />
      )}
      {view !== "section" && station != null && (
        <div className="mt-3">
          <SliceReadout board={board} station={station} points={points} series={series} theory={theory}
            pictureWidth={shot.fit ? (st) => pictureWidthAt(shot.fit as PhotoFit, st) : null} />
          <div className="flex justify-end -mt-1">
            <button onClick={() => setView("section")} className="text-xs font-semibold hover:underline" style={{ color: "var(--admin-accent)" }}>
              See the cross-section at {station} cm →
            </button>
          </div>
        </div>
      )}
      {view === "section" && (
        <SliceReadout board={board} station={station ?? fullestStation} points={points} series={series} theory={theory}
          pictureWidth={shot.fit ? (st) => pictureWidthAt(shot.fit as PhotoFit, st) : null} />
      )}
      {view === "section" && (
        <SectionView board={board} series={series}
          station={station ?? fullestStation} theory={theory}
          width={width} widthTop={widthTop} vee={vee} concave={concave} thickness={thickness} railT={railT} exag={exag} />
      )}
    </div>
  );
}

// ─── Zoom and the pointer ────────────────────────────────────────────────────

type Box = { x: number; y: number; w: number; h: number };

/**
 * Zoom into a drawing (Nico, 24.09.2026: "i want to be able to zoom in"), and
 * the one way a pointer becomes a point on it.
 *
 * The zoom is the SVG's viewBox: a smaller window onto the same drawing, so the
 * true scale, the picture underneath and the tape all stay exact. Pinch or
 * ⌘/Ctrl + scroll zooms where the pointer is; once zoomed, scrolling or
 * dragging moves around.
 *
 * The pointer goes through promo-pointer's measurement, because the admin is
 * drawn at zoom 1.1 on desktop and Safari reported the drawing's box UNZOOMED:
 * the tape landed short of the cursor, further off the further right (Nico:
 * "the cursor is not on top of the tape").
 */
type Zoom = {
  viewBox: string; box: Box; zoom: number; zoomed: boolean;
  toView: (e: { clientX: number; clientY: number }) => { x: number; y: number };
  zoomAt: (factor: number, at?: { x: number; y: number }) => void;
  reset: () => void;
  panHandlers: {
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
    onPointerUp: () => void;
  };
  /** True right after a drag, so the click that ends it does not also pick a slice. */
  wasDrag: () => boolean;
};

function useSvgZoom(W: number, H: number): [React.RefObject<SVGSVGElement | null>, Zoom] {
  const ref = useRef<SVGSVGElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [size, setSize] = useState(`${W}x${Math.round(H)}`);
  // A different drawing (other data, other exaggeration): back to the whole of it.
  if (size !== `${W}x${Math.round(H)}`) { setSize(`${W}x${Math.round(H)}`); setBox(null); }
  const cur: Box = box ?? { x: 0, y: 0, w: W, h: H };

  const clamp = (b: Box): Box | null => {
    const w = Math.min(W, Math.max(W / 8, b.w)), h = (w * H) / W;
    if (w >= W - 0.5) return null;
    return { x: Math.min(W - w, Math.max(0, b.x)), y: Math.min(H - h, Math.max(0, b.y)), w, h };
  };
  /** Client pixels → drawing units (the viewBox's own). */
  const toView = (e: { clientX: number; clientY: number }) => {
    const el = ref.current, b = cur;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const k = clientSpaceFactor(rect, { width: el.clientWidth, height: el.clientHeight }, cssZoomOf(el));
    const p = screenToArtboard(e, rect, { w: b.w, h: b.h }, k);
    return { x: b.x + p.x, y: b.y + p.y };
  };
  /** Drawing units per client pixel, for dragging. */
  const perPx = () => {
    const el = ref.current;
    if (!el) return 1;
    const rect = el.getBoundingClientRect();
    const k = clientSpaceFactor(rect, { width: el.clientWidth, height: el.clientHeight }, cssZoomOf(el));
    return rect.width > 0 ? cur.w / (rect.width * k) : 1;
  };
  const zoomAt = (factor: number, at?: { x: number; y: number }) => {
    const b = cur;
    const c = at ?? { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const w = b.w / factor, h = b.h / factor;
    setBox(clamp({ x: c.x - (c.x - b.x) * (w / b.w), y: c.y - (c.y - b.y) * (h / b.h), w, h }));
  };
  const panBy = (dx: number, dy: number) => {
    const b = cur;
    if (b.w >= W - 0.5) return;
    setBox(clamp({ ...b, x: b.x + dx, y: b.y + dy }));
  };

  // Wheel: React's is passive, and a pinch must not zoom the whole page.
  // Re-attached every render, so it always sees the current window.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const zoomed = cur.w < W - 0.5;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomAt(Math.exp(-e.deltaY * 0.01), toView(e));
      } else if (zoomed) {
        e.preventDefault();
        const u = perPx();
        panBy((e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * u, (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * u);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  // Drag to move around while zoomed (only where a drag means nothing else).
  const drag = useRef<{ x: number; y: number; box: Box; moved: boolean } | null>(null);
  const moved = useRef(false);
  const panHandlers = {
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => {
      moved.current = false;
      if (!box || e.button !== 0) return;
      drag.current = { x: e.clientX, y: e.clientY, box: cur, moved: false };
    },
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      if (!d.moved) { d.moved = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
      const u = perPx();
      setBox(clamp({ ...d.box, x: d.box.x - dx * u, y: d.box.y - dy * u }));
    },
    onPointerUp: () => { moved.current = !!drag.current?.moved; drag.current = null; },
  };

  return [ref, {
    viewBox: `${cur.x} ${cur.y} ${cur.w} ${cur.h}`, box: cur, zoom: W / cur.w, zoomed: !!box,
    toView, zoomAt, reset: () => setBox(null), panHandlers,
    wasDrag: () => moved.current,
  }];
}

function ZoomControls({ z }: { z: Zoom }) {
  const btn = "w-7 h-7 inline-flex items-center justify-center text-sm font-bold admin-muted hover:text-[var(--admin-accent)] disabled:opacity-30";
  return (
    <div className="absolute top-2 right-2 flex items-center rounded-lg overflow-hidden shadow-sm"
      style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
      <button className={btn} onClick={() => z.zoomAt(1 / 1.5)} disabled={!z.zoomed} title="Zoom out">−</button>
      <button className="px-1.5 h-7 text-[11px] font-semibold admin-muted hover:text-[var(--admin-accent)] tabular-nums" onClick={z.reset}
        title="Show the whole board. Pinch or ⌘/Ctrl + scroll to zoom where the pointer is; when zoomed, scroll or drag to move.">
        {z.zoomed ? `×${z.zoom.toFixed(1)}` : "Fit"}
      </button>
      <button className={btn} onClick={() => z.zoomAt(1.5)} disabled={z.zoom >= 7.99} title="Zoom in">+</button>
    </div>
  );
}

// ─── Shared chrome ───────────────────────────────────────────────────────────

/** The graph paper. Minor line every 10 units, major every 50, labelled. */
function Grid({ x0, x1, y0, y1, toX, toY, step = 10, major = 50, axisLabel }: {
  x0: number; x1: number; y0: number; y1: number;
  toX: (n: number) => number; toY: (n: number) => number;
  step?: number; major?: number; axisLabel?: string;
}) {
  const vlines: number[] = [];
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) vlines.push(x);
  const hlines: number[] = [];
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) hlines.push(y);

  return (
    <g>
      {vlines.map((x) => (
        <line key={`v${x}`} x1={toX(x)} x2={toX(x)} y1={toY(y0)} y2={toY(y1)}
          stroke={AXIS} strokeWidth={x % major === 0 ? 1 : 0.5} opacity={x % major === 0 ? 0.85 : 0.4} />
      ))}
      {hlines.map((y) => (
        <line key={`h${y}`} y1={toY(y)} y2={toY(y)} x1={toX(x0)} x2={toX(x1)}
          stroke={AXIS} strokeWidth={y % major === 0 ? 1 : 0.5} opacity={y % major === 0 ? 0.85 : 0.4} />
      ))}
      {vlines.filter((x) => x % major === 0).map((x) => (
        <text key={`t${x}`} x={toX(x)} y={toY(y0) + 14} textAnchor="middle" fontSize={9} fill={FAINT}>{x}</text>
      ))}
      {axisLabel && (
        <text x={toX(x1)} y={toY(y0) + 26} textAnchor="end" fontSize={9} fill={FAINT}>{axisLabel}</text>
      )}
    </g>
  );
}

function Dots({ pts, toX, toY, color, labels, fmt }: {
  pts: SeriesPoints; toX: (n: number) => number; toY: (n: number) => number;
  color: string; labels: boolean; fmt: (v: number) => string;
}) {
  return (
    <g>
      {pts.map((p) => (
        <g key={p.station}>
          <circle cx={toX(p.station)} cy={toY(p.value)} r={2.6} fill={color} />
          {labels && (
            <text x={toX(p.station)} y={toY(p.value) - 6} textAnchor="middle" fontSize={8.5} fill={color}>
              {fmt(p.value)}
            </text>
          )}
        </g>
      ))}
    </g>
  );
}

/** Under a drawing: its first sentence, and everything else one (i) away. */
function Caption({ lines }: { lines: string[] }) {
  const all = lines.filter(Boolean);
  if (!all.length) return null;
  return (
    <div className="mt-2 flex items-start gap-1.5 text-[11px] admin-faint leading-relaxed">
      <span>{all[0]}</span>
      {all.length > 1 && (
        <InfoTip label="How to read this">
          <span className="block space-y-1.5">{all.slice(1).map((l, i) => <span key={i} className="block">{l}</span>)}</span>
        </InfoTip>
      )}
    </div>
  );
}

function ToolButton({ children, onClick, active, title }: { children: ReactNode; onClick: () => void; active?: boolean; title?: string }) {
  return (
    <button onClick={onClick} title={title} aria-pressed={active}
      className="px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors"
      style={active
        ? { backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }
        : { border: "1px solid var(--admin-border)", color: "var(--admin-text-muted)" }}>
      {children}
    </button>
  );
}

/** A small dropdown for the toolbar: its settings stay one click away instead of on the bar. */
function Menu({ label, active, children }: { label: string; active?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        className="px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1"
        style={active
          ? { border: "1px solid var(--admin-accent)", color: "var(--admin-accent)" }
          : { border: "1px solid var(--admin-border)", color: "var(--admin-text-muted)" }}>
        {label}<span className="text-[9px]">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-64 rounded-xl p-3 space-y-2"
          style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border-strong)", boxShadow: "var(--admin-shadow)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

const frame = { className: "w-full rounded-xl", style: { border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" } };

// ─── Outline (top view) ──────────────────────────────────────────────────────

const PHOTO_COL = "#d946ef";

/** Read the picture once, then fit it to the board whenever the readings change. */
function usePhotoFit(board: PdBoard, photo: BoardPhoto | null, width: SeriesPoints, widthTop: SeriesPoints, match: boolean) {
  const url = photo ? keyUrl(photo.key) : null;
  // The result remembers which picture it belongs to, so "loading" is simply
  // "no result for this picture yet" and nothing is set synchronously.
  const [read, setRead] = useState<{ url: string; mask: PhotoMask | null; blocked?: boolean } | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    readPhotoMask(url)
      .then((m) => { if (alive) setRead({ url, mask: m }); })
      .catch((e) => { if (alive) setRead({ url, mask: null, blocked: e instanceof PhotoLoadError }); });
    return () => { alive = false; };
  }, [url]);
  const current = url && read?.url === url ? read : null;
  const mask = current?.mask ?? null;
  const state: "idle" | "loading" | "failed" | "blocked" =
    !url ? "idle" : !current ? "loading" : mask ? "idle" : current.blocked ? "blocked" : "failed";
  const fit = useMemo<PhotoFit | null>(() => {
    if (!mask) return null;
    const cm = (pts: SeriesPoints) => pts.map((p) => ({ station: p.station, value: p.value / 10 }));
    const opts = {
      lengthCm: board.length_cm ?? null,
      publishedLengthCm: board.research?.specs?.length_cm ?? null,
      // The stated max width sets the scale across, so a picture that is a
      // little squashed (perspective, a brand's render) still reads true widths.
      widthCm: board.max_width_cm ?? board.research?.specs?.width_cm ?? null,
      origin: board.station_origin,
      measuredTop: cm(widthTop),
      measuredBottom: cm(width),
    };
    return (match ? matchPhoto(mask, opts) : null) ?? fitPhoto(mask, opts);
  }, [mask, match, board.length_cm, board.max_width_cm, board.research, board.station_origin, width, widthTop]);
  return { url, mask, fit, state };
}

function OutlineView({ board, width, widthTop, cutouts, stations, labels, shot, wanted, slice, onPick, theory, tapeOn, tape, setTape, saved, fittings }: {
  board: PdBoard; width: SeriesPoints; widthTop: SeriesPoints; cutouts: PdBoardCutout[];
  stations: { min: number; max: number }; labels: boolean; shot: ReturnType<typeof usePhotoFit>; wanted: boolean;
  slice: number | null; onPick: (station: number) => void; theory: boolean;
  tapeOn: boolean; tape: TapeSeg[]; setTape: (t: TapeSeg[]) => void; saved: SavedTape[]; fittings: PlanFitting[];
}) {
  const [drag, setDrag] = useState<TapeSeg | null>(null);
  const PAD = 34;
  const W = 900;
  const both = width.length > 0 && widthTop.length > 0;
  const photoHalf: SeriesPoints = shot.fit ? shot.fit.widths.map((p) => ({ station: p.station, value: (p.value * 10) / 2 })) : [];
  const allMm = [...width, ...widthTop, ...photoHalf.map((p) => ({ ...p, value: p.value * 2 }))].map((p) => p.value);
  const halfMaxMm = allMm.length ? Math.max(...allMm) / 2 : 300;
  const spanCm = stations.max - stations.min || 100;
  const pxPerCm = (W - PAD * 2) / spanCm;
  // True scale in both axes — an outline is the one view that must not be
  // stretched, because its proportions are the thing you are looking at.
  const halfPx = (halfMaxMm / 10) * pxPerCm;
  const H = halfPx * 2 + PAD * 2 + 34;

  const toX = (cm: number) => PAD + (cm - stations.min) * pxPerCm;
  const centre = PAD + 14 + halfPx;
  const toYhalf = (mm: number) => centre - (mm / 10) * pxPerCm;
  const [zoomRef, z] = useSvgZoom(W, H);

  const halfOf = (pts: SeriesPoints): SeriesPoints => pts.map((p) => ({ station: p.station, value: p.value / 2 }));
  const mirror = (pts: SeriesPoints): SeriesPoints => pts.map((p) => ({ ...p, value: -p.value }));
  const bottomHalf = halfOf(width);
  const topHalf = halfOf(widthTop);
  const colB = BOARD_METRIC_BY_KEY.width.color;
  const colT = BOARD_METRIC_BY_KEY.width_top.color;

  const wide = widestPoint(width);
  const wideTop = widestPoint(widthTop);
  const hullCutouts = cutouts.filter((c) => c.station_from != null || c.station_to != null);

  if (!width.length && !widthTop.length && !photoHalf.length) {
    return (
      <div className="py-12 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
        <p className="text-sm admin-faint">No width readings yet. The outline is drawn from them.</p>
      </div>
    );
  }

  // With both widths the labels would sit on top of each other, so the top
  // width is labelled along the UPPER curve and the bottom width along the
  // LOWER one. With a single series it is labelled on the upper curve.
  const upper = widthTop.length ? topHalf : bottomHalf;
  const upperCol = widthTop.length ? colT : colB;
  const outer = widthTop.length ? topHalf : bottomHalf;

  // Rail wrap where both were read at the same station, at the widest top.
  const wrapAt = wideTop ? width.find((p) => p.station === wideTop.station) : null;

  const pick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (tapeOn || z.wasDrag()) return;
    const st = stations.min + (z.toView(e).x - PAD) / pxPerCm;
    if (st >= stations.min && st <= stations.max) onPick(Math.round(st));
  };
  // The tape: the plan is at true scale in both axes, so a line on it IS a
  // distance on the board. Points are in stations (cm) and cm off the centreline.
  const at = (e: React.PointerEvent<SVGSVGElement>) => {
    const { x, y } = z.toView(e);
    return { st: stations.min + (x - PAD) / pxPerCm, off: (centre - y) / pxPerCm };
  };
  const straight = (seg: TapeSeg, shift: boolean): TapeSeg => {
    if (!shift) return seg;
    const along = Math.abs(seg.b.st - seg.a.st) >= Math.abs(seg.b.off - seg.a.off);
    return { a: seg.a, b: along ? { st: seg.b.st, off: seg.a.off } : { st: seg.a.st, off: seg.b.off } };
  };
  const tapeHandlers = tapeOn ? {
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not every pointer can be captured */ }
      const p = at(e);
      setDrag({ a: p, b: p });
    },
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => { if (drag) setDrag(straight({ a: drag.a, b: at(e) }, e.shiftKey)); },
    onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => {
      if (!drag) return;
      const seg = straight({ a: drag.a, b: at(e) }, e.shiftKey);
      if (Math.hypot(seg.b.st - seg.a.st, seg.b.off - seg.a.off) > 0.5) setTape([...tape, seg]);
      setDrag(null);
    },
  } : z.panHandlers;
  const segLine = (seg: TapeSeg, key: string, live: boolean, kept?: { label?: string | null }) => {
    const d = Math.hypot(seg.b.st - seg.a.st, seg.b.off - seg.a.off);
    const x1 = toX(seg.a.st), y1 = centre - seg.a.off * pxPerCm, x2 = toX(seg.b.st), y2 = centre - seg.b.off * pxPerCm;
    // Kept measurements in teal, so the ones on the board and the ones just
    // taken are told apart at a glance.
    const ink = kept ? "#0f766e" : "#111827", dot = kept ? "#5eead4" : "#fbbf24";
    const text = `${kept?.label ? `${kept.label} · ` : ""}${round(d, 1)} cm`;
    const tw = Math.max(52, text.length * 6 + 10);
    return (
      <g key={key} pointerEvents="none">
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={ink} strokeWidth={2} strokeDasharray={live ? "5 3" : undefined} />
        <circle cx={x1} cy={y1} r={3.5} fill={dot} stroke={ink} />
        <circle cx={x2} cy={y2} r={3.5} fill={dot} stroke={ink} />
        <rect x={(x1 + x2) / 2 - tw / 2} y={(y1 + y2) / 2 - 20} width={tw} height={15} rx={4} fill={ink} opacity={0.88} />
        <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 9} textAnchor="middle" fontSize={10} fontWeight={700} fill={dot}>{text}</text>
      </g>
    );
  };

  return (
    <div>
      <div className="relative">
      <svg ref={zoomRef} viewBox={z.viewBox} {...frame}
        style={{ ...frame.style, cursor: tapeOn ? "crosshair" : z.zoomed ? "grab" : "crosshair", touchAction: tapeOn || z.zoomed ? "none" : undefined }}
        onClick={pick} {...tapeHandlers}>
        <title>{tapeOn ? "Drag to measure; hold Shift for straight along or across" : z.zoomed ? "Click to see the slice there; drag to move around" : "Click anywhere to see the slice there"}</title>
        <Grid x0={stations.min} x1={stations.max} y0={-halfMaxMm / 10} y1={halfMaxMm / 10}
          toX={toX} toY={(cm) => centre - cm * pxPerCm} step={10} major={50}
          axisLabel={`cm from the ${board.station_origin}`} />

        {/* The board's own picture, turned and scaled onto the same axes, under everything we measured. */}
        {shot.fit && shot.mask && shot.url && (
          <image href={shot.mask.drawUrl ?? shot.url} width={shot.mask.w} height={shot.mask.h} opacity={0.5} preserveAspectRatio="none"
            transform={shot.fit.matrix(PAD, stations.min, pxPerCm, centre)} />
        )}

        {/* Legend, top-left. It replaced a "widest" label that sat on the curve
            and collided with the value labels. */}
        <g fontSize={9} fill={FAINT}>
          {widthTop.length > 0 && (
            <>
              <line x1={PAD} x2={PAD + 16} y1={12} y2={12} stroke={colT} strokeWidth={2} />
              <text x={PAD + 21} y={15}>top{wideTop ? `, widest ${round(wideTop.value / 10, 1)} cm at ${wideTop.station}` : ""}</text>
            </>
          )}
          {width.length > 0 && (
            <>
              <line x1={PAD + (widthTop.length ? 190 : 0)} x2={PAD + (widthTop.length ? 206 : 16)} y1={12} y2={12} stroke={colB} strokeWidth={2} />
              <text x={PAD + (widthTop.length ? 211 : 21)} y={15}>bottom{wide ? `, widest ${round(wide.value / 10, 1)} cm at ${wide.station}` : ""}</text>
            </>
          )}
          {photoHalf.length > 1 && (
            <>
              <line x1={PAD} x2={PAD + 16} y1={27} y2={27} stroke={PHOTO_COL} strokeWidth={2} strokeDasharray="5 3" />
              <text x={PAD + 21} y={30}>full width, rail to rail, read from the picture{shot.mask && Math.abs(shot.mask.tiltDeg) > 0.1 ? ` (picture straightened ${round(Math.abs(shot.mask.tiltDeg), 1)}°)` : ""}</text>
            </>
          )}
        </g>

        {/* Centreline */}
        <line x1={toX(stations.min)} x2={toX(stations.max)} y1={centre} y2={centre}
          stroke={INK} strokeWidth={0.8} strokeDasharray="6 4" opacity={0.5} />

        {/* Cut-outs and fittings, in the same coordinate as everything else */}
        {hullCutouts.map((c) => {
          const a = toX(c.station_from ?? c.station_to ?? 0);
          const b = toX(c.station_to ?? c.station_from ?? 0);
          const w = ((c.width_cm ?? 4) * pxPerCm);
          const offs = c.mirrored && c.offset_cm ? [c.offset_cm, -c.offset_cm] : [c.offset_cm ?? 0];
          return offs.map((o, i) => (
            <rect key={`${c.id}-${i}`} x={Math.min(a, b)} y={centre - o * pxPerCm - w / 2}
              width={Math.max(Math.abs(b - a), 3)} height={w} rx={3}
              fill="var(--admin-accent)" opacity={0.16} stroke="var(--admin-accent)" strokeWidth={0.9} />
          ));
        })}

        {/* Station ticks across the outermost outline */}
        {outer.map((p) => (
          <line key={`tick${p.station}`} x1={toX(p.station)} x2={toX(p.station)}
            y1={toYhalf(p.value)} y2={toYhalf(-p.value)} stroke={upperCol} strokeWidth={0.6} opacity={0.25} />
        ))}

        {widthTop.length > 0 && (
          <>
            <path d={smoothPath(topHalf, toX, toYhalf, 8)} fill="none" stroke={colT} strokeWidth={2} />
            <path d={smoothPath(mirror(topHalf), toX, toYhalf, 8)} fill="none" stroke={colT} strokeWidth={2} />
          </>
        )}
        {width.length > 0 && (
          <>
            <path d={smoothPath(bottomHalf, toX, toYhalf, 8)} fill="none" stroke={colB} strokeWidth={both ? 1.6 : 2} />
            <path d={smoothPath(mirror(bottomHalf), toX, toYhalf, 8)} fill="none" stroke={colB} strokeWidth={both ? 1.6 : 2} />
          </>
        )}

        {/* The picture's own edge, traced, so the two outlines can be compared line to line. */}
        {photoHalf.length > 1 && [1, -1].map((side) => (
          <path key={`ph${side}`} fill="none" stroke={PHOTO_COL} strokeWidth={1.5} strokeDasharray="5 3"
            d={photoHalf.map((p, i) => `${i ? "L" : "M"} ${toX(p.station).toFixed(1)} ${toYhalf(side * p.value).toFixed(1)}`).join(" ")} />
        ))}

        {/* Upper curve: dots + labels (full width in cm) */}
        <Dots pts={upper} toX={toX} toY={toYhalf} color={upperCol} labels={labels} fmt={(v) => `${round(v / 5, 1)}`} />

        {slice != null && slice >= stations.min && slice <= stations.max && (() => {
          // The widths where the slice is: readings as they are, between two
          // readings the marked (≈) value, and the picture's own width.
          const x = toX(slice);
          const rows = [
            { label: "bottom", col: colB, v: valueAt(width, slice, theory) },
            { label: "top", col: colT, v: valueAt(widthTop, slice, theory) },
          ].filter((r) => r.v).map((r) => ({ ...r, cm: (r.v as { value: number }).value / 10, exact: (r.v as { exact: boolean }).exact }));
          const pic = shot.fit ? pictureWidthAt(shot.fit, slice) : null;
          const all = [...rows, ...(pic != null ? [{ label: "picture", col: PHOTO_COL, cm: pic, exact: false }] : [])];
          const flip = x > z.box.x + z.box.w * 0.8;
          return (
            <g>
              <line x1={x} x2={x} y1={22} y2={H - 8} stroke="var(--admin-accent)" strokeWidth={1.2} strokeDasharray="4 3" />
              {all.map((r) => [1, -1].map((side) => (
                <circle key={`${r.label}${side}`} cx={x} cy={toYhalf((side * r.cm * 10) / 2)} r={3} fill={r.col} stroke="var(--admin-surface)" strokeWidth={1} />
              )))}
              <text x={flip ? x - 6 : x + 6} y={H - 12} fontSize={10} fontWeight={700} textAnchor={flip ? "end" : "start"} fill="var(--admin-accent)">slice {slice} cm</text>
              {all.map((r, i) => (
                <text key={r.label} x={flip ? x - 6 : x + 6} y={36 + i * 13} fontSize={10.5} fontWeight={600} textAnchor={flip ? "end" : "start"} fill={r.col}
                  style={{ paintOrder: "stroke", stroke: "var(--admin-surface)", strokeWidth: 3 }}>
                  {r.label} {r.label === "picture" || !r.exact ? "≈ " : ""}{round(r.cm, 1)} cm
                </text>
              ))}
              {!all.length && (
                <text x={flip ? x - 6 : x + 6} y={36} fontSize={10} textAnchor={flip ? "end" : "start"} fill="var(--admin-text-faint)">no width here</text>
              )}
            </g>
          );
        })()}

        {/* Fittings the AI found in the picture: proposals, orange, until added to the Cut-outs. */}
        {fittings.map((f) => {
          const x1 = toX(f.stFrom), y1 = centre - f.offFrom * pxPerCm, x2 = toX(f.stTo), y2 = centre - f.offTo * pxPerCm;
          const col = FITTING_COL[f.kind] ?? "#f97316";
          return (
            <g key={`fit${f.id}`} opacity={f.pick ? 1 : 0.35} pointerEvents="none">
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth={f.kind === "mast_track" ? 6 : 3} strokeLinecap="round" />
              <circle cx={x1} cy={y1} r={3.5} fill="#fff" stroke={col} strokeWidth={2} />
              <circle cx={x2} cy={y2} r={3.5} fill="#fff" stroke={col} strokeWidth={2} />
              <text x={(x1 + x2) / 2} y={Math.min(y1, y2) - 7} textAnchor="middle" fontSize={9} fontWeight={700} fill={col}>{f.label}</text>
            </g>
          );
        })}
        {saved.map((seg, i) => segLine(seg, `s${i}`, false, { label: seg.label }))}
        {tape.map((seg, i) => segLine(seg, `t${i}`, false))}
        {drag && segLine(drag, "live", true)}

        {/* Lower curve: with both series it carries the BOTTOM width labels */}
        {both && bottomHalf.map((p) => (
          <g key={`lb${p.station}`}>
            <circle cx={toX(p.station)} cy={toYhalf(-p.value)} r={2.4} fill={colB} />
            {labels && (
              <text x={toX(p.station)} y={toYhalf(-p.value) + 12} textAnchor="middle" fontSize={8.5} fill={colB}>
                {round(p.value / 5, 1)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <ZoomControls z={z} />
      </div>

      <Caption lines={[
        both
          ? "True scale in both axes. Labels are the FULL width in cm at that station: top width along the upper curve, bottom width along the lower one."
          : "True scale in both axes. Labels are the full width in cm at that station; the faint tick across each station is that width.",
        [
          width.length ? `Bottom: ${width.length} readings, ${width[0].station} to ${width[width.length - 1].station} cm.` : "",
          widthTop.length ? `Top: ${widthTop.length} readings, ${widthTop[0].station} to ${widthTop[widthTop.length - 1].station} cm.` : "No top width readings yet: add a “Width (top)” column on the Measurements tab and the deck outline appears outside the bottom.",
          "Each curve stops at its last reading: it does not guess a nose or a tail.",
        ].filter(Boolean).join(" "),
        wideTop && wrapAt
          ? `At ${wideTop.station} cm the top is ${round(wideTop.value / 10, 1)} cm and the bottom ${round(wrapAt.value / 10, 1)} cm: ${round((wideTop.value - wrapAt.value) / 20, 1)} cm of rail wrap per side.`
          : board.max_width_cm
            ? `Overall max width ${board.max_width_cm} cm (stated) vs ${wide ? round(wide.value / 10, 1) : "—"} cm widest bottom reading. The difference is the rail wrap.`
            : "No overall max width on the board yet. Add one on Overview, or measure the top width per station.",
        ...photoLines(shot, wanted),
      ]} />
    </div>
  );
}

/**
 * What the picture says, in one or two sentences. The picture is the plan shape
 * from above, rail to rail: it should match "Width (top)". Against a bottom
 * width it will read wider by the rail, and that is said as expected, not as a
 * mistake. (Nico: "sometimes we take measurements on bottom, sometimes entire
 * width. They can differ.")
 */
function photoLines(shot: ReturnType<typeof usePhotoFit>, wanted: boolean): string[] {
  if (!wanted) return [];
  if (shot.state === "loading") return ["Reading the picture…"];
  if (shot.state === "blocked") return ["The browser would not let the picture be read. Reload the page; if it stays, pick the picture again on the Photos tab."];
  if (shot.state === "failed") return ["The board's edge could not be found in the picture. A product shot on a transparent or plain background works best."];
  const f = shot.fit;
  if (!f) return shot.mask ? ["Add the board's length on Overview to lay the picture over the outline at true scale."] : [];
  const m = f.match;
  if (m) {
    const lines = [
      `Matched to our ${m.against === "top" ? "top (full)" : "bottom"} widths over ${m.n} stations: at this scale the picture is ${round(f.photoLengthCm, 1)} cm tip to tail`
        + (m.byLengthCm ? ` (stated length ${m.byLengthCm} cm)` : "")
        + `, ${f.shiftCm >= 0 ? "starting" : "ending"} ${round(Math.abs(f.shiftCm), 1)} cm ${f.shiftCm >= 0 ? "behind" : "past"} station 0, and fits within ${round(m.rmsCm, 1)} cm on average.`,
    ];
    if (m.against === "bottom") lines.push(`The rail: the picture's full outline sits ${round(m.railCm, 1)} cm a side outside our bottom widths, the rail wrap.`);
    return lines;
  }
  const from = f.scaleFrom === "length" ? "the board's length" : f.scaleFrom === "published length" ? "the published length" : "the widest top width";
  const lines = [`Picture scaled to ${round(f.lengthCm, 1)} cm from ${from}, tail on the left, and its edge traced in pink.`];
  const c = f.compare;
  if (c) {
    const dir = c.mean >= 0 ? "wider" : "narrower";
    const base = `Against our ${c.against === "top" ? "top (full) width" : "bottom width"}: the picture is ${round(Math.abs(c.mean), 1)} cm ${dir} on average over ${c.n} stations, most at ${c.at} cm (${c.maxAbs > 0 ? "+" : ""}${round(c.maxAbs, 1)} cm).`;
    lines.push(c.against === "bottom"
      ? `${base} Expected: the picture shows the full outline rail to rail, and the bottom sits inside it by the rail. Measure "Width (top)" for a like-for-like check.`
      : base);
  }
  return lines;
}

/** The full width (rail to rail, cm) the fitted picture shows at a station, or null off the picture. */
function pictureWidthAt(fit: PhotoFit, station: number): number | null {
  const pts = fit.widths;
  if (!pts.length || station < pts[0].station || station > pts[pts.length - 1].station) return null;
  let i = 0;
  while (i < pts.length - 2 && pts[i + 1].station < station) i++;
  const a = pts[i], b = pts[i + 1] ?? a;
  const t = b.station === a.station ? 0 : (station - a.station) / (b.station - a.station);
  return a.value + t * (b.value - a.value);
}

/**
 * "Numbers from the picture": what the fitted picture says where we have no
 * reading. The picture shows the FULL width, rail to rail, so it is its own
 * column next to our bottom width, never mixed into it (Nico: "we need to
 * distinguish between bottom width and width; we don't have the width of this
 * board, only bottom"). The difference between the two is the rail.
 */
function PictureNumbers({ board, fit, width, widthTop }: { board: PdBoard; fit: PhotoFit; width: SeriesPoints; widthTop: SeriesPoints }) {
  const [step, setStep] = useState(10);
  const [extra, setExtra] = useState<number[]>([]);
  const [add, setAdd] = useState("");
  const [copied, setCopied] = useState(false);
  const L = fit.lengthCm;
  const fromTail = (d: number) => (board.station_origin === "tail" ? d : L - d);
  const at = (st: number) => pictureWidthAt(fit, st);
  const widest = fit.widths.reduce<{ station: number; value: number } | null>((b, p) => (!b || p.value > b.value ? p : b), null);
  const tail30 = at(fromTail(30)), nose30 = at(fromTail(L - 30));
  const ours = new Map(width.map((p) => [p.station, p.value / 10]));
  const oursTop = new Map(widthTop.map((p) => [p.station, p.value / 10]));
  const grid = step > 0 ? Array.from({ length: Math.floor(L / step) + 1 }, (_, i) => i * step) : [];
  const stations = Array.from(new Set([...width.map((p) => p.station), ...grid, ...extra]))
    .filter((st) => st >= 0 && st <= L).sort((a, b) => a - b);
  const addStations = () => {
    const vals = add.split(/[\s,;]+/).map((v) => Number(v.replace(",", "."))).filter((v) => Number.isFinite(v) && v >= 0 && v <= L);
    if (vals.length) setExtra(Array.from(new Set([...extra, ...vals])));
    setAdd("");
  };
  const stated = [board.length_cm ? `length ${board.length_cm} cm` : null, fit.cmPerPxAcross !== fit.cmPerPx ? "max width" : null].filter(Boolean);
  const how = fit.match
    ? `matched to our ${fit.match.against === "top" ? "top" : "bottom"} widths (within ${round(fit.match.rmsCm, 1)} cm)`
    : fit.scaleFrom === "stated max width" ? "scaled by the stated max width" : `scaled by the stated ${stated.join(" and ")}`;
  const copy = async () => {
    const rows = [["cm from the " + board.station_origin, "bottom width (ours)", "full width (picture)", "rail a side"],
      ...stations.map((st) => { const b = ours.get(st), f = at(st), r = rail(st, f, b).text; return [st, b != null ? round(b, 1) : "", f != null ? round(f, 1) : "", r]; })];
    try { await navigator.clipboard.writeText(rows.map((r) => r.join("\t")).join("\n")); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* no clipboard */ }
  };
  const cell = "px-2 py-1 text-right tabular-nums";
  // The rail is the full width minus the bottom, a side. Not at the very ends,
  // where the corners are rounded and the tape reads the edge itself; and a
  // bottom wider than the whole board cannot be, so it is flagged.
  const rail = (st: number, f: number | null, b: number | undefined) => {
    if (f == null || b == null) return { text: "", title: undefined as string | undefined };
    if (fromTail(st) < 3 || fromTail(st) > L - 3) return { text: "", title: "At the very end the corner is rounded: no rail to read." };
    const r = (f - b) / 2;
    if (r < -0.3) return { text: "?", title: "Our bottom reads wider than the whole picture here: check that reading, or the fit." };
    return { text: String(round(Math.max(0, r), 1)), title: undefined };
  };
  return (
    <div className="mt-4 rounded-xl p-4" style={{ border: `1px solid ${PHOTO_COL}55`, backgroundColor: "var(--admin-surface)" }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
        <span className="text-sm font-semibold admin-heading">Numbers from the picture</span>
        <span className="text-xs admin-faint">full width, rail to rail · picture {how} · theoretical, never stored</span>
        {fit.aspectOffPct != null && Math.abs(fit.aspectOffPct) > 1 && (
          <span className="text-xs text-amber-600" title="The stated length and width do not give the picture's own proportions: it is probably taken at a slight angle, so across is scaled by the width and along by the length.">
            picture {round(Math.abs(fit.aspectOffPct), 1)}% off the stated proportions
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs admin-muted">
        <span>Stations every</span>
        <select className="px-2 py-1 admin-input border rounded text-xs" value={step} onChange={(e) => setStep(Number(e.target.value))}>
          <option value={0}>ours only</option><option value={5}>5 cm</option><option value={10}>10 cm</option><option value={20}>20 cm</option>
        </select>
        <span className="ml-2">and at</span>
        <input className="w-36 px-2 py-1 admin-input border rounded text-xs" placeholder="e.g. 15, 85, 204" value={add}
          onChange={(e) => setAdd(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addStations(); }} />
        <button onClick={addStations} className="px-2 py-1 rounded-md font-semibold" style={{ border: "1px solid var(--admin-border)" }}>Add</button>
        {extra.length > 0 && <button onClick={() => setExtra([])} className="admin-faint underline">clear added</button>}
        <button onClick={copy} className="ml-auto px-2 py-1 rounded-md font-semibold" style={{ border: "1px solid var(--admin-border)" }}>
          {copied ? "Copied" : "Copy table"}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {[
          ["Max width (full)", widest ? `≈ ${round(widest.value, 1)} cm` : "—", widest ? `at ${widest.station} cm` : ""],
          ["Tail width, 30 cm", tail30 != null ? `≈ ${round(tail30, 1)} cm` : "—", "30 cm from the tail"],
          ["Nose width, 30 cm", nose30 != null ? `≈ ${round(nose30, 1)} cm` : "—", "30 cm from the nose"],
          ["Length (picture)", `≈ ${round(fit.photoLengthCm, 1)} cm`, board.length_cm ? `stated ${board.length_cm} cm` : "no stated length"],
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-lg px-3 py-2" style={{ border: "1px solid var(--admin-border)" }}>
            <div className="text-[10px] font-bold tracking-[0.08em] uppercase admin-faint">{label}</div>
            <div className="text-base font-bold italic" style={{ color: PHOTO_COL }}>{value}</div>
            <div className="text-[10px] admin-faint">{hint}</div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs w-full">
          <thead>
            <tr className="admin-faint">
              <th className="px-2 py-1 text-left font-semibold">cm from the {board.station_origin}</th>
              <th className={`${cell} font-semibold`}>our bottom width</th>
              {widthTop.length > 0 && <th className={`${cell} font-semibold`}>our top width</th>}
              <th className={`${cell} font-semibold`} style={{ color: PHOTO_COL }}>full width, picture</th>
              <th className={`${cell} font-semibold`}>rail a side</th>
            </tr>
          </thead>
          <tbody>
            {stations.map((st) => {
              const b = ours.get(st), t = oursTop.get(st), f = at(st);
              return (
                <tr key={st} style={{ borderTop: "1px solid var(--admin-border)" }}>
                  <td className="px-2 py-1 tabular-nums">{st}{extra.includes(st) && !ours.has(st) ? <span className="admin-faint"> ·added</span> : null}</td>
                  <td className={cell}>{b != null ? round(b, 1) : <span className="admin-faint">not measured</span>}</td>
                  {widthTop.length > 0 && <td className={cell}>{t != null ? round(t, 1) : <span className="admin-faint">—</span>}</td>}
                  <td className={`${cell} italic`} style={{ color: PHOTO_COL }}>{f != null ? `≈ ${round(f, 1)}` : "—"}</td>
                  <td className={cell} title={rail(st, f, b).title}>{rail(st, f, b).text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const FITTING_COL: Record<string, string> = {
  mast_track: "#ea580c", footstrap: "#d97706", fin_box: "#0d9488", foil_box: "#0d9488", vent: "#475569", handle: "#475569", other: "#475569",
};
const FITTING_KIND: Record<string, string> = {
  mast_track: "Mast track", footstrap: "Footstrap", fin_box: "Fin box", foil_box: "Foil box", vent: "Vent", handle: "Handle", other: "Other",
};

/** What the tape measured, point to point, in the plan's own terms. */
function TapeList({ board, tape, saved, msg, onClear, onRemove, onSave, onSaveAll, onLabel, onForget }: {
  board: PdBoard; tape: TapeSeg[]; saved: SavedTape[]; msg: string;
  onClear: () => void; onRemove: (i: number) => void; onSave: (i: number) => void; onSaveAll: () => void;
  onLabel: (i: number, label: string) => void; onForget: (i: number) => void;
}) {
  const pos = (p: { st: number; off: number }) => `${round(p.st, 1)} cm from the ${board.station_origin}, ${p.off >= 0 ? "+" : ""}${round(p.off, 1)} off centre`;
  const row = (seg: TapeSeg) => {
    const d = Math.hypot(seg.b.st - seg.a.st, seg.b.off - seg.a.off);
    return (
      <>
        <span className="font-bold tabular-nums admin-heading w-16">{round(d, 1)} cm</span>
        <span className="admin-muted tabular-nums">along {round(Math.abs(seg.b.st - seg.a.st), 1)} · across {round(Math.abs(seg.b.off - seg.a.off), 1)}</span>
        <span className="admin-faint">from {pos(seg.a)} to {pos(seg.b)}</span>
      </>
    );
  };
  return (
    <div className="mt-3 rounded-xl p-3" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold admin-heading">📏 Tape</span>
        <span className="text-xs admin-faint">on the plan at true scale: as accurate as the picture and the readings under it</span>
        {tape.length > 0 && (
          <span className="ml-auto flex items-center gap-3">
            <button onClick={onSaveAll} className="text-xs font-semibold" style={{ color: "var(--admin-accent)" }}>save all</button>
            <button onClick={onClear} className="text-xs admin-faint underline">clear</button>
          </span>
        )}
      </div>
      {msg && <p className="text-xs text-red-500 mb-2">{msg}</p>}
      {tape.length > 0 && (
        <ol className="space-y-1">
          {tape.map((seg, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-3 text-xs">
              {row(seg)}
              <span className="ml-auto flex items-center gap-2">
                <button onClick={() => onSave(i)} className="font-semibold" style={{ color: "var(--admin-accent)" }} title="Keep it on the board">Save</button>
                <button onClick={() => onRemove(i)} className="admin-faint hover:text-red-500" title="Remove">✕</button>
              </span>
            </li>
          ))}
        </ol>
      )}
      {saved.length > 0 && (
        <>
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] admin-faint mt-3 mb-1.5">Saved on this board ({saved.length})</div>
          <ol className="space-y-1">
            {saved.map((seg, i) => (
              <li key={`${seg.saved_at}-${i}`} className="flex flex-wrap items-baseline gap-x-3 text-xs">
                <input defaultValue={seg.label ?? ""} placeholder="name it, e.g. strap to strap" onBlur={(e) => { if ((e.target.value.trim() || null) !== (seg.label ?? null)) onLabel(i, e.target.value); }}
                  className="w-40 bg-transparent border-b text-xs focus:outline-none" style={{ borderColor: "var(--admin-border)", color: "#0f766e" }} />
                {row(seg)}
                <button onClick={() => { if (confirm("Remove this saved measurement from the board?")) onForget(i); }} className="admin-faint hover:text-red-500 ml-auto" title="Remove from the board">✕</button>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

/**
 * The fittings the AI found in the picture, as proposals: on the plan in
 * orange, listed here, and added to the Cut-outs tab only for the ones ticked.
 * Mirrored footstrap pairs become one mirrored row. Every row says it came
 * from the picture, so it is never mistaken for a tape measurement.
 */
function FittingsPanel({ board, finder, cutouts, onToggle, onClose, onChanged }: {
  board: PdBoard; finder: { error?: string; items?: PlanFitting[]; view?: string }; cutouts: PdBoardCutout[];
  onToggle: (id: string) => void; onClose: () => void; onChanged?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const items = finder.items ?? [];
  const picked = items.filter((f) => f.pick);

  async function addToCutouts() {
    setSaving(true); setMsg("");
    const rows: Record<string, unknown>[] = [];
    const used = new Set<string>();
    const mid = (f: PlanFitting) => (f.offFrom + f.offTo) / 2;
    for (const a of picked) {
      if (used.has(a.id)) continue;
      used.add(a.id);
      const pair = a.kind === "footstrap" ? picked.find((b) => !used.has(b.id) && b.kind === "footstrap"
        && Math.abs(b.stFrom - a.stFrom) < 4 && Math.abs(b.stTo - a.stTo) < 4
        && Math.sign(mid(b)) !== Math.sign(mid(a)) && Math.abs(Math.abs(mid(b)) - Math.abs(mid(a))) < 4) : undefined;
      if (pair) used.add(pair.id);
      const from = Math.min(a.stFrom, a.stTo), to = Math.max(a.stFrom, a.stTo);
      const angle = a.kind === "footstrap" && Math.abs(a.stTo - a.stFrom) > 0.5
        ? Math.abs(Math.atan2(a.offTo - a.offFrom, a.stTo - a.stFrom) * 180 / Math.PI) : null;
      rows.push({
        kind: a.kind === "foil_box" ? "fin_box" : a.kind,
        label: pair ? `${a.label.replace(/,?\s*(upper|lower|port|starboard)( side)?/i, "")} (both sides)` : a.label,
        station_from: round(from, 1), station_to: round(to, 1),
        offset_cm: round(pair ? (Math.abs(mid(a)) + Math.abs(mid(pair))) / 2 : mid(a), 1),
        mirrored: !!pair, angle_deg: angle != null ? round(angle, 1) : null,
        width_cm: null, depth_mm: null, spec: "from the picture",
        notes: `${a.note ? a.note + ". " : ""}Read from the picture by AI (${a.confidence}); check with a tape.`,
      });
    }
    const keep = cutouts.map((c) => ({
      kind: c.kind, label: c.label, station_from: c.station_from, station_to: c.station_to, offset_cm: c.offset_cm,
      mirrored: c.mirrored, width_cm: c.width_cm, depth_mm: c.depth_mm, angle_deg: c.angle_deg, spec: c.spec, notes: c.notes,
    }));
    const res = await fetch(`/api/admin/product-dev/boards/${board.id}/cutouts`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cutouts: [...keep, ...rows] }),
    });
    setSaving(false);
    if (!res.ok) { setMsg((await res.json().catch(() => ({}))).error ?? "Couldn't add them."); return; }
    setMsg(`Added ${rows.length} to the Cut-outs tab`);
    onChanged?.();
  }

  return (
    <div className="mt-3 rounded-xl p-3" style={{ border: "1px solid #f9731655", backgroundColor: "var(--admin-surface)" }}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-sm font-semibold admin-heading">Fittings in the picture</span>
        <span className="text-xs admin-faint">
          {finder.view === "bottom" ? "bottom view" : finder.view === "top" ? "deck view: fin and foil boxes are on the bottom, not visible here" : ""}
          {" · "}read by AI off a cm grid, about ±2 cm · proposals until added
        </span>
        <button onClick={onClose} className="ml-auto text-xs admin-faint underline">close</button>
      </div>
      {finder.error && <p className="text-xs text-amber-600 mb-2">{finder.error}</p>}
      {!finder.error && items.length === 0 && <p className="text-xs admin-faint">Nothing found in this picture.</p>}
      {items.length > 0 && (
        <>
          <table className="text-xs w-full mb-3">
            <thead>
              <tr className="admin-faint">
                <th className="px-2 py-1 text-left font-semibold w-6"></th>
                <th className="px-2 py-1 text-left font-semibold">what</th>
                <th className="px-2 py-1 text-right font-semibold">from – to (cm from the {board.station_origin})</th>
                <th className="px-2 py-1 text-right font-semibold">off centre (cm)</th>
                <th className="px-2 py-1 text-left font-semibold">sure</th>
                <th className="px-2 py-1 text-left font-semibold">note</th>
              </tr>
            </thead>
            <tbody>
              {items.map((f) => (
                <tr key={f.id} style={{ borderTop: "1px solid var(--admin-border)", opacity: f.pick ? 1 : 0.55 }}>
                  <td className="px-2 py-1"><input type="checkbox" checked={f.pick} onChange={() => onToggle(f.id)} /></td>
                  <td className="px-2 py-1">
                    <span className="font-semibold" style={{ color: FITTING_COL[f.kind] }}>{FITTING_KIND[f.kind] ?? f.kind}</span>
                    <span className="admin-muted"> · {f.label}</span>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{round(Math.min(f.stFrom, f.stTo), 1)} – {round(Math.max(f.stFrom, f.stTo), 1)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{round(f.offFrom, 1)}{Math.abs(f.offTo - f.offFrom) > 0.5 ? ` → ${round(f.offTo, 1)}` : ""}</td>
                  <td className="px-2 py-1">{f.confidence}</td>
                  <td className="px-2 py-1 admin-faint">{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-3">
            <button onClick={addToCutouts} disabled={saving || !picked.length}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-40"
              style={{ backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }}>
              {saving ? "Adding…" : `Add ${picked.length} to the Cut-outs`}
            </button>
            {msg && <span className="text-xs admin-muted">{msg}</span>}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Rocker (side view) ──────────────────────────────────────────────────────

function RockerView({ board, rocker, rockerOff, rockerOffNote, thickness, points, stations, exag, labels, slice, onPick, theory }: {
  board: PdBoard; rocker: SeriesPoints; rockerOff: SeriesPoints; rockerOffNote: string | null;
  thickness: SeriesPoints; points: PdBoardPoint[];
  stations: { min: number; max: number }; exag: number; labels: boolean;
  slice: number | null; onPick: (station: number) => void; theory: boolean;
}) {
  const PAD = 40;
  const W = 900;
  const spanCm = stations.max - stations.min || 100;
  const pxPerCm = (W - PAD * 2) / spanCm;
  const pxPerMm = (pxPerCm / 10) * exag;

  // Height follows the rocker and nothing else. The deck line that used to
  // ride here was rocker + thickness interpolated along the whole board — on a
  // board with one thickness reading that is a shape nobody measured, and it
  // squashed the real curve into the bottom fifth of the chart.
  const maxY = Math.max(10, ...rocker.map((p) => p.value), ...rockerOff.map((p) => p.value));
  const H = maxY * pxPerMm + PAD * 2 + 20;
  const base = H - PAD - 20;

  const toX = (cm: number) => PAD + (cm - stations.min) * pxPerCm;
  const toY = (mm: number) => base - mm * pxPerMm;
  const [zoomRef, z] = useSvgZoom(W, H);

  const marker = riseMarkerStation(points);
  const r = rockerReadout(rocker, board.station_origin, marker);

  if (!rocker.length) {
    return (
      <div className="py-12 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
        <p className="text-sm admin-faint">No rocker readings yet.</p>
      </div>
    );
  }

  const pick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (z.wasDrag()) return;
    const st = stations.min + (z.toView(e).x - PAD) / pxPerCm;
    if (st >= stations.min && st <= stations.max) onPick(Math.round(st));
  };

  return (
    <div>
      <div className="relative">
      <svg ref={zoomRef} viewBox={z.viewBox} {...frame} style={{ ...frame.style, cursor: z.zoomed ? "grab" : "crosshair", touchAction: z.zoomed ? "none" : undefined }}
        onClick={pick} {...z.panHandlers}>
        <title>{z.zoomed ? "Click to see the slice there; drag to move around" : "Click anywhere to see the slice there"}</title>
        <Grid x0={stations.min} x1={stations.max} y0={0} y1={maxY}
          toX={toX} toY={toY} step={10} major={50} axisLabel={`cm from the ${board.station_origin}`} />
        {slice != null && slice >= stations.min && slice <= stations.max && (() => {
          const x = toX(slice);
          const colR = BOARD_METRIC_BY_KEY.rocker.color;
          const rows = [
            { label: "rocker", v: valueAt(rocker, slice, theory) },
            { label: "off centre", v: valueAt(rockerOff, slice, theory) },
          ].filter((r) => r.v) as { label: string; v: { value: number; exact: boolean } }[];
          const flip = x > z.box.x + z.box.w * 0.8;
          return (
            <g>
              <line x1={x} x2={x} y1={8} y2={H - 8} stroke="var(--admin-accent)" strokeWidth={1.2} strokeDasharray="4 3" />
              {rows.map((r) => (
                <circle key={r.label} cx={x} cy={toY(r.v.value)} r={3.5} fill={colR} stroke="var(--admin-surface)" strokeWidth={1} />
              ))}
              <text x={flip ? x - 6 : x + 6} y={16} fontSize={10} fontWeight={700} textAnchor={flip ? "end" : "start"} fill="var(--admin-accent)">
                slice {slice} cm{rows.length ? "" : " · no rocker here"}
              </text>
              {rows.map((r, i) => (
                <text key={r.label} x={flip ? x - 6 : x + 6} y={30 + i * 13} fontSize={10.5} fontWeight={600} textAnchor={flip ? "end" : "start"} fill={colR}
                  style={{ paintOrder: "stroke", stroke: "var(--admin-surface)", strokeWidth: 3 }}>
                  {r.label} {r.v.exact ? "" : "≈ "}{round(r.v.value, 1)} mm
                </text>
              ))}
            </g>
          );
        })()}

        {/* The straightedge the readings were taken off. */}
        <line x1={toX(stations.min)} x2={toX(stations.max)} y1={base} y2={base} stroke={INK} strokeWidth={1.2} opacity={0.6} />

        {/* The off-centre line first, so the centreline sits on top of it. */}
        {rockerOff.length > 0 && (
          <>
            <path d={smoothPath(rockerOff, toX, toY, 8)} fill="none"
              stroke={BOARD_METRIC_BY_KEY.rocker_off.color} strokeWidth={1.6} strokeDasharray="6 3" />
            <Dots pts={rockerOff} toX={toX} toY={toY} color={BOARD_METRIC_BY_KEY.rocker_off.color} labels={labels}
              fmt={(v) => `${round(v, 1)}`} />
          </>
        )}

        <path d={smoothPath(rocker, toX, toY, 8)} fill="none" stroke={BOARD_METRIC_BY_KEY.rocker.color} strokeWidth={2} />
        <Dots pts={rocker} toX={toX} toY={toY} color={BOARD_METRIC_BY_KEY.rocker.color} labels={labels}
          fmt={(v) => `${round(v, 1)}`} />

        {/* Thickness readings, where they were taken — a tick and a number, not
            a deck curve. A deck needs thickness at the same stations as the
            rocker; where that exists it is on the cross-section. */}
        {thickness.map((p) => (
          <g key={`t${p.station}`}>
            <line x1={toX(p.station)} x2={toX(p.station)} y1={PAD - 6} y2={PAD + 8}
              stroke={BOARD_METRIC_BY_KEY.thickness.color} strokeWidth={1.4} />
            <text x={toX(p.station)} y={PAD - 10} textAnchor="middle" fontSize={8.5} fill={BOARD_METRIC_BY_KEY.thickness.color}>
              {round(p.value / 10, 1)} cm thick
            </text>
          </g>
        ))}

        {r.riseFrom != null && (
          <g>
            <line x1={toX(r.riseFrom)} x2={toX(r.riseFrom)} y1={toY(0) + 6} y2={PAD + 16}
              stroke={BOARD_METRIC_BY_KEY.rocker.color} strokeWidth={0.9} strokeDasharray="3 3" opacity={0.7} />
            <text x={toX(r.riseFrom) + 4} y={PAD + 26} fontSize={9} fill={FAINT}>
              rise from {r.riseFrom}{r.riseFromMarker ? "" : " (last zero)"}
            </text>
          </g>
        )}

        <text x={W - PAD} y={H - 6} textAnchor="end" fontSize={9} fill={FAINT}>
          vertical ×{exag} · values in mm
        </text>
      </svg>
      <ZoomControls z={z} />
      </div>

      <Caption lines={[
        exag === 1
          ? "True scale. At 1:1 a scoop-rocker line is almost a straight line. That is what it actually looks like."
          : `Vertical scale exaggerated ×${exag} so the curve is readable. Horizontal is true scale; the two axes are NOT comparable in this view.`,
        `The curve runs from ${rocker[0].station} to ${rocker[rocker.length - 1].station} cm, through the readings only. Nothing outside them is drawn.`,
        r.scoop ? `Scoop ${round(r.scoop.value, 1)} mm at station ${r.scoop.station} (the nose end).` : "No scoop measured at the nose end.",
        r.tailKick
          ? `Tail kick ${round(r.tailKick.value, 1)} mm at station ${r.tailKick.station}.`
          : r.tailEdgeStation != null && r.tailEdgeStation > 0
            ? `No tail kick recorded: the tail-most reading is at ${r.tailEdgeStation} cm and the kick sits behind that, in the last few cm at the fin. Measure at 0 and 5 cm off the same straightedge.`
            : "No tail kick: the reading at the tail edge is zero.",
        rockerOff.length
          ? `Solid = rocker on the centreline. Dashed = the off-centre line${rockerOffNote ? ` (${rockerOffNote})` : ""}; the gap between the two at a station is how far the bottom rises towards the rail there.`
          : "",
        thickness.length
          ? `Thickness was read at ${thickness.map((p) => `${p.station}`).join(", ")} cm, shown as ticks, not as a deck line.`
          : "No thickness readings.",
      ].filter(Boolean)} />
    </div>
  );
}

// ─── Cross-section ───────────────────────────────────────────────────────────

/**
 * The bottom, rail to rail, at one station — built ONLY from readings taken at
 * that exact station.
 *
 * Nothing here is interpolated. Every element is drawn if its reading exists
 * at this station and left out if it does not, and the caption lists both.
 * The first version read every input off a curve, which meant a thickness
 * measured once at 90 cm produced a full deck at 60 — a shape nobody measured,
 * drawn with the same confidence as the ones that were.
 *
 *   rails       need the width. Without it there is no section at all.
 *   V line      the rail sits `v` above (V) or below (inverted) the centre.
 *               Without a V reading the rails are drawn ON the reference plane
 *               and the caption says their height is unknown.
 *   concave     a dish cut into the board above the V line (double: one each
 *               side of the keel; single: one across) — needs V AND concave.
 *               It was once drawn below the line, as a bulge (Nico: "there
 *               should be a double concave inside the V").
 *   deck        needs thickness here; falls to the rail thickness if that was
 *               read here too, else to the rail point.
 */
function SectionView({ board, series, station, theory, width, widthTop, vee, concave, thickness, railT, exag }: {
  board: PdBoard; series: PdBoardSeries[]; station: number; theory: boolean;
  width: SeriesPoints; widthTop: SeriesPoints; vee: SeriesPoints; concave: SeriesPoints;
  thickness: SeriesPoints; railT: SeriesPoints; exag: number;
}) {
  // Each value: measured here, or (with theory on) read off the curve between
  // the two neighbouring readings and marked as such.
  const theoretical: string[] = [];
  const get = (pts: SeriesPoints, name: string): number | null => {
    const m = exactValue(pts, station);
    if (m != null) return m;
    if (!theory) return null;
    const th = theoryAt(pts, station);
    if (!th) return null;
    theoretical.push(name);
    return th.value;
  };
  const w = get(width, "width");
  const wt = get(widthTop, "top width");
  const v = get(vee, "V");
  const c = get(concave, "concave");
  const t = get(thickness, "thickness");
  const rt = get(railT, "rail");
  const isTh = (name: string) => theoretical.includes(name);
  const concaveVariant = series.find((s) => s.metric === "concave")?.variant ?? "double";

  if (w == null) {
    return (
      <div className="py-12 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
        <p className="text-sm admin-faint max-w-md mx-auto leading-relaxed">
          {theory
            ? `No width at ${station} cm: it lies outside the width readings, and the plan does not extend a curve past its last reading.`
            : `No width reading at station ${station}. Switch on “Theoretical in between” to see a slice between two readings.`}
        </p>
      </div>
    );
  }

  const PAD = 46;
  const W = 760;
  const halfMm = w / 2;
  // Room for the top width when it was read here: it is wider than the bottom.
  const spanHalf = Math.max(halfMm, (wt ?? 0) / 2);
  const pxPerMmX = (W - PAD * 2) / (spanHalf * 2);
  const pxPerMmY = pxPerMmX * exag;

  const railY = v ?? 0;
  const top = Math.max(t ?? 0, railY + (rt ?? 0), Math.abs(railY) + Math.abs(c ?? 0), 6);
  const H = Math.max(160, top * pxPerMmY + PAD * 2);
  const baseY = H - PAD;
  const cx = W / 2;
  const toX = (mm: number) => cx + mm * pxPerMmX;
  const toY = (mm: number) => baseY - mm * pxPerMmY;

  const N = 80;
  const xs = Array.from({ length: N + 1 }, (_, i) => -halfMm + (2 * halfMm * i) / N);

  // Bottom: only with a V reading; the dish only with a concave reading too.
  const bottomPath = v != null
    ? xs.map((x, i) => {
        const tt = Math.abs(x) / halfMm;
        const ref = v * tt;
        // A concave is cut INTO the board: above the straight V line in this
        // drawing (the board lies above its bottom). Double: one dish each side
        // between the keel line and the rail; single: one dish across.
        const dish = c == null ? 0 : c * (concaveVariant === "single" ? 1 - tt * tt : Math.sin(Math.PI * tt));
        return `${i ? "L" : "M"} ${toX(x)} ${toY(ref + dish)}`;
      }).join(" ")
    : "";

  // Deck: only with a thickness reading here.
  const deckPath = t != null
    ? xs.map((x, i) => {
        const tt = Math.abs(x) / halfMm;
        const railTop = railY + (rt ?? 0);
        // Elliptical fall from the centre thickness to the rail — a deck is
        // convex; a straight taper would draw a wedge no board has.
        const y = t + (railTop - t) * (1 - Math.sqrt(Math.max(0, 1 - tt * tt)));
        return `${i ? "L" : "M"} ${toX(x)} ${toY(y)}`;
      }).join(" ")
    : "";

  const have: string[] = [], theo: string[] = [];
  const put = (name: string, text: string) => (isTh(name) ? theo : have).push(isTh(name) ? `≈ ${text}` : text);
  put("width", `bottom width ${round(w / 10, 1)} cm`);
  if (wt != null) put("top width", `top width ${round(wt / 10, 1)} cm`);
  const missing: string[] = [];
  if (v != null) put("V", `V ${round(v, 2)} mm${v < 0 ? " (inverted)" : ""}`); else missing.push("V");
  if (c != null) put("concave", `${concaveVariant} concave ${round(c, 2)} mm`); else missing.push("concave");
  if (t != null) put("thickness", `thickness ${round(t / 10, 1)} cm`); else missing.push("thickness");
  if (rt != null) put("rail", `rail ${round(rt, 1)} mm`); else if (t != null) missing.push("rail thickness");
  const bottomTh = isTh("width") || isTh("V") || isTh("concave");
  const deckTh = isTh("thickness") || isTh("rail") || isTh("width");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} {...frame}>
        <line x1={PAD / 2} x2={W - PAD / 2} y1={baseY} y2={baseY} stroke={AXIS} strokeWidth={1} />
        <line x1={cx} x2={cx} y1={PAD / 2} y2={baseY + 8} stroke={AXIS} strokeWidth={0.7} strokeDasharray="4 4" />

        {v != null && c != null && (
          <path d={`M ${toX(-halfMm)} ${toY(v)} L ${toX(0)} ${toY(0)} L ${toX(halfMm)} ${toY(v)}`}
            fill="none" stroke={BOARD_METRIC_BY_KEY.v.color} strokeWidth={1} strokeDasharray="4 3" opacity={0.65} />
        )}
        {bottomPath && (
          <path d={bottomPath} fill="none" stroke={c != null ? BOARD_METRIC_BY_KEY.concave.color : BOARD_METRIC_BY_KEY.v.color} strokeWidth={2.2}
            strokeDasharray={bottomTh ? "6 4" : undefined} />
        )}
        {deckPath && <path d={deckPath} fill="none" stroke={BOARD_METRIC_BY_KEY.thickness.color} strokeWidth={2} strokeDasharray={deckTh ? "6 4" : undefined} />}

        {[-halfMm, halfMm].map((x) => (
          <g key={x}>
            <circle cx={toX(x)} cy={toY(railY)} r={3} fill={BOARD_METRIC_BY_KEY.rail_thickness.color} />
            {t != null && rt != null && (
              <line x1={toX(x)} x2={toX(x)} y1={toY(railY)} y2={toY(railY + rt)}
                stroke={BOARD_METRIC_BY_KEY.rail_thickness.color} strokeWidth={1.4} />
            )}
          </g>
        ))}

        {/* Top width: its extent only. The rail between the bottom edge and
            this mark was not measured, so no rail curve is drawn. */}
        {wt != null && [-wt / 2, wt / 2].map((x) => (
          <line key={`wt${x}`} x1={toX(x)} x2={toX(x)} y1={toY(railY) - 12} y2={toY(railY) + 6}
            stroke={BOARD_METRIC_BY_KEY.width_top.color} strokeWidth={1.6} />
        ))}

        <text x={W - PAD / 2} y={PAD / 2 + 4} textAnchor="end" fontSize={9} fill={FAINT}>
          station {station} cm · vertical ×{exag}
        </text>
        <text x={PAD / 2} y={PAD / 2 + 4} fontSize={9} fill={isTh("width") ? "var(--admin-accent)" : FAINT}>
          {isTh("width") ? "≈ " : ""}{round(w / 10, 1)} cm bottom width{isTh("width") ? " (theoretical)" : ""}
        </text>
        {(missing.length > 0 || theoretical.length > 0) && (
          <text x={cx} y={PAD / 2 + 4} textAnchor="middle" fontSize={9} fill={FAINT}>
            {theoretical.length > 0 ? `theoretical (dashed): ${theoretical.join(", ")}` : ""}
            {theoretical.length > 0 && missing.length > 0 ? " · " : ""}
            {missing.length > 0 ? `not known here: ${missing.join(", ")}` : ""}
          </text>
        )}
      </svg>

      <Caption lines={[
        have.length ? `Measured at ${station} cm: ${have.join(" · ")}.` : `Nothing was measured exactly at ${station} cm.`,
        theo.length ? `Theoretical, between the neighbouring readings (dashed): ${theo.join(" · ")}. Read off the curve, never stored.` : "",
        missing.length
          ? `Not known at ${station} cm, so not drawn: ${missing.join(", ")}.${v == null ? " Without V the rails are placed on the reference plane; their real height is unknown." : ""}`
          : theo.length ? "" : "Every element of this section was measured at this station.",
        theory ? "Click the outline or the rocker to slice anywhere." : "Only readings taken at this station are drawn. Switch on “Theoretical in between” to slice anywhere.",
        board.station_origin === "tail" ? "Looking forward from the tail." : "Looking aft from the nose.",
      ]} />
    </div>
  );
}

// ─── The slice strip: every metric at ONE station ────────────────────────────

/**
 * The same box as the board readout, for the station the section is showing.
 *
 * Exact readings only, in the units they were taken in. A metric that was
 * measured on the board but not at this station says so, which is different
 * from one never measured at all — and the hint carries the two things the
 * bare number hides: a display scale ("×0.5 applied, read 2.1") and the note
 * written on the tape at that station ("Normal V from here").
 */
function SliceReadout({ board, station, points, series, theory, pictureWidth }: {
  board: PdBoard; station: number; points: PdBoardPoint[]; series: PdBoardSeries[]; theory: boolean;
  pictureWidth: ((station: number) => number | null) | null;
}) {
  const cells = BOARD_METRICS.map((m) => {
    const s = series.find((x) => x.metric === m.key) ?? null;
    const p = points.find((x) => x.metric === m.key && x.station === station);
    const unit = metricUnit(m.key, s);
    const onBoard = points.some((x) => x.metric === m.key && (x.value != null || x.text_value));
    const base = { label: m.label, color: m.color, title: undefined as string | undefined, theoretical: false };

    if (!p || (p.value == null && !p.text_value)) {
      const th = theory && m.kind !== "choice" ? theoryAt(seriesPoints(points, m.key, s), station) : null;
      if (th) {
        return {
          ...base, theoretical: true, missing: false,
          value: `≈ ${fmtReading(m.key, round(th.value, 2), unit)}`,
          hint: `theoretical, between ${th.from} and ${th.to} cm`,
          title: `Not measured at ${station} cm. Read off the curve between the readings at ${th.from} and ${th.to} cm; never stored.`,
        };
      }
      // The full width is what a top-view picture shows: rail to rail.
      const pw = m.key === "width_top" && pictureWidth ? pictureWidth(station) : null;
      if (pw != null) {
        return {
          ...base, theoretical: true, missing: false, picture: true,
          value: `≈ ${round(pw, 1)} cm`,
          hint: "full width, from the picture",
          title: "Not measured. The full width (rail to rail) the fitted picture shows here; never stored.",
        };
      }
      return { ...base, value: "—", hint: onBoard ? `not measured at ${station} cm` : "not on this board", missing: true };
    }
    if (m.kind === "choice") {
      const word = m.choices?.find((c) => c.key === p.text_value)?.label ?? p.text_value ?? "—";
      const hint = [p.value != null ? `${p.value} ${unit} ${m.numberLabel?.toLowerCase() ?? ""}`.trim() : null, p.note].filter(Boolean).join(" · ");
      return { ...base, value: word, hint: hint || undefined, missing: false };
    }
    const v = effectiveValue(p, s);
    // Plain words, not the mechanics: "halved, tape read 2.1" — the sign is
    // already said by "inverted V" in the value, and the series variant is a
    // per-board setting that means nothing at one station. ("×0.5 applied ·
    // read -2.1 · mixed" was the first version, and it earned a "??".)
    const method = methodForScale(m.key, s?.scale);
    const scaled = v != null && p.value != null && v !== p.value;
    const untouched = !scaled && method != null && s?.scale !== 1 && p.value != null;
    const scaleWord = !scaled ? null : s!.scale === 0.5 ? "halved" : s!.scale === 2 ? "doubled" : `×${s!.scale}`;
    const hint = [
      scaled ? `tape read ${Math.abs(p.value as number)}, ${method ? "tape = 2 × V, halved" : scaleWord}` : null,
      untouched ? "as read, measured across both rails" : null,
      p.note ?? null,
    ].filter(Boolean).join(" · ");
    return {
      ...base,
      value: v == null ? (p.text_value ?? "—") : fmtReading(m.key, round(v, 3), unit),
      hint: hint || unit,
      title: method ? `${method.label}${s?.convention ? ` Series note: "${s.convention}".` : ""} Change it in the column header on the Measurements tab.` : undefined,
      missing: false,
    };
  });

  return (
    <div className="mb-4">
      <div className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase mb-1.5">
        At {station} cm from the {board.station_origin}
        {cells.some((c) => c.theoretical) && <span className="normal-case tracking-normal font-semibold ml-2" style={{ color: "var(--admin-accent)" }}>≈ theoretical, between readings, never stored</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-9 gap-px rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-border)" }}>
        {cells.map((c) => (
          <div key={c.label} className="px-3 py-2.5" style={{ backgroundColor: "var(--admin-surface)" }} title={c.title}>
            <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.08em] admin-faint uppercase">
              <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.color, opacity: c.missing ? 0.35 : 1 }} />
              <span className="truncate">{c.label}</span>
            </div>
            <div className={`text-base font-bold leading-tight ${c.missing ? "admin-faint" : c.theoretical ? "italic" : "admin-heading"}`}
              style={c.theoretical ? { color: "picture" in c && c.picture ? PHOTO_COL : "var(--admin-accent)" } : undefined}>{c.value}</div>
            {c.hint && <div className="text-[10px] admin-faint truncate" title={c.title ?? c.hint}>{c.hint}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── The readout strip, used above the plan and on the measurements tab ──────

export function BoardReadout({ board, series, points }: { board: PdBoard; series: PdBoardSeries[]; points: PdBoardPoint[] }) {
  const width = mmSeries(points, series, "width");
  const rocker = mmSeries(points, series, "rocker");
  const vee = mmSeries(points, series, "v");
  const wide = widestPoint(width);
  const wideTop = widestPoint(mmSeries(points, series, "width_top"));
  const r = rockerReadout(rocker, board.station_origin, riseMarkerStation(points));
  const cross = zeroCrossing(vee);

  const cells: { label: string; value: string; hint?: string; color?: string }[] = [
    { label: "Widest bottom", value: wide ? `${round(wide.value / 10, 1)} cm` : "—", hint: wide ? `at ${wide.station} cm` : undefined },
    wideTop
      ? { label: "Max width", value: `${round(wideTop.value / 10, 1)} cm`, hint: `top, measured at ${wideTop.station} cm${board.max_width_cm ? ` · stated ${board.max_width_cm}` : ""}` }
      : { label: "Max width", value: board.max_width_cm ? `${board.max_width_cm} cm` : "—", hint: "overall, stated" },
    { label: "Scoop", value: r.scoop ? `${round(r.scoop.value, 1)} mm` : "—", hint: r.scoop ? `at ${r.scoop.station} cm` : "nose end" },
    {
      label: "Tail kick",
      value: r.tailKick ? `${round(r.tailKick.value, 1)} mm` : "—",
      hint: r.tailKick
        ? `at ${r.tailKick.station} cm`
        : r.tailEdgeStation != null && r.tailEdgeStation > 0
          ? `not measured: nothing below ${r.tailEdgeStation} cm`
          : rocker.length ? "tail edge reads 0" : "no rocker readings",
    },
    { label: "Rocker starts", value: r.riseFrom != null ? `${r.riseFrom} cm` : "—", hint: r.riseFromMarker ? "marked" : "last zero" },
    { label: "V crossover", value: cross != null ? `${cross} cm` : "—", hint: vee.length ? "inverted → V" : "no V readings" },
  ];

  // Each number in the colour of the series it comes from, same as the grid
  // columns and the plan's curves.
  const colour: Record<string, string> = {
    "Widest bottom": BOARD_METRIC_BY_KEY.width.color,
    "Max width": BOARD_METRIC_BY_KEY.width_top.color,
    "Scoop": BOARD_METRIC_BY_KEY.rocker.color,
    "Tail kick": BOARD_METRIC_BY_KEY.rocker.color,
    "Rocker starts": BOARD_METRIC_BY_KEY.rocker.color,
    "V crossover": BOARD_METRIC_BY_KEY.v.color,
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-5">
      {cells.map((c) => (
        <div key={c.label} className="px-3 py-2.5 rounded-xl" style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
          <div className="flex items-center gap-1.5 text-[11px] font-medium admin-faint">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colour[c.label] ?? "var(--admin-border-strong)" }} />
            {c.label}
          </div>
          <div className={`text-base font-bold leading-tight mt-0.5 ${c.value === "—" ? "admin-faint" : "admin-heading"}`}>{c.value === "—" ? "-" : c.value}</div>
          {c.hint && <div className="text-[10px] admin-faint truncate" title={c.hint}>{c.hint}</div>}
        </div>
      ))}
    </div>
  );
}
