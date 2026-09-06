// Input validation. The allow-list in pick() is what stops a crafted
// request granting itself admin or credits, so it gets its own test.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as v from "../netlify/functions/bookboost-lib/validate.js";

function throws(fn, code = "invalid_input") {
  assert.throws(fn, (err) => err.code === code, `expected ${code}`);
}

test("strings are trimmed, length-checked and required-checked", () => {
  assert.equal(v.str("  hello  ", "Title"), "hello");
  assert.equal(v.str("", "Title"), null);
  throws(() => v.str("", "Title", { required: true }));
  throws(() => v.str("x".repeat(50), "Title", { max: 10 }));
  throws(() => v.str(42, "Title"));
});

test("integers reject floats, strings and out-of-range values", () => {
  assert.equal(v.int("42", "Budget"), 42);
  throws(() => v.int(4.5, "Budget"));
  throws(() => v.int("abc", "Budget"));
  throws(() => v.int(500, "Budget", { max: 100 }));
});

test("oneOf rejects anything outside the allow-list", () => {
  assert.equal(v.oneOf("meta", "Platform", v.PLATFORMS), "meta");
  throws(() => v.oneOf("myspace", "Platform", v.PLATFORMS));
});

test("uuid rejects near-misses", () => {
  const good = "d0000000-0000-4000-8000-000000000001";
  assert.equal(v.uuid(good, "Book"), good);
  throws(() => v.uuid("not-a-uuid", "Book"));
  throws(() => v.uuid("d0000000-0000-4000-8000-00000000000", "Book"));
});

test("url accepts http and https only", () => {
  assert.equal(v.url("https://example.com/book", "URL"), "https://example.com/book");
  // These end up in href attributes and as Meta ad destinations, so a
  // scheme that can execute must never survive validation.
  throws(() => v.url("javascript:alert(1)", "URL"));
  throws(() => v.url("data:text/html,<script>alert(1)</script>", "URL"));
  throws(() => v.url("file:///etc/passwd", "URL"));
  throws(() => v.url("not a url", "URL"));
});

test("string arrays are bounded and cleaned", () => {
  assert.deepEqual(v.stringArray([" a ", "", "b", 5], "Genres"), ["a", "b"]);
  throws(() => v.stringArray("not an array", "Genres"));
  throws(() => v.stringArray(new Array(100).fill("x"), "Genres", { maxItems: 10 }));
});

test("pick drops every field not in the allow-list", () => {
  // The exact attack this defends against: a profile update that tries
  // to grant itself admin, credits and a paid plan.
  const hostile = {
    full_name: "Real Name",
    role: "admin",
    ai_credits: 999999,
    plan_id: "publisher",
    id: "someone-elses-id",
  };
  const picked = v.pick(hostile, {
    full_name: (x) => v.str(x, "Name", { max: 120 }),
    country: (x) => v.str(x, "Country", { max: 60 }),
  });
  assert.deepEqual(picked, { full_name: "Real Name" });
  assert.ok(!("role" in picked));
  assert.ok(!("ai_credits" in picked));
  assert.ok(!("plan_id" in picked));
});

test("currency must be a three-letter code", () => {
  assert.equal(v.currency("EUR"), "EUR");
  assert.equal(v.currency(""), "EUR");
  throws(() => v.currency("euros"));
  throws(() => v.currency("eur"));
});

test("dates must be ISO calendar dates", () => {
  assert.equal(v.isoDate("2026-03-01", "Start"), "2026-03-01");
  throws(() => v.isoDate("01/03/2026", "Start"));
  throws(() => v.isoDate("2026-13-45", "Start"));
});
