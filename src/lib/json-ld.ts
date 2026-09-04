/**
 * Serialise structured data for a <script type="application/ld+json"> block.
 *
 * JSON.stringify alone is not enough inside a script tag. The HTML parser looks
 * for the literal string "</script" before the JSON parser ever sees the text,
 * so a title, tagline or description containing one closes the block early and
 * everything after it is parsed as markup. That is a stored XSS on a public
 * page, written from an ordinary content field.
 *
 * Escaping the three characters that can start such a sequence keeps the JSON
 * exactly equivalent (< is "<" to any JSON parser) while making it
 * impossible for content to end the tag.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
