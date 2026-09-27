/**
 * The country question at trip sign-up (Nico, 27 Sep 2026: "yes").
 *
 * About one guest in four signed up with a name and an email and nothing
 * else, so guestCountry had nothing to read and their trip page could offer no
 * way to pay online. Sign-up now asks "Country you live in", pre-selected from
 * /api/geo, and /api/register fills contacts.country with it.
 *
 * Three rules make that safe, and they are what is pinned here:
 *  1. The geo answer is a real country code or nothing, from Vercel's header
 *     only, and never cached.
 *  2. What is stored is always the dropdown's own English name, so it reads
 *     back in guestCountry and switches paying online on.
 *  3. It only ever FILLS an empty field. /api/register knows a guest by a typed
 *     email, so a sign-up must never change what somebody already told us.
 */
import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import { FakeSupabase } from "./stubs/fake-supabase";
import { countryOptions } from "@/lib/countries";
import { guestCountry, onlineMethodsFor, canPayOnline } from "@/lib/payment-methods";
import { edgeCountry, signupCountryName, countryToFill, fillContactCountry } from "@/lib/signup-country";
import { GET as geo } from "@/app/api/geo/route";

const headers = (h: Record<string, string>) => new Headers(h);

describe("edgeCountry", () => {
  it("reads Vercel's country header as an ISO code", () => {
    expect(edgeCountry(headers({ "x-vercel-ip-country": "NL" }))).toBe("NL");
    expect(edgeCountry(headers({ "x-vercel-ip-country": " de " }))).toBe("DE");
  });

  it("is null for no header, junk, or a code that is not a country", () => {
    expect(edgeCountry(headers({}))).toBeNull();
    expect(edgeCountry(headers({ "x-vercel-ip-country": "" }))).toBeNull();
    expect(edgeCountry(headers({ "x-vercel-ip-country": "XX" }))).toBeNull();
    expect(edgeCountry(headers({ "x-vercel-ip-country": "T1" }))).toBeNull();
    expect(edgeCountry(headers({ "x-vercel-ip-country": "EU" }))).toBeNull();
    expect(edgeCountry(headers({ "x-vercel-ip-country": "Netherlands" }))).toBeNull();
  });

  it("never looks at anything but that one header", () => {
    expect(edgeCountry(headers({ "x-forwarded-for": "203.0.113.7", "cf-ipcountry": "FR" }))).toBeNull();
  });
});

describe("GET /api/geo", () => {
  const ask = async (h: Record<string, string>) => {
    const res = geo({ headers: headers(h) } as unknown as NextRequest);
    return { res, body: await res.json() };
  };

  it("answers the visitor's country and nothing else", async () => {
    const { body } = await ask({ "x-vercel-ip-country": "BE", "x-forwarded-for": "203.0.113.7" });
    expect(body).toEqual({ country: "BE" });
  });

  it("answers null when the edge cannot say, as on localhost", async () => {
    expect((await ask({})).body).toEqual({ country: null });
  });

  it("is never cached, because the answer belongs to one visitor", async () => {
    const { res } = await ask({ "x-vercel-ip-country": "BE" });
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("cache-control")).toContain("private");
  });
});

describe("signupCountryName", () => {
  it("keeps a name the dropdown offers, exactly as it offers it", () => {
    expect(signupCountryName("Netherlands")).toBe("Netherlands");
    expect(signupCountryName("  netherlands ")).toBe("Netherlands");
    expect(signupCountryName("Curaçao")).toBe("Curaçao");
  });

  it("turns a two-letter code into the dropdown's name", () => {
    const nl = countryOptions().find((c) => c.code === "NL")!.name;
    expect(signupCountryName("NL")).toBe(nl);
    expect(signupCountryName("nl")).toBe(nl);
  });

  it("drops anything it cannot place rather than store free text", () => {
    for (const junk of ["", "   ", "Atlantis", "UK", "XX", "Minnesota, USA", "a".repeat(200)]) {
      expect(signupCountryName(junk), junk).toBeNull();
    }
    expect(signupCountryName(null)).toBeNull();
    expect(signupCountryName(42)).toBeNull();
    expect(signupCountryName({ name: "Germany" })).toBeNull();
  });

  it("every name it can store switches paying online on", () => {
    const prev = process.env.STRIPE_BANK_TRANSFER_ENABLED;
    process.env.STRIPE_BANK_TRANSFER_ENABLED = "true";
    try {
      for (const { code, name } of countryOptions()) {
        const stored = signupCountryName(code)!;
        expect(stored, code).toBe(name);
        expect(guestCountry({ country: stored }), name).toBe(code);
        expect(canPayOnline(onlineMethodsFor(guestCountry({ country: stored }))), name).toBe(true);
      }
    } finally {
      process.env.STRIPE_BANK_TRANSFER_ENABLED = prev;
    }
  });
});

describe("countryToFill: only into an empty field", () => {
  it("fills a contact with no country", () => {
    expect(countryToFill(null, "Germany")).toBe("Germany");
    expect(countryToFill(undefined, "DE")).toBe("Germany");
    expect(countryToFill("", "Germany")).toBe("Germany");
    expect(countryToFill("   ", "Germany")).toBe("Germany");
  });

  it("never overwrites a country that is there, even one we cannot read", () => {
    expect(countryToFill("Netherlands", "Germany")).toBeNull();
    expect(countryToFill("Minnesota, USA", "Germany")).toBeNull();
    expect(countryToFill("Germany", "Germany")).toBeNull();
  });

  it("writes nothing when the submission is not a country", () => {
    expect(countryToFill(null, "")).toBeNull();
    expect(countryToFill(null, "Atlantis")).toBeNull();
    expect(countryToFill(null, undefined)).toBeNull();
  });
});

describe("fillContactCountry against the contact row", () => {
  const db = () => new FakeSupabase({
    contacts: [
      { id: "c-new", country: null },
      { id: "c-blank", country: "" },
      { id: "c-dutch", country: "Netherlands" },
    ],
  });
  const countryOf = (fake: FakeSupabase, id: string) => fake.rows("contacts").find((r) => r.id === id)?.country;

  it("fills a null or blank country", async () => {
    const fake = db();
    expect(await fillContactCountry(fake, "c-new", "Belgium")).toBe(true);
    expect(await fillContactCountry(fake, "c-blank", "BE")).toBe(true);
    expect(countryOf(fake, "c-new")).toBe("Belgium");
    expect(countryOf(fake, "c-blank")).toBe("Belgium");
  });

  it("leaves a country that is already there alone", async () => {
    const fake = db();
    expect(await fillContactCountry(fake, "c-dutch", "Germany")).toBe(false);
    expect(countryOf(fake, "c-dutch")).toBe("Netherlands");
  });

  it("does nothing for no contact, no country or junk", async () => {
    const fake = db();
    expect(await fillContactCountry(fake, undefined, "Germany")).toBe(false);
    expect(await fillContactCountry(fake, "c-new", undefined)).toBe(false);
    expect(await fillContactCountry(fake, "c-new", "Atlantis")).toBe(false);
    expect(countryOf(fake, "c-new")).toBeNull();
  });

  it("never throws into the registration when the database is down", async () => {
    const fake = db();
    fake.failOn("contacts", "select");
    expect(await fillContactCountry(fake, "c-new", "Germany")).toBe(false);
    const fake2 = db();
    fake2.failOn("contacts", "update");
    expect(await fillContactCountry(fake2, "c-new", "Germany")).toBe(false);
  });
});
