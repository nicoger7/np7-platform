/**
 * The "your coach signed off new skills" mail used to send a number and
 * nothing else — and the number was the rider's LIFETIME coach-verified count,
 * so a trip where one skill was signed off read as twenty-eight, and the rider
 * was never told which ones (Nico, 21 Sep 2026: "can we make it that the email
 * writes the updated skills?").
 *
 * These lock the two halves of the fix: the skills are named, and they survive
 * an admin-edited body too.
 */
import { describe, it, expect } from "vitest";
import { renderTemplate } from "@/lib/email/templates";
import { DEFAULT_BODIES } from "@/lib/email/default-bodies";

const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim();

const VARS = {
  firstName: "Michael",
  skillCount: "4",
  experienceTitle: "NP7 Experience Alaçatı",
  skillList: "Fast tack\nWaterstart\n20kn control\nDuck jibe",
  levelLabel: "Advanced",
  portalLink: "https://www.np-seven.com/account/level",
};

describe("skills_verified names the skills", () => {
  it("lists every verified skill in the body", () => {
    const { html } = renderTemplate("skills_verified", VARS);
    const body = text(html);
    for (const skill of ["Fast tack", "Waterstart", "20kn control", "Duck jibe"]) {
      expect(body).toContain(skill);
    }
    // one list item per skill, not one run-on line
    expect((html.match(/<li/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("still reads correctly when no list is passed", () => {
    const { html } = renderTemplate("skills_verified", { ...VARS, skillList: undefined });
    expect(text(html)).toContain("4 skills");
    expect(html).not.toContain("<li");
  });

  it("keeps the skills in an admin-edited body", () => {
    // The DB override path interpolates {{skillList}} rather than calling the
    // code template, so the marker has to be in the editable default too.
    expect(DEFAULT_BODIES.skills_verified).toContain("{{skillList}}");
    expect(DEFAULT_BODIES.skills_verified).toContain("{{?skillList}}");
  });
});
