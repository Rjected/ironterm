// The slice of Cloudflare D1's API the worker uses, on Node's built-in SQLite (node:sqlite,
// Node ≥ 22.13). Lets the exact same worker code run on any box with Node or Docker.
import { DatabaseSync, type StatementSync } from "node:sqlite";

type Row = Record<string, unknown>;

class Stmt {
  constructor(private db: DatabaseSync, readonly sql: string, readonly args: unknown[] = []) {}
  bind(...args: unknown[]) { return new Stmt(this.db, this.sql, args); }
  private st(): StatementSync { return this.db.prepare(this.sql); }
  private a() { return this.args.map((x) => (x === undefined ? null : typeof x === "boolean" ? Number(x) : x)) as never[]; }
  async first<T = Row>(col?: string): Promise<T | null> {
    const r = this.st().get(...this.a()) as Row | undefined;
    if (!r) return null;
    return (col ? r[col] : r) as T;
  }
  async all<T = Row>(): Promise<{ results: T[]; success: true; meta: object }> {
    return { results: this.st().all(...this.a()) as T[], success: true, meta: {} };
  }
  async run(): Promise<{ success: true; meta: { changes: number; last_row_id: number } }> {
    const r = this.st().run(...this.a());
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  /** synchronous run, for batch */
  _run() { return this.st().run(...this.a()); }
}

export class NodeD1 {
  private db: DatabaseSync;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  }
  prepare(sql: string) { return new Stmt(this.db, sql); }
  /** all-or-nothing, like D1 */
  async batch(stmts: Stmt[]) {
    this.db.exec("BEGIN");
    try {
      const out = stmts.map((s) => { const r = s._run(); return { success: true, meta: { changes: Number(r.changes) } }; });
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  async exec(sql: string) { this.db.exec(sql); return { count: 0, duration: 0 }; }
}
