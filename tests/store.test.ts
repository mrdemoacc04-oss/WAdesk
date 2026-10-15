import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/* These tests run the real services against the file-backed store — in a throwaway directory,
   never the developer's .data folder. */

let importContacts: typeof import("@/lib/server/services/contacts").importContacts;
let bulkAction: typeof import("@/lib/server/services/contacts").bulkAction;
let Db: typeof import("@/lib/server/db/scoped").Db;
let LocalAdapter: typeof import("@/lib/server/db/local").LocalAdapter;

before(async () => {
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "wadesk-test-")));
  ({ importContacts, bulkAction } = await import("@/lib/server/services/contacts"));
  ({ Db } = await import("@/lib/server/db/scoped"));
  ({ LocalAdapter } = await import("@/lib/server/db/local"));
});

const opts = { tags: ["Spring"], consent: true, duplicates: "update" as const, default_country: "IN" };

test("import: normalises, de-dupes in-file, reports invalid rows", async () => {
  const db = new Db(new LocalAdapter(), "ws-a");
  const res = await importContacts(
    db,
    [
      { phone: "9876543210", name: "Aarav" },
      { phone: "+91 98765 43210", name: "Aarav S", tags: ["vip"] }, // same person, second row
      { phone: "9.8111E9", name: "Sci" },
      { phone: "123", name: "Bad" },
      { phone: "", name: "Empty" },
    ],
    opts,
  );
  assert.equal(res.created, 2);
  assert.equal(res.invalid.length, 2);
  const rows = await db.select<any>("contacts", {});
  const aarav = rows.find((r) => r.phone === "+919876543210");
  assert.deepEqual(aarav.tags.sort(), ["spring", "vip"]);
  assert.equal(aarav.opt_in, "opted_in");
});

test("import never re-subscribes someone who opted out", async () => {
  const db = new Db(new LocalAdapter(), "ws-b");
  await importContacts(db, [{ phone: "9876500001", name: "Dev" }], { ...opts, consent: false });
  assert.equal((await db.select<any>("contacts", {}))[0].opt_in, "pending");
  await bulkAction(db, {}, { type: "opt_out" });
  const res = await importContacts(db, [{ phone: "9876500001", name: "Dev" }], opts); // uploader ticks the consent box
  assert.equal(res.updated, 1);
  assert.equal((await db.select<any>("contacts", {}))[0].opt_in, "opted_out");
});

test("workspaces are isolated from each other", async () => {
  const a = new Db(new LocalAdapter(), "ws-iso-a");
  const b = new Db(new LocalAdapter(), "ws-iso-b");
  await importContacts(a, [{ phone: "9876500010" }], opts);
  await importContacts(b, [{ phone: "9876500011" }], opts);
  assert.equal(await a.count("contacts"), 1);
  assert.equal(await b.count("contacts"), 1);
  assert.equal((await a.select<any>("contacts", {}))[0].phone, "+919876500010");
  assert.equal(await b.one("contacts", { phone: "+919876500010" }), null);
});

test("query vocabulary: arrays, SQL-style null handling, and/or groups", async () => {
  const db = new Db(new LocalAdapter(), "ws-q");
  await importContacts(db, [{ phone: "9876500020", tags: ["a", "b"] }, { phone: "9876500021", tags: ["b"] }, { phone: "9876500022", tags: [] }], { ...opts, tags: [] });
  const n = (where: any, extra?: any) => db.count("contacts", where, extra);
  assert.equal(await n({ tags: { has: ["a", "b"] } }), 1);
  assert.equal(await n({ tags: { hasAny: ["a", "b"] } }), 2);
  assert.equal(await n({ tags: { notHas: ["a"] } }), 2);
  assert.equal(await n({ email: { neq: "x@y.z" } }), 0); // NULL <> x is not true (matches Postgres)
  assert.equal(await n({ email: { isNull: true } }), 3);
  assert.equal(await n({}, { or: [{ tags: { has: ["a"] } }, { tags: { has: ["b"] } }], and: [{ phone: { like: "21" } }] }), 1);
});
