/**
 * THE ONE RULE FOR EVERY READ THAT DECIDES ABOUT MONEY.
 *
 * supabase-js does not throw on a failed query: it resolves with { error }. So
 * `const { data } = await db.from(…)` makes a database failure look exactly
 * like "there is no such row", and on a money route that reads as ZERO. Zero
 * payments received means a booking paid in full is fully owing. Zero live
 * links means nothing is in flight. Either answer opens a second checkout for
 * money the guest has already sent, and the first anybody hears of it is the
 * refund.
 *
 * These throw instead, and every caller turns that into a refusal the guest or
 * the admin can simply retry. Refusing costs somebody a minute. Assuming zero
 * costs a guest a double payment and somebody at NP7 an hour in Stripe.
 *
 * Only a read that SUCCEEDED and found nothing returns null or an empty list,
 * and that is the only case a caller may treat as "there is nothing there".
 *
 * The Stripe webhook keeps its own pair of these (readOne / readMany) rather
 * than importing this: there a throw has to become a 500 so Stripe redelivers
 * the event for days, which is a different contract from a route answering a
 * person who is standing in front of a button. Same rule, two obligations.
 */

/** One row, or null when the read worked and matched nothing. */
export async function readRow<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: PromiseLike<{ data: any; error: { message?: string } | null }>,
  what: string,
): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw new Error(`read failed (${what}): ${error.message ?? JSON.stringify(error)}`);
  return (data as T | null) ?? null;
}

/** Every matching row, or an empty list when the read worked and matched none. */
export async function readRows<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: PromiseLike<{ data: any; error: { message?: string } | null }>,
  what: string,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`read failed (${what}): ${error.message ?? JSON.stringify(error)}`);
  return (data ?? []) as T[];
}
