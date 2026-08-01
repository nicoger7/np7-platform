"use client";

import { useState, useEffect, useMemo, useRef, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BusinessCaseCard from "@/components/business-case-card";
import { normalizeBookingStatus } from "@/lib/types";

/** Bookings sort order: the money-secured end of the pipeline first, dead last. */
const BK_PRIORITY: Record<string, number> = {
  paid: 0, attended: 1, confirmed: 2, reserved: 3, lead: 4, lost: 5,
};
import { PackageComponentsEditor } from "@/components/package-components-editor";
import { EditionMemoriesUploader } from "@/components/edition-memories-uploader";
import { ContactPicker, ContactLite } from "@/components/contact-picker";
import { EditionCrewLevels } from "@/components/admin/edition-crew-levels";
import { BookingDetailPane } from "../../bookings/[id]/page";
import { composeBookingName } from "@/lib/booking-name";
import ImagePickerModal from "@/components/image-picker-modal";
import { useAccess } from "@/lib/use-access";
import { effectiveCanAccess, effectiveCanSeeField } from "@/lib/access";
import { PublicBadge } from "@/components/admin/public-badge";
import { editionLabel } from "@/lib/edition-label";
import { MailReadiness } from "@/components/admin/mail-readiness";
import { EditionMailing } from "@/components/admin/edition-mailing";

// Edition detail sub-tabs. The order is reorderable by drag-and-drop and saved
// per admin in localStorage (each team member keeps their own preferred order).
const DEFAULT_TABS = ["details", "branding", "mailing", "bookings", "levels", "packages", "memories", "costs", "rooms", "notes"] as const;
type EditionTab = (typeof DEFAULT_TABS)[number];
const TAB_ORDER_KEY = "np7_edition_tab_order";
const TAB_LABEL: Record<EditionTab, string> = {
  details: "Details", branding: "Branding", mailing: "Mailing", bookings: "Bookings", levels: "Levels", packages: "Packages",
  memories: "Memories", costs: "Costs", rooms: "Hotel Rooms", notes: "Notes",
};
// Each tab's data comes from a section's API — hide the tab if the role can't
// reach it (otherwise it shows but 404s on click). The edition's own tabs map to
// the experiences section the member already has to be here.
const TAB_PATH: Record<EditionTab, string> = {
  details: "/admin/editions", branding: "/admin/editions", mailing: "/admin/editions", levels: "/admin/editions",
  memories: "/admin/editions", notes: "/admin/editions",
  bookings: "/admin/bookings", packages: "/admin/packages", costs: "/admin/exp-costs", rooms: "/admin/hotel-rooms",
};
const eur = (n: number | null | undefined, cur?: string | null) => `${cur === "EUR" || !cur ? "€" : cur + " "}${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

interface Edition {
  id: string;
  experience_id: string;
  year: number;
  label: string | null;
  slug: string | null;
  date_start: string | null;
  date_end: string | null;
  computed_price_from: number | null;
  computed_price_to: number | null;
  deposit: number | null;
  max_spots: number | null;
  spots_taken: number;
  confirmed_count: number;
  status: string;
  currency: string | null;
  coaches: string | null;
  experience_code: string | null;
  pricing_details: string | null;
  payment_page_id: string | null;
  whatsapp_group_link: string | null;
  total_fixed_costs: number | null;
  estimated_costs: number | null;
  expected_revenue: number | null;
  expected_profit: number | null;
  paid_revenue: number | null;
  paid_profit: number | null;
  active: boolean;
  notion_id: string | null;
  memories_video_url: string | null;
  hero_image?: string | null;
  hero_in_emails?: boolean;
  site_live?: boolean;
  public_visible?: boolean;
  exp_experiences: {
    id: string;
    title: string;
    slug: string;
    location: string;
    hero_image: string | null;
    currency: string | null;
    code: string | null;
    status?: string | null;
    website_visible?: boolean | null;
  } | null;
  _counts?: {
    bookings: number;
    packages: number;
    costs: number;
    rooms: number;
  };
}

interface Booking {
  id: string;
  name: string;
  status: string;
  agreed_price: number | null;
  fly_in: string | null;
  fly_out: string | null;
  downpayment_received: boolean;
  final_payment_received: boolean;
  /** derived from the ledger by the API — the ✓ / ½ / — indicator */
  paid_state?: "none" | "part" | "full";
  total_paid?: number;
  total_pending?: number;
}

interface Package {
  id: string;
  name: string;
  price: number | null;
  cost_per_person: number | null;
  deposit: number | null;
  max_spots: number | null;
  status: string;
  category: string | null;
  website_visible?: boolean | null;
}

interface Cost {
  id: string;
  item: string;
  estimated_amount: number | null;
  actual_amount: number | null;
  status: string;
  date: string | null;
}

interface Room {
  id: string;
  name: string;
  hotel: string;
  room_type: string;
  room_number: string | null;
  status: string;
  booking_id: string | null;
  booking: { id: string; name: string } | null;
  extra_booking_ids: string[] | null;
  partner_tag_along: string | null;
}

const BOOKING_STATUSES: Record<string, { label: string; color: string }> = {
  lead: { label: "Lead", color: "bg-gray-500" },
  reserved: { label: "Reserved", color: "bg-amber-500" },
  confirmed: { label: "Confirmed", color: "bg-blue-500" },
  paid: { label: "Fully paid", color: "bg-green-600" },
  attended: { label: "Attended", color: "bg-gray-400" },
  lost: { label: "Lost", color: "bg-red-500" },
};

const HOTELS = ["Sorobon", "Wanapa", "Playa Surf", "Hotel Paradiso", "Alacati", "REF", "REF II"];
const COST_STATUSES = ["estimate", "confirmed", "cancelled", "unlisted"];
const ROOM_STATUSES = ["available", "assigned", "held"];
const PKG_CATEGORIES = ["", "pro", "beginner", "mixed"];
const ADD_BOOKING_STATUSES = ["lead", "reserved", "confirmed", "paid", "attended", "lost"];

// "published" is the stored value for a live/running edition — shown as "Active"
// (whether it's on the public website is a separate, experience-level setting).
const EDITION_STATUS_LABEL: Record<string, string> = { published: "Active", draft: "Draft", archived: "Archived", private: "Private" };

function BookingStatusBadge({ status }: { status: string }) {
  const s = BOOKING_STATUSES[normalizeBookingStatus(status)];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`w-2 h-2 rounded-full ${s?.color || "bg-gray-500"}`} />
      <span className="admin-muted">{s?.label || status}</span>
    </span>
  );
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function EditionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [tab, setTab] = useState<EditionTab>("details");
  const access = useAccess();
  const [tabOrder, setTabOrder] = useState<EditionTab[]>([...DEFAULT_TABS]);
  const dragTab = useRef<number | null>(null);

  // Restore the active tab from the URL on load, and reflect tab changes back into
  // the URL — so the quick-switcher can drop you onto the same tab of another edition.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && (DEFAULT_TABS as readonly string[]).includes(t)) setTab(t as EditionTab);
  }, []);
  function selectTab(t: EditionTab) {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url.toString());
  }

  // Quick-switcher: jump between the upcoming editions without leaving the tab.
  const [allEditions, setAllEditions] = useState<{ id: string; label: string | null; year: number; date_start: string | null; date_end: string | null; status: string; exp_experiences: { title: string | null } | null }[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  useEffect(() => {
    fetch("/api/admin/editions").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setAllEditions(d); }).catch(() => {});
  }, []);

  // load the saved order (per-admin, localStorage); ignore anything that isn't a
  // valid permutation of the current tab set (so adding/removing tabs is safe).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TAB_ORDER_KEY) || "null");
      if (Array.isArray(saved) && saved.length === DEFAULT_TABS.length && DEFAULT_TABS.every((t) => saved.includes(t))) {
        setTabOrder(saved as EditionTab[]);
      }
    } catch { /* ignore */ }
  }, []);

  function reorderTabs(from: number, to: number) {
    setTabOrder((order) => {
      const next = [...order];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      try { localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupTarget, setDupTarget] = useState<"existing" | "new">("existing");
  const [dupExpId, setDupExpId] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const [dupExperiences, setDupExperiences] = useState<{ id: string; title: string }[]>([]);
  const [edition, setEdition] = useState<Edition | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  // ── Branding tab (per-edition hero) ──
  const [pickingHero, setPickingHero] = useState(false);
  const [brandImg, setBrandImg] = useState("");
  const [brandScope, setBrandScope] = useState<"edition" | "all">("edition");
  const [brandInEmails, setBrandInEmails] = useState(true);
  const [brandNote, setBrandNote] = useState("");
  const [brandPacking, setBrandPacking] = useState("");
  const [inheritedPacking, setInheritedPacking] = useState<string | null>(null);
  const [inheritedNote, setInheritedNote] = useState<string | null>(null);
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandSaved, setBrandSaved] = useState(false);
  async function saveBranding() {
    if (!edition) return;
    setBrandSaving(true);
    const H = { "Content-Type": "application/json" };
    if (brandScope === "all" && edition.experience_id) {
      // Share the photo across the whole experience (website + all editions), and
      // clear this edition's override so it inherits the new shared hero.
      await fetch(`/api/admin/experiences/${edition.experience_id}`, { method: "PATCH", headers: H, body: JSON.stringify({ hero_image: brandImg || null }) }).catch(() => {});
      await fetch(`/api/admin/editions/${id}`, { method: "PATCH", headers: H, body: JSON.stringify({ hero_image: null, hero_in_emails: brandInEmails, pre_trip_note: brandNote || null, packing_list: brandPacking || null }) }).catch(() => {});
    } else {
      await fetch(`/api/admin/editions/${id}`, { method: "PATCH", headers: H, body: JSON.stringify({ hero_image: brandImg || null, hero_in_emails: brandInEmails, pre_trip_note: brandNote || null, packing_list: brandPacking || null }) }).catch(() => {});
    }
    const d = await fetch(`/api/admin/editions/${id}`).then((r) => r.json()).catch(() => null);
    if (d && !d.error) { setEdition(d); setBrandImg(d.hero_image || ""); setBrandInEmails(d.hero_in_emails !== false); setBrandNote(d.pre_trip_note ?? ""); setBrandPacking(d.packing_list ?? ""); setBrandScope("edition"); }
    setBrandSaving(false); setBrandSaved(true); setTimeout(() => setBrandSaved(false), 2000);
  }

  // ── Inline CRUD form state ──
  const emptyPkg = { name: "", price: "", cost_per_person: "", deposit: "", max_spots: "", category: "", status: "active", website_visible: true };
  const [pkgForm, setPkgForm] = useState(emptyPkg);
  const [pkgEditId, setPkgEditId] = useState<string | null>(null);
  const [pkgShow, setPkgShow] = useState(false);

  const emptyCost = { item: "", estimated_amount: "", actual_amount: "", date: "", status: "estimate" };
  const [costForm, setCostForm] = useState(emptyCost);
  const [costEditId, setCostEditId] = useState<string | null>(null);
  const [costShow, setCostShow] = useState(false);
  const [pnl, setPnl] = useState<{ received: number; expected: number; costs: number; net: number; bookings: number; componentEstimate?: { total: number; bookings: number; breakdown: { name: string; qty: number; unitCost: number; total: number }[] } } | null>(null);

  const emptyRoom = { name: "", hotel: "", room_type: "", room_number: "", status: "available", booking_id: "", extra_booking_ids: [] as string[], partner_tag_along: "" };
  const [roomForm, setRoomForm] = useState(emptyRoom);
  const [roomEditId, setRoomEditId] = useState<string | null>(null);
  const [roomShow, setRoomShow] = useState(false);

  const emptyBooking = { name: "", contact_id: "", status: "lead", agreed_price: "", package_id: "" };
  const [bookingForm, setBookingForm] = useState(emptyBooking);
  const [bookingContact, setBookingContact] = useState<ContactLite | null>(null);
  const [bookingShow, setBookingShow] = useState(false);
  const [selBooking, setSelBooking] = useState<string | null>(null);
  // Bookings sort — money-secured first by default (fully paid on top, lost last)
  const [bkSort, setBkSort] = useState<"status" | "name" | "fly_in" | "price" | "paid">("status");
  const [bkDir, setBkDir] = useState<"asc" | "desc">("asc");
  const sortedBookings = useMemo(() => {
    const dir = bkDir === "asc" ? 1 : -1;
    const paidRank = (b: Booking) => (b.paid_state === "full" ? 0 : b.paid_state === "part" ? 1 : 2);
    return [...bookings].sort((a, b) => {
      let d = 0;
      if (bkSort === "status") d = (BK_PRIORITY[normalizeBookingStatus(a.status)] ?? 9) - (BK_PRIORITY[normalizeBookingStatus(b.status)] ?? 9);
      else if (bkSort === "name") d = (a.name ?? "").localeCompare(b.name ?? "");
      else if (bkSort === "price") d = Number(b.agreed_price ?? 0) - Number(a.agreed_price ?? 0); // biggest first
      else if (bkSort === "paid") d = paidRank(a) - paidRank(b);
      else if (bkSort === "fly_in") {
        // empty fly-in dates always sink to the bottom
        const av = a.fly_in || "", bv = b.fly_in || "";
        if (!av !== !bv) return av ? -1 : 1;
        d = av.localeCompare(bv);
      }
      return (d !== 0 ? d : (a.name ?? "").localeCompare(b.name ?? "")) * dir;
    });
  }, [bookings, bkSort, bkDir]);
  const [copyPkgOpen, setCopyPkgOpen] = useState(false);
  const [copyPkgBusy, setCopyPkgBusy] = useState(false);
  async function copyPackagesFrom(fromEditionId: string) {
    setCopyPkgBusy(true);
    // honest outcome — a silent no-op here cost real debugging time (copying
    // from an edition that simply has no packages looks like a broken button)
    let msg = "Copy failed — please try again.";
    try {
      const res = await fetch(`/api/admin/editions/${id}/copy-packages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromEditionId }) });
      const j = await res.json().catch(() => ({} as { copied?: number; error?: string }));
      if (res.ok) {
        msg = (j.copied ?? 0) > 0
          ? `Copied ${j.copied} package${j.copied === 1 ? "" : "s"}.`
          : "Nothing copied — that edition has no packages. Pick a previous-year edition that actually has some.";
      } else if (j.error) msg = j.error;
    } catch {}
    setCopyPkgBusy(false); setCopyPkgOpen(false);
    loadPackages();
    alert(msg);
  }

  // Details-tab section show/hide (consistent with list-page column toggles)
  const SECTION_KEY = "np7-edition-sections";
  const ALL_SECTIONS = [
    { key: "operations", label: "Operations" },
    { key: "financials", label: "Financials" },
  ];
  const [hiddenSections, setHiddenSections] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem(SECTION_KEY) || "[]")); } catch { return new Set(); }
  });
  const [sectionMenu, setSectionMenu] = useState(false);
  function toggleSection(key: string) {
    setHiddenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      if (typeof window !== "undefined") localStorage.setItem(SECTION_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  // Notes
  interface Note { id: string; author: string; body: string; created_at: string }
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");
  const loadNotes = () =>
    fetch(`/api/admin/editions/${id}/notes`).then((r) => r.json()).then((d) => setNotes(d.notes || []));
  async function addNote() {
    if (!newNote.trim()) return;
    await fetch(`/api/admin/editions/${id}/notes`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: newNote.trim() }),
    });
    setNewNote(""); loadNotes();
  }
  async function deleteNote(noteId: string) {
    await fetch(`/api/admin/editions/${id}/notes?note_id=${noteId}`, { method: "DELETE" });
    loadNotes();
  }

  const loadBookings = () =>
    fetch(`/api/admin/bookings?edition_id=${id}`).then((r) => r.json()).then((d) => setBookings(d.bookings || []));
  const loadPackages = () =>
    fetch(`/api/admin/packages?edition_id=${id}`).then((r) => r.json()).then((d) => setPackages(d || []));
  const loadCosts = () =>
    fetch(`/api/admin/exp-costs?edition_id=${id}`).then((r) => r.json()).then((d) => setCosts(d || []));
  const loadPnl = () =>
    fetch(`/api/admin/editions/${id}/pnl`).then((r) => r.json()).then((d) => setPnl(d)).catch(() => {});
  const loadRooms = () =>
    fetch(`/api/admin/hotel-rooms?edition_id=${id}`).then((r) => r.json()).then((d) => setRooms(d.rooms || []));

  useEffect(() => {
    fetch(`/api/admin/editions/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setEdition(d);
        setBrandImg(d.hero_image || "");
        setBrandInEmails(d.hero_in_emails !== false);
        setBrandNote(d.pre_trip_note ?? ""); setBrandPacking(d.packing_list ?? "");
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (tab === "bookings") { loadBookings(); loadPackages(); }
    if (tab === "packages") { loadPackages(); loadBookings(); }
    if (tab === "costs") { loadCosts(); loadPnl(); }
    if (tab === "rooms") { loadRooms(); loadBookings(); }
    if (tab === "notes") loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id]);

  const expId = edition?.experience_id;

  // Packages
  async function savePackage() {
    const body = {
      name: pkgForm.name,
      price: pkgForm.price ? Number(pkgForm.price) : null,
      cost_per_person: pkgForm.cost_per_person ? Number(pkgForm.cost_per_person) : null,
      deposit: pkgForm.deposit ? Number(pkgForm.deposit) : null,
      max_spots: pkgForm.max_spots ? Number(pkgForm.max_spots) : null,
      category: pkgForm.category || null,
      status: pkgForm.status,
      website_visible: pkgForm.website_visible,
      edition_id: id,
      experience_id: expId,
    };
    if (pkgEditId) {
      await fetch(`/api/admin/packages/${pkgEditId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch(`/api/admin/packages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setPkgShow(false); setPkgEditId(null); setPkgForm(emptyPkg); loadPackages();
  }
  async function deletePackage(pkgId: string) {
    if (!confirm("Delete this package?")) return;
    await fetch(`/api/admin/packages/${pkgId}`, { method: "DELETE" });
    loadPackages();
  }
  async function duplicatePackage(pkgId: string) {
    await fetch(`/api/admin/packages/${pkgId}/duplicate`, { method: "POST" });
    loadPackages();
  }

  // Costs
  async function saveCost() {
    const body = {
      item: costForm.item,
      estimated_amount: costForm.estimated_amount ? Number(costForm.estimated_amount) : null,
      actual_amount: costForm.actual_amount ? Number(costForm.actual_amount) : null,
      date: costForm.date || null,
      status: costForm.status,
      edition_id: id,
      experience_id: expId,
    };
    if (costEditId) {
      await fetch(`/api/admin/exp-costs/${costEditId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch(`/api/admin/exp-costs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setCostShow(false); setCostEditId(null); setCostForm(emptyCost); loadCosts();
  }
  async function deleteCost(costId: string) {
    if (!confirm("Delete this cost item?")) return;
    await fetch(`/api/admin/exp-costs/${costId}`, { method: "DELETE" });
    loadCosts();
  }

  // Rooms
  async function saveRoom() {
    const body = {
      name: roomForm.name,
      hotel: roomForm.hotel || null,
      room_type: roomForm.room_type || null,
      room_number: roomForm.room_number || null,
      status: roomForm.status,
      booking_id: roomForm.booking_id || null,
      // additional guests sharing this room (own booking, no room of their own)
      extra_booking_ids: (roomForm.extra_booking_ids || []).filter((x) => x && x !== roomForm.booking_id),
      // a companion with no booking at all (e.g. a partner just tagging along)
      partner_tag_along: roomForm.partner_tag_along || null,
      edition_id: id,
      experience_id: expId,
    };
    if (roomEditId) {
      await fetch(`/api/admin/hotel-rooms/${roomEditId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch(`/api/admin/hotel-rooms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setRoomShow(false); setRoomEditId(null); setRoomForm(emptyRoom); loadRooms();
  }
  async function deleteRoom(roomId: string) {
    if (!confirm("Delete this room?")) return;
    await fetch(`/api/admin/hotel-rooms/${roomId}`, { method: "DELETE" });
    loadRooms();
  }

  // Auto booking name: "{experience code} {year} — {participant}"
  function autoBookingName(contact: ContactLite | null) {
    if (!contact) return "";
    return composeBookingName({
      contactName: contact.name,
      experienceTitle: edition?.exp_experiences?.title || edition?.exp_experiences?.code || null,
      editionLabel: edition?.label,
      year: edition?.year,
    });
  }

  // Bookings (add inline; edit on detail page)
  async function addBooking() {
    if (!bookingForm.contact_id) return;
    const body = {
      name: autoBookingName(bookingContact) || bookingContact?.name || "",
      contact_id: bookingForm.contact_id,
      status: bookingForm.status,
      agreed_price: bookingForm.agreed_price ? Number(bookingForm.agreed_price) : null,
      package_id: bookingForm.package_id || null,
      edition_id: id,
      experience_id: expId,
    };
    await fetch(`/api/admin/bookings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBookingShow(false); setBookingForm(emptyBooking); setBookingContact(null); loadBookings();
  }
  async function deleteBooking(bookingId: string) {
    if (!confirm("Delete this booking?")) return;
    await fetch(`/api/admin/bookings/${bookingId}`, { method: "DELETE" });
    loadBookings();
  }

  async function handleSave() {
    if (!edition) return;
    setSaving(true);
    await fetch(`/api/admin/editions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year: edition.year,
        label: edition.label,
        slug: edition.slug,
        date_start: edition.date_start,
        date_end: edition.date_end,
        deposit: edition.deposit,
        max_spots: edition.max_spots,
        status: edition.status,
        currency: edition.currency,
        coaches: edition.coaches,
        experience_code: edition.experience_code,
        payment_page_id: edition.payment_page_id,
        whatsapp_group_link: edition.whatsapp_group_link,
        active: edition.active,
        notion_id: edition.notion_id,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  useEffect(() => {
    if (!dupOpen || dupExperiences.length) return;
    fetch("/api/admin/experiences").then((r) => r.json()).then((d) => {
      const list = Array.isArray(d) ? d : d.experiences || [];
      setDupExperiences(list.map((e: Record<string, string>) => ({ id: e.id, title: e.title })));
    });
  }, [dupOpen, dupExperiences.length]);

  async function duplicateEdition() {
    setDuplicating(true);
    const res = await fetch(`/api/admin/editions/${id}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dupTarget === "new" ? { target: "new" } : { target: "existing", experienceId: dupExpId }),
    });
    setDuplicating(false);
    if (res.ok) { const d = await res.json(); router.push(`/admin/editions/${d.id}`); }
  }

  async function handleDelete() {
    if (!confirm("Delete this edition? This cannot be undone.")) return;
    await fetch(`/api/admin/editions/${id}`, { method: "DELETE" });
    if (edition?.experience_id) {
      router.push(`/admin/experiences/${edition.experience_id}`);
    } else {
      router.push("/admin/experiences");
    }
  }

  function update(field: string, value: unknown) {
    setEdition((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  if (loading) {
    return <div className="text-sm admin-faint">Loading...</div>;
  }

  if (!edition) {
    return <div className="text-sm text-red-400">Edition not found</div>;
  }

  const currency = edition.currency || edition.exp_experiences?.currency || "EUR";
  const spotsRemaining = edition.max_spots != null
    ? Math.max(0, edition.max_spots - edition.confirmed_count)
    : null;
  const priceRange =
    edition.computed_price_from == null && edition.computed_price_to == null
      ? "No packages yet"
      : edition.computed_price_from != null &&
        edition.computed_price_to != null &&
        edition.computed_price_from !== edition.computed_price_to
      ? `${currency} ${Number(edition.computed_price_from).toLocaleString()} – ${Number(edition.computed_price_to).toLocaleString()}`
      : `${currency} ${Number(edition.computed_price_from ?? edition.computed_price_to).toLocaleString()}`;

  const inputClass =
    "w-full px-4 py-2.5 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1.5";

  return (
    <div>
      {/* Quick-switcher — jump between upcoming editions, keeping the current tab */}
      {(() => {
        const today = new Date().toISOString().slice(0, 10);
        // Current (still running — not yet ended) + upcoming, soonest first, max 5.
        const upcoming = allEditions
          .filter((e) => e.id !== id && (e.date_end ?? e.date_start) && (e.date_end ?? e.date_start)! >= today)
          .sort((a, b) => ((a.date_start ?? "") < (b.date_start ?? "") ? -1 : 1))
          .slice(0, 5);
        if (upcoming.length === 0) return null;
        return (
          <div className="relative mb-4">
            <button
              onClick={() => setSwitcherOpen((v) => !v)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold admin-muted hover:admin-heading transition-colors"
              style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></svg>
              Switch edition
              <span className="admin-faint font-normal">· {upcoming.length} current & upcoming</span>
              <svg className={`w-3 h-3 transition-transform ${switcherOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {switcherOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSwitcherOpen(false)} />
                <div className="absolute left-0 top-full mt-1.5 z-50 py-1.5 rounded-xl min-w-[300px] max-h-[60vh] overflow-y-auto" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-bg)", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
                  <div className="px-3 pb-1.5 mb-1 text-[10px] font-bold tracking-[0.1em] admin-faint uppercase" style={{ borderBottom: "1px solid var(--admin-border)" }}>Upcoming editions</div>
                  {upcoming.map((e) => (
                    <Link
                      key={e.id}
                      href={`/admin/editions/${e.id}?tab=${tab}`}
                      onClick={() => setSwitcherOpen(false)}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm admin-muted hover:admin-heading hover:bg-[var(--admin-surface-hover)] transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium truncate">{e.exp_experiences?.title || "Edition"} — {editionLabel(e)}</span>
                        <span className="block text-[11px] admin-faint">{formatDate(e.date_start)}</span>
                      </span>
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${e.status === "published" ? "bg-green-500/15 text-green-400" : "admin-surface admin-faint"}`}>{EDITION_STATUS_LABEL[e.status] ?? e.status}</span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-3">
          {edition.experience_id && (
            <Link
              href={`/admin/experiences/${edition.experience_id}`}
              className="admin-faint hover:admin-muted transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold admin-heading">
                {edition.exp_experiences?.title || "Edition"} — {editionLabel(edition)}
              </h1>
              <span
                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.05em] ${
                  edition.status === "published"
                    ? "bg-green-500/15 text-green-400"
                    : edition.status === "archived"
                    ? "bg-red-500/15 text-red-400"
                    : edition.status === "private"
                    ? "bg-purple-500/15 text-purple-400"
                    : "admin-surface admin-muted"
                }`}
              >
                {EDITION_STATUS_LABEL[edition.status] ?? edition.status}
              </span>
              {/* Real public visibility — published edition + published experience + the
                  public Experience section revealed (SHOW_EXPERIENCE). */}
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.05em] ${
                  edition.public_visible ? "bg-green-500/15 text-green-400" : "admin-surface admin-faint"
                }`}
                title={
                  edition.public_visible
                    ? "Live — visible to the public on the website."
                    : edition.exp_experiences?.website_visible === false
                    ? "Off the public website by choice — toggle it on the experience's Details page (Public website)."
                    : edition.site_live === false
                    ? "Not live yet: the public Experience section is still hidden (SHOW_EXPERIENCE off)."
                    : edition.status !== "published"
                    ? "Hidden: this edition isn't Active yet."
                    : "Hidden: the parent experience isn't Active."
                }
              >
                <span className={`w-1.5 h-1.5 rounded-full ${edition.public_visible ? "bg-green-400" : "bg-current opacity-50"}`} />
                {edition.public_visible ? "On website" : "Off website"}
              </span>
            </div>
            <p className="text-sm admin-muted">
              {edition.exp_experiences?.location || ""}
              {edition.experience_code ? ` • ${edition.experience_code}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {tab === "details" && (
            <div className="relative">
              <button
                onClick={() => setSectionMenu((v) => !v)}
                className={`p-2 rounded-lg transition-colors ${sectionMenu ? "bg-[var(--admin-accent)]/15 text-[#0aa3c7]" : "admin-faint"}`}
                style={{ border: "1px solid var(--admin-border)" }}
                title="Show/hide sections"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" /><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M4.93 19.07l1.41-1.41M19.07 19.07l-1.41-1.41M12 2v2M12 20v2M2 12h2M20 12h2" />
                </svg>
              </button>
              {sectionMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 py-1.5 rounded-xl min-w-[160px]" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-bg)", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
                  <div className="px-3 pb-1.5 mb-1 text-[10px] font-bold tracking-[0.1em] admin-faint uppercase" style={{ borderBottom: "1px solid var(--admin-border)" }}>Sections</div>
                  {ALL_SECTIONS.map((s) => (
                    <label key={s.key} className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer text-sm admin-muted hover:admin-heading transition-colors">
                      <input type="checkbox" checked={!hiddenSections.has(s.key)} onChange={() => toggleSection(s.key)} className="w-3.5 h-3.5 accent-[#0aa3c7]" />
                      {s.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => { setDupExpId(edition.experience_id); setDupTarget("existing"); setDupOpen(true); }}
            className="px-3 py-2 text-xs admin-muted hover:admin-heading transition-colors"
            title="Duplicate this edition (packages, components, costs)"
          >
            Duplicate
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-2 text-xs text-red-400/60 hover:text-red-400 transition-colors"
          >
            Delete
          </button>
          {tab === "details" && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-50 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors"
            >
              {saving ? "Saving..." : saved ? "Saved!" : "Save"}
            </button>
          )}
        </div>
      </div>

      {/* Tabs — drag to reorder (saved per admin) */}
      <div className="flex gap-1 mb-6 flex-wrap" style={{ borderBottom: "1px solid var(--admin-border)" }}>
        {tabOrder.map((t, i) => {
          if (access && !effectiveCanAccess(access, TAB_PATH[t])) return null; // role can't reach this tab's data
          const count = edition._counts?.[t as keyof typeof edition._counts];
          return (
            <button
              key={t}
              draggable
              onDragStart={() => { dragTab.current = i; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragTab.current != null && dragTab.current !== i) reorderTabs(dragTab.current, i); dragTab.current = null; }}
              onDragEnd={() => { dragTab.current = null; }}
              onClick={() => selectTab(t)}
              title="Drag to reorder"
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] cursor-grab active:cursor-grabbing ${
                tab === t
                  ? "admin-heading border-[var(--admin-accent)]"
                  : "admin-muted border-transparent"
              }`}
            >
              {TAB_LABEL[t]}
              {count != null && count > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-[var(--admin-accent)]/15 text-[#0aa3c7] text-[10px] font-bold">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Details tab ── */}
      {tab === "details" && (
        <div className="max-w-[720px] space-y-5">
          {/* Label, Year & Status */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Label<PublicBadge note="Week name on the public trip page (e.g. Week I)" /></label>
              <input
                className={inputClass}
                value={edition.label || ""}
                onChange={(e) => update("label", e.target.value || null)}
                placeholder="e.g. Week II"
              />
            </div>
            <div>
              <label className={labelClass}>Year</label>
              <input
                type="number"
                className={inputClass}
                value={edition.year}
                onChange={(e) => update("year", Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select
                className={inputClass}
                value={edition.status}
                onChange={(e) => update("status", e.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="published">Active</option>
                <option value="archived">Archived</option>
                <option value="private">Private</option>
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Start date</label>
              <input
                type="date"
                className={inputClass}
                value={edition.date_start || ""}
                onChange={(e) => update("date_start", e.target.value || null)}
              />
            </div>
            <div>
              <label className={labelClass}>End date</label>
              <input
                type="date"
                className={inputClass}
                value={edition.date_end || ""}
                onChange={(e) => update("date_end", e.target.value || null)}
              />
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 rounded-lg p-2 bg-[var(--admin-accent)]/5" style={{ border: "1px solid rgba(10,163,199,0.15)" }}>
              <label className={`${labelClass} flex items-center gap-2`}>
                Price range
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--admin-accent)]/15 text-[#0aa3c7]">From packages</span>
              </label>
              <div className={`${inputClass} opacity-80 flex items-center`} style={{ cursor: "default" }}>
                {priceRange}
              </div>
            </div>
            <div>
              <label className={labelClass}>Deposit ({currency})</label>
              <input
                type="number"
                className={inputClass}
                value={edition.deposit || ""}
                onChange={(e) => update("deposit", e.target.value ? Number(e.target.value) : null)}
              />
            </div>
          </div>
          <p className="text-xs admin-faint -mt-2">
            Price is derived from this edition&apos;s packages — edit prices in the <span className="font-medium admin-muted">Packages</span> tab.
          </p>

          {/* Currency & Slug */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Currency</label>
              <select
                className={inputClass}
                value={edition.currency || "EUR"}
                onChange={(e) => update("currency", e.target.value)}
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Slug</label>
              <input
                className={inputClass}
                value={edition.slug || ""}
                onChange={(e) => update("slug", e.target.value || null)}
                placeholder="auto-generated from experience"
              />
            </div>
          </div>

          {/* Spots */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Max spots</label>
              <input
                type="number"
                className={inputClass}
                value={edition.max_spots || ""}
                onChange={(e) => update("max_spots", e.target.value ? Number(e.target.value) : null)}
              />
            </div>
            <div className="rounded-lg p-2 bg-[var(--admin-accent)]/5" style={{ border: "1px solid rgba(10,163,199,0.15)" }}>
              <label className={`${labelClass} flex items-center gap-2`}>
                Spots taken
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--admin-accent)]/15 text-[#0aa3c7]">Confirmed</span>
              </label>
              <input
                type="number"
                className={`${inputClass} opacity-70 cursor-default`}
                value={edition.confirmed_count}
                readOnly
              />
            </div>
            <div className="rounded-lg p-2 bg-[var(--admin-accent)]/5" style={{ border: "1px solid rgba(10,163,199,0.15)" }}>
              <label className={`${labelClass} flex items-center gap-2`}>
                Spots remaining
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--admin-accent)]/15 text-[#0aa3c7]">Auto</span>
              </label>
              <input
                type="number"
                className={`${inputClass} opacity-70 cursor-default`}
                value={spotsRemaining ?? ""}
                readOnly
              />
            </div>
          </div>

          {/* Operations */}
          {!hiddenSections.has("operations") && (
          <div className="pt-4" style={{ borderTop: "1px solid var(--admin-border)" }}>
            <h3 className="text-xs font-bold tracking-[0.1em] admin-faint uppercase mb-4">Operations</h3>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Coaches<PublicBadge note="Shown on the week card + the first name is the coach on the trip tile" /></label>
                <input
                  className={inputClass}
                  value={edition.coaches || ""}
                  onChange={(e) => update("coaches", e.target.value || null)}
                  placeholder="e.g. Nico, Sarah"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Experience Code</label>
                  <input
                    className={inputClass}
                    value={edition.experience_code || ""}
                    onChange={(e) => update("experience_code", e.target.value || null)}
                    placeholder="e.g. ALC-2026"
                  />
                </div>
                <div>
                  <label className={labelClass}>Payment Page ID</label>
                  <input
                    className={inputClass}
                    value={edition.payment_page_id || ""}
                    onChange={(e) => update("payment_page_id", e.target.value || null)}
                    placeholder="Stripe checkout / payment page"
                  />
                </div>
                <div>
                  <label className={labelClass}>WhatsApp group link</label>
                  <input
                    className={inputClass}
                    value={edition.whatsapp_group_link || ""}
                    onChange={(e) => update("whatsapp_group_link", e.target.value || null)}
                    placeholder="https://chat.whatsapp.com/..."
                  />
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Financials — money-gated: never render for a role without the money grant. */}
          {!hiddenSections.has("financials") && (!access || effectiveCanSeeField(access, "money")) && (
          <div className="pt-4" style={{ borderTop: "1px solid var(--admin-border)" }}>
            <h3 className="text-xs font-bold tracking-[0.1em] admin-faint uppercase mb-4">Financials</h3>

            {/* Computed business case — sell − cost from packages × confirmed heads.
                Overhead is pulled from the Costs tab (estimated/actual) — no manual override. */}
            <div className="mb-4">
              <BusinessCaseCard editionId={id} />
            </div>
            <p className="text-[10px] admin-faint mt-2">Costs come from the Costs tab (estimated &amp; actual). Add fixed costs there as line items.</p>
          </div>
          )}
        </div>
      )}

      {/* ── Branding tab — per-edition hero image ── */}
      {tab === "mailing" && <EditionMailing editionId={id} />}

      {tab === "branding" && (() => {
        const inherited = edition.exp_experiences?.hero_image || null;
        const shown = brandImg || inherited;
        return (
          <div className="max-w-[640px]">
            <h3 className="text-base font-bold admin-heading mb-1">Edition branding</h3>
            <p className="text-xs admin-faint mb-4">The cover for <strong>this edition</strong> in its participants&apos; member area (trip page + trips list), this edition&apos;s emails, and its invite-a-friend page. The <strong>public website keeps the experience&apos;s Main image</strong> (set in Website Content → Media) — this is an optional per-week <strong>override</strong>; leave it to inherit {edition.exp_experiences?.title || "the experience"}&apos;s Main image.</p>
            <div className="p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <label className={labelClass}>Hero image</label>
              <div className="flex items-start gap-4">
                {shown ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shown} alt="" className="h-24 w-40 object-cover rounded-lg shrink-0" style={{ border: "1px solid var(--admin-border)" }} />
                ) : (
                  <div className="h-24 w-40 rounded-lg grid place-items-center text-[10px] admin-faint shrink-0" style={{ border: "1px dashed var(--admin-border)" }}>No hero image</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => setPickingHero(true)} className="px-3 py-1.5 text-xs font-bold rounded-lg admin-surface admin-muted" style={{ border: "1px solid var(--admin-border)" }}>{shown ? "Change image" : "Choose image"}</button>
                    {brandImg && <button onClick={() => setBrandImg("")} className="text-xs admin-faint hover:text-red-400 transition-colors">Clear override</button>}
                  </div>
                  <p className="text-[11px] admin-faint mt-1.5">{brandImg ? "Using this edition's own image." : inherited ? `Inheriting ${edition.exp_experiences?.title || "the experience"}'s hero.` : "No image — emails fall back to the division default."}</p>
                </div>
              </div>

              <div className="mt-4">
                <p className={labelClass}>When I save, apply to</p>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm admin-muted cursor-pointer">
                    <input type="radio" checked={brandScope === "edition"} onChange={() => setBrandScope("edition")} className="accent-[#0aa3c7]" />
                    This edition only
                  </label>
                  <label className="flex items-center gap-2 text-sm admin-muted cursor-pointer">
                    <input type="radio" checked={brandScope === "all"} onChange={() => setBrandScope("all")} className="accent-[#0aa3c7]" />
                    All editions of {edition.exp_experiences?.title || "this experience"} <span className="admin-faint text-xs">— sets the shared hero (also changes the website)</span>
                  </label>
                </div>
              </div>

              <label className="flex items-start gap-2.5 mt-4 p-3 rounded-lg cursor-pointer" style={{ border: "1px solid var(--admin-border)" }}>
                <input type="checkbox" checked={brandInEmails} onChange={(e) => setBrandInEmails(e.target.checked)} className="w-4 h-4 mt-0.5 accent-[#0aa3c7] shrink-0" />
                <span>
                  <span className="block text-sm font-medium admin-heading">Use it in this edition&apos;s emails too</span>
                  <span className="block text-xs admin-faint mt-0.5">When off, this edition&apos;s emails use {edition.exp_experiences?.title || "the experience"}&apos;s hero instead.</span>
                </span>
              </label>

              <div className="mt-4">
                <label className="block text-xs font-medium admin-muted mb-1.5">Pre-trip note for this week <span className="admin-faint font-normal">(optional)</span></label>
                <textarea value={brandNote} onChange={(e) => setBrandNote(e.target.value)} rows={4}
                  placeholder="A personal message just for this week — weather, who's coming, an insider tip. Overrides the experience-level note in the pre-trip emails. Leave blank to use the experience note."
                  className="admin-input w-full px-3 py-2 rounded-lg border text-sm outline-none resize-y" />
                {/* Same reasoning as the packing list below: you can't judge
                    whether to override something you can't see. */}
                <div className="text-[11px] admin-faint mt-1.5 leading-relaxed">
                  {brandNote.trim() ? (
                    <>The pre-trip emails for <b className="admin-muted">this week only</b> use what you type here. The experience&apos;s own note is left untouched — it just isn&apos;t used for this edition.</>
                  ) : inheritedNote ? (
                    <>Blank, so this week uses the <b className="admin-muted">experience pre-trip note</b>:
                      <span className="block mt-1 p-2 rounded admin-surface whitespace-pre-line max-h-24 overflow-y-auto" style={{ border: "1px solid var(--admin-border)" }}>{inheritedNote}</span>
                    </>
                  ) : (
                    <>Blank — and the experience has no note either, so the pre-trip emails simply leave that paragraph out. Optional: nothing is held back for it.</>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-xs font-medium admin-muted mb-1.5">Packing list for this week <span className="admin-faint font-normal">(optional)</span></label>
                <textarea value={brandPacking} onChange={(e) => setBrandPacking(e.target.value)} rows={5}
                  placeholder="One item per line — 5.0 sail, harness, booties, reef shoes…"
                  className="admin-input w-full px-3 py-2 rounded-lg border text-sm outline-none resize-y" />
                {/* You cannot decide whether to write a week-specific list without
                    seeing the one it would replace. So show it. */}
                <div className="text-[11px] admin-faint mt-1.5 leading-relaxed">
                  {brandPacking.trim() ? (
                    <>The pre-trip email for <b className="admin-muted">this week only</b> uses what you type here. The experience&apos;s own list is left untouched — it just isn&apos;t used for this edition.</>
                  ) : inheritedPacking ? (
                    <>Blank, so this week uses the <b className="admin-muted">experience packing list</b>:
                      <span className="block mt-1 p-2 rounded admin-surface whitespace-pre-line max-h-24 overflow-y-auto" style={{ border: "1px solid var(--admin-border)" }}>{inheritedPacking}</span>
                    </>
                  ) : (
                    <span className="text-amber-500">Blank — and the experience has no list either, so the pre-trip email is held back. Write one here for this week, or one on the experience for every year.</span>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <MailReadiness editionId={id} onInherited={(v) => { setInheritedPacking(v.packingList); setInheritedNote(v.preTripNote); }} />
              </div>

              <div className="flex gap-2 mt-4">
                <button onClick={saveBranding} disabled={brandSaving} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-50 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">{brandSaving ? "Saving…" : brandSaved ? "Saved!" : "Save"}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Bookings tab (inline split: rail + booking detail pane) ── */}
      {tab === "bookings" && (
        <div>
          {selBooking ? (
          <div className="flex flex-col md:flex-row gap-4">
            <div className="md:w-56 shrink-0 flex md:flex-col gap-1.5 md:max-h-[72vh] md:overflow-y-auto md:pr-1">
              <button onClick={() => setSelBooking(null)} className="shrink-0 mb-1 flex items-center gap-1.5 text-xs font-semibold admin-muted hover:text-[var(--admin-accent)] transition-colors">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                All bookings
              </button>
              {/* sortedBookings, not bookings — the table above honours the sort
                  you picked, so the list you step through after opening one has
                  to be in that same order or the two views disagree. */}
              {sortedBookings.map((b) => {
                const active = b.id === selBooking;
                return (
                  <button key={b.id} onClick={() => setSelBooking(b.id)} className="shrink-0 text-left px-3 py-2 rounded-lg transition-colors" style={{ background: active ? "var(--admin-accent)" : "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
                    <span className={`block text-xs font-semibold truncate ${active ? "text-[var(--admin-accent-contrast)]" : "admin-heading"}`}>{b.name}</span>
                    <span className={`block text-[10px] mt-0.5 truncate ${active ? "text-[var(--admin-accent-contrast)]/80" : "admin-faint"}`}>{BOOKING_STATUSES[normalizeBookingStatus(b.status)]?.label || b.status}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex-1 min-w-0">
              <BookingDetailPane bookingId={selBooking} onBack={() => { setSelBooking(null); loadBookings(); }} />
            </div>
          </div>
          ) : (<>
          <div className="flex justify-between items-center mb-4">
            <p className="text-xs admin-faint">{bookings.length} booking{bookings.length !== 1 ? "s" : ""} for this edition</p>
            <div className="flex items-center gap-3">
              <Link href={`/admin/bookings?edition_id=${id}`} className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors">View all →</Link>
              <button onClick={() => setBookingShow((v) => !v)} className="px-3 py-1.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors">New Booking</button>
            </div>
          </div>

          {bookingShow && (
            <div className="mb-4 p-4 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <div className="mb-3">
                <label className={labelClass}>Participant *</label>
                <ContactPicker
                  value={bookingForm.contact_id || null}
                  display={bookingContact}
                  allowCreate
                  placeholder="Search or create a contact…"
                  onChange={(cid, c) => { setBookingContact(c); setBookingForm({ ...bookingForm, contact_id: cid || "" }); }}
                />
                {bookingContact && <p className="text-[11px] admin-faint mt-1">Booking name: <span className="admin-muted font-medium">{autoBookingName(bookingContact)}</span></p>}
              </div>
              <div className="grid grid-cols-[140px_110px_1fr] gap-3 mb-3">
                <div><label className={labelClass}>Status</label><select className={inputClass} value={bookingForm.status} onChange={(e) => setBookingForm({ ...bookingForm, status: e.target.value })}>{ADD_BOOKING_STATUSES.map((s) => <option key={s} value={s}>{BOOKING_STATUSES[s]?.label || s}</option>)}</select></div>
                <div><label className={labelClass}>Price ({currency})</label><input type="number" className={inputClass} value={bookingForm.agreed_price} onChange={(e) => setBookingForm({ ...bookingForm, agreed_price: e.target.value })} /></div>
                <div><label className={labelClass}>Package</label><select className={inputClass} value={bookingForm.package_id} onChange={(e) => setBookingForm({ ...bookingForm, package_id: e.target.value })}><option value="">None</option>{packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              </div>
              <div className="flex gap-2">
                <button onClick={addBooking} disabled={!bookingForm.contact_id} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">Create</button>
                <button onClick={() => { setBookingShow(false); setBookingForm(emptyBooking); setBookingContact(null); }} className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {bookings.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm admin-faint">No bookings for this edition</p>
            </div>
          ) : (
            <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[1fr_130px_90px_90px_60px_40px] gap-4 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                {([["name", "Name"], ["status", "Status"], ["fly_in", "Fly In"], ["price", "Price"], ["paid", "Paid"]] as const).map(([key, label]) => (
                  <button key={key} type="button"
                    onClick={() => { if (bkSort === key) setBkDir((d) => (d === "asc" ? "desc" : "asc")); else { setBkSort(key); setBkDir("asc"); } }}
                    className={`text-left text-[10px] font-bold tracking-[0.1em] uppercase transition-colors ${bkSort === key ? "text-[var(--admin-accent)]" : "admin-faint hover:admin-muted"}`}>
                    {label}{bkSort === key ? (bkDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                ))}
                <span></span>
              </div>
              {sortedBookings.map((b) => (
                <div
                  key={b.id}
                  className="grid grid-cols-[1fr_130px_90px_90px_60px_40px] gap-4 px-5 py-3.5 transition-colors group"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <span className="text-sm font-medium admin-heading truncate self-center cursor-pointer" onClick={() => setSelBooking(b.id)}>{b.name}</span>
                  <span className="self-center cursor-pointer" onClick={() => setSelBooking(b.id)}><BookingStatusBadge status={b.status} /></span>
                  <span className="text-xs admin-muted self-center">{formatDate(b.fly_in)}</span>
                  <span className="text-xs admin-muted self-center">
                    {b.agreed_price ? `€${Number(b.agreed_price).toLocaleString()}` : "—"}
                  </span>
                  <span className="self-center">
                    {/* From the payments themselves, not the hand-ticked
                        downpayment/final booleans — those drifted out of sync
                        with the money and could show ½ on a booking that had
                        never paid a cent. */}
                    {b.paid_state === "full" ? (
                      <span className="text-green-400 text-xs font-medium" title={`€${(b.total_paid ?? 0).toLocaleString()} received`}>✓</span>
                    ) : b.paid_state === "part" ? (
                      <span className="text-amber-400 text-xs font-medium" title={`€${(b.total_paid ?? 0).toLocaleString()} received of €${Number(b.agreed_price ?? 0).toLocaleString()}`}>½</span>
                    ) : (
                      <span className="admin-faint text-xs" title={b.total_pending ? `€${b.total_pending.toLocaleString()} expected, nothing received yet` : "nothing received"}>—</span>
                    )}
                  </span>
                  <button onClick={() => deleteBooking(b.id)} className="self-center opacity-0 group-hover:opacity-100 admin-faint hover:text-red-400 transition-all" title="Delete">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          </>)}
        </div>
      )}

      {/* ── Levels tab ── */}
      {tab === "levels" && (
        <div>
          <p className="text-xs admin-faint mb-4">Review each rider&apos;s level after the trip — approve their self-rating in one click, suggest or verify a level, or tick the skills they nailed. Use the bulk row for skills the whole group got.</p>
          <EditionCrewLevels editionId={id} />
        </div>
      )}

      {/* ── Packages tab (inline split: rail + package editor + components) ── */}
      {tab === "packages" && (
        <div>
          {(pkgShow || pkgEditId) ? (
          <div className="flex flex-col md:flex-row gap-4">
            <div className="md:w-56 shrink-0 flex md:flex-col gap-1.5 md:max-h-[72vh] md:overflow-y-auto md:pr-1">
              <button onClick={() => { setPkgShow(false); setPkgEditId(null); setPkgForm(emptyPkg); }} className="shrink-0 mb-1 flex items-center gap-1.5 text-xs font-semibold admin-muted hover:text-[var(--admin-accent)] transition-colors">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                All packages
              </button>
              {packages.map((pkg) => {
                const active = pkg.id === pkgEditId;
                return (
                  <button key={pkg.id} onClick={() => { setPkgEditId(pkg.id); setPkgShow(false); setPkgForm({ name: pkg.name, price: pkg.price?.toString() || "", cost_per_person: pkg.cost_per_person?.toString() || "", deposit: pkg.deposit?.toString() || "", max_spots: pkg.max_spots?.toString() || "", category: pkg.category || "", status: pkg.status, website_visible: pkg.website_visible !== false }); }} className="shrink-0 text-left px-3 py-2 rounded-lg transition-colors" style={{ background: active ? "var(--admin-accent)" : "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
                    <span className={`block text-xs font-semibold truncate ${active ? "text-[var(--admin-accent-contrast)]" : "admin-heading"}`}>{pkg.name}</span>
                    <span className={`block text-[10px] mt-0.5 truncate ${active ? "text-[var(--admin-accent-contrast)]/80" : "admin-faint"}`}>{pkg.price ? `€${Number(pkg.price).toLocaleString()}` : "—"} · {pkg.status}{pkg.website_visible === false ? " · private" : ""}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex-1 min-w-0 space-y-4">
              <div className="p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                <h3 className="text-base font-bold admin-heading mb-4">{pkgEditId ? "Edit package" : "New package"}</h3>
                <div className="mb-3"><label className={labelClass}>Name *</label><input className={inputClass} value={pkgForm.name} onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                  <div><label className={labelClass}>Sell price ({currency})</label><input type="number" className={inputClass} value={pkgForm.price} onChange={(e) => setPkgForm({ ...pkgForm, price: e.target.value })} /></div>
                  <div><label className={labelClass}>Cost / person</label><input type="number" className={inputClass} value={pkgForm.cost_per_person} onChange={(e) => setPkgForm({ ...pkgForm, cost_per_person: e.target.value })} placeholder="auto" /></div>
                  <div><label className={labelClass}>Deposit</label><input type="number" className={inputClass} value={pkgForm.deposit} onChange={(e) => setPkgForm({ ...pkgForm, deposit: e.target.value })} /></div>
                  <div><label className={labelClass}>Spots</label><input type="number" className={inputClass} value={pkgForm.max_spots} onChange={(e) => setPkgForm({ ...pkgForm, max_spots: e.target.value })} /></div>
                  <div className="col-span-2 sm:col-span-1"><label className={labelClass}>Category</label><select className={inputClass} value={pkgForm.category} onChange={(e) => setPkgForm({ ...pkgForm, category: e.target.value })}>{PKG_CATEGORIES.map((c) => <option key={c} value={c}>{c ? c[0].toUpperCase() + c.slice(1) : "None"}</option>)}</select></div>
                </div>
                <label className="flex items-start gap-2.5 mb-4 p-3 rounded-lg cursor-pointer" style={{ border: "1px solid var(--admin-border)" }}>
                  <input type="checkbox" checked={pkgForm.website_visible} onChange={(e) => setPkgForm({ ...pkgForm, website_visible: e.target.checked })} className="w-4 h-4 mt-0.5 accent-[#0aa3c7] shrink-0" />
                  <span>
                    <span className="block text-sm font-medium admin-heading">Show on website</span>
                    <span className="block text-xs admin-faint mt-0.5">Uncheck to sell this package privately — still bookable here, but hidden from the public experience page and gift options.</span>
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <button onClick={savePackage} disabled={!pkgForm.name} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">{pkgEditId ? "Update" : "Create"}</button>
                  <button onClick={() => { setPkgShow(false); setPkgEditId(null); setPkgForm(emptyPkg); }} className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors">Cancel</button>
                </div>
              </div>
              {pkgEditId && (() => {
                const pkg = packages.find((p) => p.id === pkgEditId);
                return (
                  <div className="p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                    <h3 className="text-base font-bold admin-heading mb-4">What&apos;s included</h3>
                    <PackageComponentsEditor
                      packageId={pkgEditId}
                      experienceId={expId}
                      editionId={id}
                                            sellPrice={pkg?.price}
                      onChanged={loadPackages}
                    />
                  </div>
                );
              })()}
            </div>
          </div>
          ) : (<>
          <div className="flex justify-between items-center mb-4">
            <p className="text-xs admin-faint">{packages.length} package{packages.length !== 1 ? "s" : ""} for this edition</p>
            <div className="flex items-center gap-3">
              <Link href={`/admin/packages?edition_id=${id}`} className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors">View all →</Link>
              <div className="relative">
                <button onClick={() => setCopyPkgOpen((v) => !v)} className="px-3 py-1.5 admin-surface admin-muted hover:admin-heading text-xs font-semibold rounded-lg transition-colors" style={{ border: "1px solid var(--admin-border)" }}>Copy from edition…</button>
                {copyPkgOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setCopyPkgOpen(false)} />
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-[300px] max-h-[320px] overflow-y-auto rounded-xl py-1" style={{ border: "1px solid var(--admin-border)", background: "var(--admin-bg)", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
                      <div className="px-3 pb-1.5 mb-1 text-[10px] font-bold tracking-[0.1em] admin-faint uppercase" style={{ borderBottom: "1px solid var(--admin-border)" }}>Copy all packages from</div>
                      {allEditions.filter((e) => e.id !== id).length === 0 ? (
                        <p className="px-3 py-3 text-xs admin-faint">No other editions.</p>
                      ) : allEditions.filter((e) => e.id !== id).map((e) => (
                        <button key={e.id} disabled={copyPkgBusy} onClick={() => copyPackagesFrom(e.id)} className="w-full text-left px-3 py-2 text-sm admin-muted hover:admin-heading hover:bg-[var(--admin-surface-hover)] transition-colors disabled:opacity-50">
                          <span className="block truncate">{e.exp_experiences?.title || "Edition"} — {editionLabel(e)}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button onClick={() => { setPkgEditId(null); setPkgForm(emptyPkg); setPkgShow(true); }} className="px-3 py-1.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors">New Package</button>
            </div>
          </div>

          {packages.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm admin-faint">No packages for this edition</p>
            </div>
          ) : (
            <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[1fr_100px_100px_70px_80px_70px] gap-4 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Name</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Price</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Deposit</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Spots</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Status</span>
                <span></span>
              </div>
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="grid grid-cols-[1fr_100px_100px_70px_80px_70px] gap-4 px-5 py-3.5 transition-colors group"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <div className="min-w-0 self-center cursor-pointer" onClick={() => { setPkgEditId(pkg.id); setPkgShow(false); setPkgForm({ name: pkg.name, price: pkg.price?.toString() || "", cost_per_person: pkg.cost_per_person?.toString() || "", deposit: pkg.deposit?.toString() || "", max_spots: pkg.max_spots?.toString() || "", category: pkg.category || "", status: pkg.status, website_visible: pkg.website_visible !== false }); }}>
                    <div className="text-sm font-medium admin-heading truncate flex items-center gap-1.5">
                      {pkg.name}
                      {pkg.website_visible === false && <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[0.05em] bg-purple-500/15 text-purple-400" title="Private — not shown on the website">Private</span>}
                    </div>
                    {pkg.category && <div className="text-xs admin-faint capitalize">{pkg.category}</div>}
                  </div>
                  <span className="text-xs admin-muted self-center">{pkg.price ? `€${Number(pkg.price).toLocaleString()}` : "—"}</span>
                  <span className="text-xs admin-muted self-center">{pkg.deposit ? `€${Number(pkg.deposit).toLocaleString()}` : "—"}</span>
                  <span className="text-xs admin-muted self-center">{pkg.max_spots ?? "—"}</span>
                  <span className="self-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${pkg.status === "active" ? "bg-green-500/15 text-green-400" : "bg-gray-500/15 text-gray-400"}`}>{pkg.status}</span>
                  </span>
                  <span className="flex items-center gap-2 self-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => duplicatePackage(pkg.id)} className="admin-faint hover:text-[#0aa3c7] transition-colors" title="Duplicate">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                    </button>
                    <button onClick={() => deletePackage(pkg.id)} className="admin-faint hover:text-red-400 transition-colors" title="Delete">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
          </>)}
        </div>
      )}

      {/* ── Memories tab ── */}
      {tab === "memories" && (
        <EditionMemoriesUploader editionId={id} initialVideoUrl={edition.memories_video_url} />
      )}

      {/* ── Costs tab ── */}
      {tab === "costs" && (
        <div>
          {/* Real P&L: received payments − allocated costs for THIS edition */}
          {pnl && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <div className="rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                <div className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase mb-1">Received</div>
                <div className="text-xl font-bold text-green-400">{eur(pnl.received, currency)}</div>
                {pnl.expected !== pnl.received && <div className="text-[10px] admin-faint mt-0.5">{eur(pnl.expected, currency)} incl. unpaid</div>}
              </div>
              <div className="rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                <div className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase mb-1">Costs</div>
                <div className="text-xl font-bold text-red-400">{eur(pnl.costs, currency)}</div>
                <div className="text-[10px] admin-faint mt-0.5">incl. allocated splits</div>
              </div>
              <div className="rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                <div className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase mb-1">Net (real)</div>
                <div className={`text-xl font-bold ${pnl.net < 0 ? "text-red-400" : "text-green-400"}`}>{eur(pnl.net, currency)}</div>
                {pnl.received > 0 && <div className="text-[10px] admin-faint mt-0.5">{Math.round((pnl.net / pnl.received) * 100)}% margin</div>}
              </div>
              <div className="rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                <div className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase mb-1">Bookings</div>
                <div className="text-xl font-bold admin-heading">{pnl.bookings}</div>
                <div className="text-[10px] admin-faint mt-0.5">with payments counted</div>
              </div>
            </div>
          )}

          {/* Projected per-participant cost — auto-rolled from signed-up packages' components × cost price */}
          {pnl?.componentEstimate && pnl.componentEstimate.total > 0 && (
            <div className="rounded-xl admin-tablecard mb-5" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="flex items-center justify-between px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="text-[11px] font-bold tracking-[0.1em] admin-faint uppercase">Projected component cost · {pnl.componentEstimate.bookings} signed up</span>
                <span className="text-sm font-bold text-amber-400">{eur(pnl.componentEstimate.total, currency)}</span>
              </div>
              {pnl.componentEstimate.breakdown.map((c) => (
                <div key={c.name} className="flex items-center justify-between gap-3 px-5 py-2 text-[13px]" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                  <span className="admin-heading truncate">{c.name}</span>
                  <span className="admin-faint shrink-0">{c.qty} × {eur(c.unitCost, currency)} = <span className="admin-muted font-medium">{eur(c.total, currency)}</span></span>
                </div>
              ))}
              <p className="px-5 py-2 text-[11px] admin-faint">Auto-rolled from each signed-up package&apos;s components × cost price. Add fixed costs (venue, transfers…) as cost lines below.</p>
            </div>
          )}

          <div className="flex justify-between items-center mb-4">
            <p className="text-xs admin-faint">{costs.length} cost item{costs.length !== 1 ? "s" : ""} for this edition</p>
            <div className="flex items-center gap-3">
              <Link href={`/admin/exp-costs?edition_id=${id}`} className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors">View all →</Link>
              <button onClick={() => { setCostEditId(null); setCostForm(emptyCost); setCostShow(true); }} className="px-3 py-1.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors">New Cost</button>
            </div>
          </div>

          {(costShow || costEditId) && (
            <div className="mb-4 p-4 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <h3 className="text-sm font-bold admin-heading mb-3">{costEditId ? "Edit Cost" : "New Cost"}</h3>
              <div className="grid grid-cols-[1fr_120px_120px_140px_130px] gap-3 mb-3">
                <div><label className={labelClass}>Item *</label><input className={inputClass} value={costForm.item} onChange={(e) => setCostForm({ ...costForm, item: e.target.value })} /></div>
                <div><label className={labelClass}>Estimated ({currency})</label><input type="number" className={inputClass} value={costForm.estimated_amount} onChange={(e) => setCostForm({ ...costForm, estimated_amount: e.target.value })} /></div>
                <div><label className={labelClass}>Actual ({currency})</label><input type="number" className={inputClass} value={costForm.actual_amount} onChange={(e) => setCostForm({ ...costForm, actual_amount: e.target.value })} /></div>
                <div><label className={labelClass}>Date</label><input type="date" className={inputClass} value={costForm.date} onChange={(e) => setCostForm({ ...costForm, date: e.target.value })} /></div>
                <div><label className={labelClass}>Status</label><select className={inputClass} value={costForm.status} onChange={(e) => setCostForm({ ...costForm, status: e.target.value })}>{COST_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveCost} disabled={!costForm.item} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">{costEditId ? "Update" : "Create"}</button>
                <button onClick={() => { setCostShow(false); setCostEditId(null); setCostForm(emptyCost); }} className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {costs.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm admin-faint">No costs for this edition</p>
            </div>
          ) : (
            <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[1fr_110px_110px_90px_90px_40px] gap-4 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Item</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Estimated</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Actual</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Date</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Status</span>
                <span></span>
              </div>
              {costs.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-[1fr_110px_110px_90px_90px_40px] gap-4 px-5 py-3.5 transition-colors group"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <span className="text-sm admin-heading truncate self-center cursor-pointer" onClick={() => { setCostEditId(c.id); setCostShow(false); setCostForm({ item: c.item, estimated_amount: c.estimated_amount?.toString() || "", actual_amount: c.actual_amount?.toString() || "", date: c.date || "", status: c.status }); }}>{c.item}</span>
                  <span className="text-xs admin-muted self-center">{c.estimated_amount ? `€${Number(c.estimated_amount).toLocaleString()}` : "—"}</span>
                  <span className="text-xs admin-muted self-center">{c.actual_amount ? `€${Number(c.actual_amount).toLocaleString()}` : "—"}</span>
                  <span className="text-xs admin-faint self-center">{formatDate(c.date)}</span>
                  <span className="self-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      c.status === "confirmed" ? "bg-green-500/15 text-green-400" :
                      c.status === "estimate" ? "bg-amber-500/15 text-amber-400" :
                      c.status === "cancelled" ? "bg-red-500/15 text-red-400" :
                      "admin-surface admin-muted"
                    }`}>{c.status}</span>
                  </span>
                  <button onClick={() => deleteCost(c.id)} className="self-center opacity-0 group-hover:opacity-100 admin-faint hover:text-red-400 transition-all" title="Delete">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Rooms tab (inline split: rail + room editor) ── */}
      {tab === "rooms" && (
        <div>
          {(roomShow || roomEditId) ? (
          <div className="flex flex-col md:flex-row gap-4">
            <div className="md:w-56 shrink-0 flex md:flex-col gap-1.5 md:max-h-[72vh] md:overflow-y-auto md:pr-1">
              <button onClick={() => { setRoomShow(false); setRoomEditId(null); setRoomForm(emptyRoom); }} className="shrink-0 mb-1 flex items-center gap-1.5 text-xs font-semibold admin-muted hover:text-[var(--admin-accent)] transition-colors">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                All rooms
              </button>
              {rooms.map((room) => {
                const active = room.id === roomEditId;
                return (
                  <button key={room.id} onClick={() => { setRoomEditId(room.id); setRoomShow(false); setRoomForm({ name: room.name, hotel: room.hotel || "", room_type: room.room_type || "", room_number: room.room_number || "", status: room.status, booking_id: room.booking_id || "", extra_booking_ids: room.extra_booking_ids ?? [], partner_tag_along: room.partner_tag_along ?? "" }); }} className="shrink-0 text-left px-3 py-2 rounded-lg transition-colors" style={{ background: active ? "var(--admin-accent)" : "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
                    <span className={`block text-xs font-semibold truncate ${active ? "text-[var(--admin-accent-contrast)]" : "admin-heading"}`}>{room.name}</span>
                    {(() => {
                      const extra = (room.extra_booking_ids?.length ?? 0) + (room.partner_tag_along ? 1 : 0);
                      return (
                        <span className={`block text-[10px] mt-0.5 truncate ${active ? "text-[var(--admin-accent-contrast)]/80" : "admin-faint"}`}>{room.status}{room.booking?.name ? ` · ${room.booking.name}` : ""}{extra > 0 ? ` +${extra} sharing` : ""}</span>
                      );
                    })()}
                  </button>
                );
              })}
            </div>
            <div className="flex-1 min-w-0">
              <div className="p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                <h3 className="text-base font-bold admin-heading mb-4">{roomEditId ? "Edit room" : "New room"}</h3>
                <div className="mb-3"><label className={labelClass}>Name *</label><input className={inputClass} value={roomForm.name} onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                  <div><label className={labelClass}>Hotel</label><select className={inputClass} value={roomForm.hotel} onChange={(e) => setRoomForm({ ...roomForm, hotel: e.target.value })}><option value="">—</option>{HOTELS.map((h) => <option key={h} value={h}>{h}</option>)}</select></div>
                  <div><label className={labelClass}>Room #</label><input className={inputClass} value={roomForm.room_number} onChange={(e) => setRoomForm({ ...roomForm, room_number: e.target.value })} /></div>
                  <div><label className={labelClass}>Status</label><select className={inputClass} value={roomForm.status} onChange={(e) => setRoomForm({ ...roomForm, status: e.target.value })}>{ROOM_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <div><label className={labelClass}>Room type</label><input className={inputClass} value={roomForm.room_type} onChange={(e) => setRoomForm({ ...roomForm, room_type: e.target.value })} placeholder="e.g. BON-WAN-Double Deluxe Balcony" /></div>
                  <div><label className={labelClass}>Guest (booking) <span className="admin-faint font-normal">· main</span></label><select className={inputClass} value={roomForm.booking_id} onChange={(e) => setRoomForm({ ...roomForm, booking_id: e.target.value })}><option value="">Unassigned</option>{bookings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                </div>
                {/* Sharing: additional participants in the SAME room who have their
                    own booking but no room of their own (e.g. a partner who books
                    as a beginner without a hotel). */}
                <div className="mb-4">
                  <label className={labelClass}>Also in this room <span className="admin-faint font-normal">· sharing, no own room</span></label>
                  {roomForm.extra_booking_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {roomForm.extra_booking_ids.map((bid) => (
                        <span key={bid} className="inline-flex items-center gap-1.5 text-[12px] font-semibold admin-heading rounded-full pl-2.5 pr-1.5 py-1" style={{ background: "var(--admin-bg)", border: "1px solid var(--admin-border)" }}>
                          {bookings.find((b) => b.id === bid)?.name ?? "Guest"}
                          <button type="button" onClick={() => setRoomForm({ ...roomForm, extra_booking_ids: roomForm.extra_booking_ids.filter((x) => x !== bid) })} className="w-4 h-4 grid place-items-center rounded-full text-red-400 hover:bg-red-500/10">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <select className={inputClass} value="" onChange={(e) => { const v = e.target.value; if (v) setRoomForm({ ...roomForm, extra_booking_ids: [...new Set([...roomForm.extra_booking_ids, v])] }); }}>
                    <option value="">+ Add a guest sharing this room…</option>
                    {bookings.filter((b) => b.id !== roomForm.booking_id && !roomForm.extra_booking_ids.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="mb-4">
                  <label className={labelClass}>Partner tagging along <span className="admin-faint font-normal">· no booking at all</span></label>
                  <input className={inputClass} value={roomForm.partner_tag_along} onChange={(e) => setRoomForm({ ...roomForm, partner_tag_along: e.target.value })} placeholder="e.g. Anna (guest's partner, not a participant)" />
                </div>
                <div className="flex gap-2">
                  <button onClick={saveRoom} disabled={!roomForm.name} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">{roomEditId ? "Update" : "Create"}</button>
                  <button onClick={() => { setRoomShow(false); setRoomEditId(null); setRoomForm(emptyRoom); }} className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors">Cancel</button>
                  {roomEditId && <button onClick={() => { deleteRoom(roomEditId); setRoomEditId(null); setRoomForm(emptyRoom); }} className="ml-auto px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">Delete</button>}
                </div>
              </div>
            </div>
          </div>
          ) : (<>
          <div className="flex justify-between items-center mb-4">
            <p className="text-xs admin-faint">{rooms.length} room{rooms.length !== 1 ? "s" : ""} for this edition</p>
            <div className="flex items-center gap-3">
              <Link href={`/admin/hotel-rooms?edition_id=${id}`} className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors">View all →</Link>
              <button onClick={() => { setRoomEditId(null); setRoomForm(emptyRoom); setRoomShow(true); }} className="px-3 py-1.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors">New Room</button>
            </div>
          </div>

          {rooms.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm admin-faint">No hotel rooms for this edition</p>
            </div>
          ) : (
            <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[1fr_120px_110px_80px_110px_40px] gap-4 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Room</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Type</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Hotel</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Status</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Guest</span>
                <span></span>
              </div>
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="grid grid-cols-[1fr_120px_110px_80px_110px_40px] gap-4 px-5 py-3.5 transition-colors group"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <span className="text-sm font-medium admin-heading truncate self-center cursor-pointer" onClick={() => { setRoomEditId(room.id); setRoomShow(false); setRoomForm({ name: room.name, hotel: room.hotel || "", room_type: room.room_type || "", room_number: room.room_number || "", status: room.status, booking_id: room.booking_id || "", extra_booking_ids: room.extra_booking_ids ?? [], partner_tag_along: room.partner_tag_along ?? "" }); }}>{room.name}</span>
                  <span className="text-xs admin-muted self-center truncate">{room.room_type}</span>
                  <span className="text-xs admin-muted self-center">{room.hotel}</span>
                  <span className="self-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      room.status === "assigned" ? "bg-blue-500/15 text-blue-400" :
                      room.status === "held" ? "bg-amber-500/15 text-amber-400" :
                      "bg-green-500/15 text-green-400"
                    }`}>{room.status}</span>
                  </span>
                  <span className="text-xs admin-muted self-center truncate">{room.booking?.name || "—"}</span>
                  <button onClick={() => deleteRoom(room.id)} className="self-center opacity-0 group-hover:opacity-100 admin-faint hover:text-red-400 transition-all" title="Delete">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          </>)}
        </div>
      )}

      {/* ── Notes tab ── */}
      {tab === "notes" && (
        <div className="max-w-[720px]">
          <div className="mb-4">
            <textarea
              className={`${inputClass} min-h-[80px] resize-y`}
              placeholder="Add a note… (date and your name are stamped automatically)"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
            />
            <div className="flex justify-end mt-2">
              <button onClick={addNote} disabled={!newNote.trim()} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">Add note</button>
            </div>
          </div>

          {notes.length === 0 ? (
            <div className="text-center py-12 text-sm admin-faint">No notes yet.</div>
          ) : (
            <div className="space-y-3">
              {notes.map((n) => (
                <div key={n.id} className="rounded-xl p-4 group" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium admin-heading">{n.author}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] admin-faint">{new Date(n.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      <button onClick={() => deleteNote(n.id)} className="opacity-0 group-hover:opacity-100 admin-faint hover:text-red-400 transition-all" title="Delete">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                  <p className="text-sm admin-muted whitespace-pre-line">{n.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {pickingHero && (
        <ImagePickerModal
          defaultFolder="experiences"
          onSelect={(url) => { setBrandImg(url); setPickingHero(false); }}
          onClose={() => setPickingHero(false)}
        />
      )}

      {dupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setDupOpen(false); }}>
          <div className="w-full max-w-[440px] rounded-2xl p-6" style={{ backgroundColor: "var(--admin-sidebar)", border: "1px solid var(--admin-border)" }}>
            <h2 className="text-lg font-bold admin-heading mb-1">Duplicate edition</h2>
            <p className="text-xs admin-faint mb-4">Copies packages, component links and the cost structure — not bookings, payments or room assignments.</p>
            <div className="space-y-3 mb-5">
              <label className="flex items-center gap-2 text-sm admin-muted cursor-pointer">
                <input type="radio" checked={dupTarget === "existing"} onChange={() => setDupTarget("existing")} className="accent-[#0aa3c7]" />
                Into an existing experience
              </label>
              {dupTarget === "existing" && (
                <select className="w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] ml-6 max-w-[calc(100%-1.5rem)]" value={dupExpId} onChange={(e) => setDupExpId(e.target.value)}>
                  {dupExperiences.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                </select>
              )}
              <label className="flex items-center gap-2 text-sm admin-muted cursor-pointer">
                <input type="radio" checked={dupTarget === "new"} onChange={() => setDupTarget("new")} className="accent-[#0aa3c7]" />
                Into a new experience <span className="admin-faint">(copies the template too)</span>
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={duplicateEdition} disabled={duplicating || (dupTarget === "existing" && !dupExpId)} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
                {duplicating ? "Duplicating…" : "Duplicate"}
              </button>
              <button onClick={() => setDupOpen(false)} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
