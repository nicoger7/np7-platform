/**
 * An in-memory stand-in for the PostgREST client, enough to drive a route.
 *
 * Two of its properties are the whole point, and both are things the real
 * client does that a hand-rolled `{ data }` mock does not:
 *
 *  1. A FAILED QUERY RESOLVES. It does not reject. `{ data: null, error: {…} }`
 *     is what comes back, which is exactly how a database failure ever managed
 *     to look like "no such row" in the first place. `failOn()` reproduces that
 *     shape, so a test can assert what the route does about it.
 *  2. An UPDATE REPORTS WHAT IT MATCHED, but only when the caller asks with
 *     `.select()`. A conditional update that matched nothing is not an error,
 *     and telling those two apart is the difference between "a redelivery" and
 *     "the write did not happen".
 *
 * Column projection is deliberately not modelled: `select("a, b")` returns the
 * whole row. Rows are set up with the shape the route expects, embedded objects
 * and all, and nothing under test reasons about which columns came back.
 */

export type Row = Record<string, unknown>;
export type Op = "select" | "insert" | "update" | "delete";

type Failure = { table: string; op: Op; message: string; times: number };

const cmp = (v: unknown) => (v instanceof Date ? v.toISOString() : v);

export class FakeSupabase {
  readonly tables: Record<string, Row[]>;
  private failures: Failure[] = [];
  private seq = 0;

  constructor(tables: Record<string, Row[]> = {}) {
    this.tables = tables;
  }

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  /** Make queries of this shape come back with { error }, the way the real
   *  client does when a column is missing or the connection is gone. */
  failOn(table: string, op: Op, opts: { message?: string; times?: number } = {}): void {
    this.failures.push({
      table,
      op,
      message: opts.message ?? `relation ${table} is unavailable`,
      times: opts.times ?? Number.POSITIVE_INFINITY,
    });
  }

  private takeFailure(table: string, op: Op): string | null {
    const f = this.failures.find((x) => x.table === table && x.op === op && x.times > 0);
    if (!f) return null;
    f.times -= 1;
    return f.message;
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table, (t, o) => this.takeFailure(t, o), () => `${table}_${++this.seq}`);
  }
}

type Result = { data: unknown; error: { message: string; code: string } | null };

class FakeQuery implements PromiseLike<Result> {
  private op: Op = "select";
  private payload: Row[] = [];
  private patch: Row = {};
  private filters: ((r: Row) => boolean)[] = [];
  /** `.select()` chained AFTER a write: the caller wants the rows back. */
  private wantsRows = false;
  private limitN: number | null = null;

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: string,
    private readonly takeFailure: (t: string, o: Op) => string | null,
    private readonly nextId: () => string,
  ) {}

  /** Column lists are accepted and ignored: whole rows come back. Chained
   *  after a write, it means the caller wants the affected rows. */
  select(): this {
    if (this.op !== "select") this.wantsRows = true;
    return this;
  }
  insert(rows: Row | Row[]): this {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Row): this {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  neq(col: string, val: unknown): this {
    this.filters.push((r) => r[col] !== val);
    return this;
  }
  in(col: string, vals: unknown[]): this {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  gt(col: string, val: unknown): this {
    this.filters.push((r) => (cmp(r[col]) as never) > (cmp(val) as never));
    return this;
  }
  /** `.not("paid_at", "is", null)` and `.not("status", "in", "(paid,cancelled)")`. */
  not(col: string, operator: string, val: unknown): this {
    if (operator === "is" && val === null) this.filters.push((r) => r[col] != null);
    else if (operator === "in") {
      const list = String(val).replace(/^\(|\)$/g, "").split(",").map((s) => s.trim());
      this.filters.push((r) => !list.includes(String(r[col])));
    } else this.filters.push((r) => r[col] !== val);
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  order(): this {
    return this;
  }
  maybeSingle(): Promise<Result> {
    return this.run("maybe");
  }
  single(): Promise<Result> {
    return this.run("one");
  }
  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run("many").then(onfulfilled, onrejected);
  }

  private async run(shape: "maybe" | "one" | "many"): Promise<Result> {
    const failed = this.takeFailure(this.table, this.op);
    if (failed) return { data: null, error: { message: failed, code: "FAKE" } };

    const all = this.db.rows(this.table);
    if (this.op === "insert") {
      const created = this.payload.map((r) => ({ id: this.nextId(), ...r }));
      all.push(...created);
      return { data: shape === "many" ? created : created[0] ?? null, error: null };
    }

    const matched = all.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "update") {
      for (const r of matched) Object.assign(r, this.patch);
      return { data: this.wantsRows ? matched.map((r) => ({ ...r })) : null, error: null };
    }
    if (this.op === "delete") {
      for (const r of matched) all.splice(all.indexOf(r), 1);
      return { data: this.wantsRows ? matched : null, error: null };
    }

    const rows = (this.limitN != null ? matched.slice(0, this.limitN) : matched).map((r) => ({ ...r }));
    if (shape === "maybe") return { data: rows[0] ?? null, error: null };
    if (shape === "one") {
      return rows[0]
        ? { data: rows[0], error: null }
        : { data: null, error: { message: "no rows returned", code: "PGRST116" } };
    }
    return { data: rows, error: null };
  }
}
