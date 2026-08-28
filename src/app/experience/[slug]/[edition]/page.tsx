/**
 * One particular clinic.
 *
 * /experience/np7-coaching-clinics-usa       → the SERIES: whichever run is next
 * /experience/np7-coaching-clinics-usa/<ed>  → THAT run, whatever else is on sale
 *
 * A format that travels (migration 158) needs both. The series URL is the one
 * that lives in a bio and never goes stale; the edition URL is the one you put
 * in a WhatsApp group for that weekend, and it must keep pointing at that
 * weekend after the next clinic is added.
 *
 * It renders the SERIES page component, not a page of its own. The two used to
 * be different templates, so choosing a date in the picker dropped you out of
 * the real page and onto the old slim one — a worse page reached by clicking
 * the thing meant to help you. Now the extra segment only pins which edition
 * the lower half of the page describes.
 *
 * Only event editions have a slug here, so this route never shadows a trip;
 * `balance` and `thanks` are static siblings and still win the match.
 */
export { default, generateMetadata } from "../page";

export const dynamic = "force-dynamic";
