/**
 * The invite sign-up (/join/[token]) asks where the friend lives, the same way
 * the reserve modal does (review follow-up, 28 Sep 2026).
 *
 * Which ways to pay online a guest is offered depends on their country. The
 * reserve modal started asking on 27 Sep, but a friend joining through an
 * invite link landed on the same trip page with no country and no way to pay
 * online until they found the billing address box.
 *
 * Pinned here: the form refuses to send without a country when it asked for
 * one, the country travels to /api/register only when asked and answered,
 * the geo pre-selection only ever picks a name the list offers, and every
 * such name is one the server keeps (lib/signup-country).
 */
import { describe, it, expect } from "vitest";
import { joinFormError, joinRegisterBody, geoCountryName } from "@/components/join/join-signup";
import { countryOptions } from "@/lib/countries";
import { signupCountryName, countryToFill } from "@/lib/signup-country";

const filled = { name: "Mia Keller", email: "mia@example.com", packageId: "pkg-standard", askCountry: true, country: "Netherlands" };

describe("joinFormError", () => {
  it("lets a complete form through", () => {
    expect(joinFormError(filled)).toBe("");
  });

  it("asks for the country when the list was offered and nothing is chosen", () => {
    expect(joinFormError({ ...filled, country: "" })).toBe("Please choose the country you live in.");
  });

  it("does not ask when no list was offered", () => {
    expect(joinFormError({ ...filled, askCountry: false, country: "" })).toBe("");
  });

  it("names the first problem, in the order the fields appear", () => {
    expect(joinFormError({ ...filled, name: " ", country: "" })).toBe("Please enter your name.");
    expect(joinFormError({ ...filled, email: "mia@", country: "" })).toBe("Please enter a valid email address.");
    // A trip that cannot be joined says so before asking for a country.
    expect(joinFormError({ ...filled, packageId: null, country: "" })).toBe("This trip isn't open for signup right now.");
  });
});

describe("joinRegisterBody", () => {
  const base = {
    experienceId: "exp-bonaire", editionId: "ed-week-3", packageId: "pkg-standard",
    name: "  Mia  van Keller ", email: " mia@example.com ", marketingOptIn: true,
    inviteToken: "nico-3f9a2b", intent: "reserve" as const, askCountry: true, country: "Netherlands",
  };

  it("sends the country with the invite token, as /api/register reads them", () => {
    expect(joinRegisterBody(base)).toEqual({
      experienceId: "exp-bonaire", editionId: "ed-week-3", packageId: "pkg-standard",
      firstName: "Mia", lastName: "van Keller",
      email: "mia@example.com", marketingOptIn: true, inviteToken: "nico-3f9a2b", intent: "reserve",
      country: "Netherlands",
    });
  });

  it("leaves the field out when the question was not asked or not answered", () => {
    expect(joinRegisterBody({ ...base, askCountry: false })).not.toHaveProperty("country");
    expect(joinRegisterBody({ ...base, country: "" })).not.toHaveProperty("country");
  });

  it("sends it for a details-first request too, which also makes a contact", () => {
    expect(joinRegisterBody({ ...base, intent: "info" })).toMatchObject({ intent: "info", country: "Netherlands" });
  });
});

describe("geo pre-selection", () => {
  const list = countryOptions();

  it("picks the list's own name for the edge's code", () => {
    expect(geoCountryName(list, "NL")).toBe("Netherlands");
    expect(geoCountryName(list, "DE")).toBe("Germany");
  });

  it("picks nothing for no answer, junk, or no list", () => {
    expect(geoCountryName(list, null)).toBeNull();
    expect(geoCountryName(list, "")).toBeNull();
    expect(geoCountryName(list, "T1")).toBeNull();
    expect(geoCountryName(list, 42)).toBeNull();
    expect(geoCountryName(undefined, "NL")).toBeNull();
  });

  it("every name the dropdown can send is one the server stores, and only into an empty field", () => {
    for (const c of list) expect(signupCountryName(c.name), c.code).toBe(c.name);
    expect(countryToFill(null, geoCountryName(list, "NL"))).toBe("Netherlands");
    expect(countryToFill("Germany", geoCountryName(list, "NL"))).toBeNull();
  });
});
