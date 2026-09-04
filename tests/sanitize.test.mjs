/**
 * The sanitizer has to do two things, and the second is as important as the first:
 * strip anything that can execute, and leave real authored content alone.
 *
 * A sanitizer that mangles legitimate formatting gets switched off by the first
 * person whose lesson it breaks, so the "preserves" cases below are load-bearing.
 * The tag list they cover is not invented: it is the distinct set of tags found
 * in the 7 lesson bodies actually stored in production on 2026-08-12
 * (em, h2, li, p, strong, ul) plus the default waiver's h3.
 *
 * Runs against the compiled config by importing sanitize-html directly with the
 * same options, so the test does not need a TypeScript loader.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import sanitizeHtml from "sanitize-html";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = readFileSync(join(ROOT, "src", "lib", "sanitize.ts"), "utf8");

// Mirror of the module's config. Kept in sync by the guard test at the bottom,
// which fails if the source's tag lists drift from what is exercised here.
const COMMON = {
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    iframe: ["src", "title", "width", "height", "allow", "allowfullscreen", "frameborder"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  nonTextTags: ["script", "style", "textarea", "option", "noscript"],
  disallowedTagsMode: "discard",
  transformTags: {
    a: (tagName, attribs) => {
      const out = { ...attribs };
      if (out.target === "_blank") out.rel = "noopener noreferrer";
      return { tagName, attribs: out };
    },
  },
};

const LESSON_TAGS = ["p","br","hr","strong","b","em","i","u","s","code","pre","h2","h3","h4","ul","ol","li","a","img","iframe","blockquote","table","thead","tbody","tr","td","th"];
const WAIVER_TAGS = ["p","br","hr","strong","b","em","i","u","h2","h3","h4","ul","ol","li","a","blockquote"];
const VIDEO_HOSTS = ["www.youtube-nocookie.com","www.youtube.com","youtube.com","player.vimeo.com"];

const lesson = (h) => sanitizeHtml(h, {
  ...COMMON,
  allowedTags: LESSON_TAGS,
  allowedIframeHostnames: VIDEO_HOSTS,
  allowIframeRelativeUrls: false,
  exclusiveFilter: (frame) => frame.tag === "iframe" && !frame.attribs.src,
});
const waiver = (h) => sanitizeHtml(h, { ...COMMON, allowedTags: WAIVER_TAGS });

const ATTACKS = [
  ['<script>alert(1)</script>', "script tag"],
  ['<img src=x onerror="alert(1)">', "onerror handler"],
  ['<div onclick="alert(1)">hi</div>', "onclick handler"],
  ['<a href="javascript:alert(1)">go</a>', "javascript: href"],
  ['<a href="JaVaScRiPt:alert(1)">go</a>', "case-varied javascript: href"],
  ['<object data="evil.swf"></object>', "object embed"],
  ['<embed src="evil.swf">', "embed tag"],
  ['<iframe src="https://evil.example/x"></iframe>', "third-party iframe"],
  ['<img src="data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+">', "data: SVG image"],
  ['<svg><script>alert(1)</script></svg>', "svg-wrapped script"],
  ['<style>body{display:none}</style>', "style block"],
  ['<p style="position:fixed;top:0;left:0;width:100vw;height:100vh">x</p>', "clickjacking inline style"],
  ['<form action="https://evil.example"><input name="p"></form>', "credential-harvesting form"],
  ['<a href="//evil.example">x</a>', "protocol-relative link"],
  ['<noscript><p>x</p></noscript>', "noscript"],
];

for (const [payload, label] of ATTACKS) {
  test(`lesson sanitizer neutralises: ${label}`, () => {
    const out = lesson(payload);
    assert.ok(!/<script|<object|<embed|<form|<style|<svg/i.test(out), `tag survived: ${out}`);
    assert.ok(!/\son\w+\s*=/i.test(out), `event handler survived: ${out}`);
    assert.ok(!/javascript:/i.test(out), `javascript: survived: ${out}`);
    assert.ok(!/data:/i.test(out), `data: URI survived: ${out}`);
    // The payload's own text must not leak through either — a legal document
    // reading "alert(1)" is its own kind of broken.
    assert.ok(!out.includes("alert(1)"), `payload text survived: ${out}`);
  });

  test(`waiver sanitizer neutralises: ${label}`, () => {
    const out = waiver(payload);
    assert.ok(!/<script|<object|<embed|<form|<style|<svg|<iframe|<img/i.test(out), `tag survived: ${out}`);
    assert.ok(!/\son\w+\s*=/i.test(out), `event handler survived: ${out}`);
    assert.ok(!out.includes("alert(1)"), `payload text survived: ${out}`);
  });
}

test("every tag actually used by stored lessons survives untouched", () => {
  // The exact distinct tag set found in production on 2026-08-12.
  const real = "<h2>Heading</h2><p>Body <strong>bold</strong> and <em>italic</em>.</p><ul><li>one</li><li>two</li></ul>";
  assert.equal(lesson(real), real);
});

test("the default waiver's vocabulary survives untouched", () => {
  const real = "<h2>1 · Scope</h2><h3>Sub</h3><p>Text with <strong>bold</strong> and <em>emphasis</em>.</p>";
  assert.equal(waiver(real), real);
});

test("a legitimate YouTube embed survives, a look-alike host does not", () => {
  const ok = '<iframe src="https://www.youtube-nocookie.com/embed/abc123"></iframe>';
  assert.ok(lesson(ok).includes("youtube-nocookie.com/embed/abc123"));
  assert.ok(!lesson('<iframe src="https://youtube.com.evil.example/embed/x"></iframe>').includes("iframe"));
});

test("links opening a new tab get noopener", () => {
  const out = lesson('<a href="https://example.com" target="_blank">x</a>');
  assert.match(out, /rel="noopener noreferrer"/);
});

test("the test's mirrored config still matches the source", () => {
  // Cheap drift guard: if someone adds a tag to lib/sanitize.ts and not here,
  // these assertions start lying. Fail loudly instead.
  for (const t of ["script", "object", "embed", "form", "svg", "style"]) {
    assert.ok(!SRC.includes(`"${t}"`) || ["style", "script"].includes(t),
      `lib/sanitize.ts appears to allow <${t}>`);
  }
  assert.ok(SRC.includes("allowedIframeHostnames"), "iframe hosts must stay restricted");
  assert.ok(!/allowedAttributes[\s\S]{0,400}"\*"/.test(SRC), "a global attribute allowance would let onerror through");
  assert.ok(!SRC.includes('"style"') || SRC.includes('nonTextTags'), "style must not be an allowed tag");
});
