import { describe, expect, it } from "vitest";
import { effectiveCanAccess, effectiveCanWrite, type EffectiveAccess, type RoleAccess } from "@/lib/access";

/**
 * The personal tools (hours log, to-dos, Academy) belong to the environments
 * they sit in. Nico, 24.09.2026, giving Enrico Product Dev only: "if he really
 * only gets product development environment he shouldn't see any of that".
 */

const role = (worlds: RoleAccess["worlds"], sections: RoleAccess["sections"] = {}): EffectiveAccess =>
  ({ kind: "role", access: { worlds, sections, fields: {} } });
const productDevOnly = role(["product-dev"], { pd_knowledge: "edit", pd_library: "edit", pd_boards: "edit" });

describe("personal tools follow their environment", () => {
  it("Product Dev only: no hours log, to-dos or Academy, by page or by API", () => {
    for (const p of ["/admin/hours-log", "/api/admin/hours-log", "/admin/todos", "/api/admin/todos", "/admin/learning", "/admin/learning/some-lesson", "/api/admin/learning/read", "/api/admin/learning/progress"]) {
      expect(effectiveCanAccess(productDevOnly, p), p).toBe(false);
      expect(effectiveCanWrite(productDevOnly, p), p).toBe(false);
    }
    expect(effectiveCanAccess(productDevOnly, "/admin/product-dev/boards")).toBe(true);
  });

  it("the login page and the activity ping stay open to everyone", () => {
    expect(effectiveCanAccess(productDevOnly, "/admin/login")).toBe(true);
    expect(effectiveCanAccess(productDevOnly, "/api/admin/active-time")).toBe(true);
  });

  it("Experience members keep all three; Knowledge keeps the Academy only", () => {
    const exp = role(["experience"]);
    for (const p of ["/admin/hours-log", "/admin/todos", "/admin/learning", "/api/admin/learning/progress"]) expect(effectiveCanAccess(exp, p), p).toBe(true);
    const knowledge = role(["knowledge"]);
    expect(effectiveCanAccess(knowledge, "/admin/learning")).toBe(true);
    expect(effectiveCanAccess(knowledge, "/admin/hours-log")).toBe(false);
  });

  it("owner and manager tiers are unchanged", () => {
    for (const level of ["owner", "manager"] as const) {
      const tier: EffectiveAccess = { kind: "tier", level };
      for (const p of ["/admin/hours-log", "/admin/todos", "/admin/learning"]) expect(effectiveCanAccess(tier, p), `${level} ${p}`).toBe(true);
    }
  });
});
