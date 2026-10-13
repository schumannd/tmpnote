import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

test("create a note works after a read scrubs the route to home", async () => {
  const elements = new Map();
  const listeners = {};
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      addEventListener(name, callback) { this[name] = callback; },
    });
    return elements.get(id);
  };
  const location = { pathname: "/tmpnote/", hash: "#/n/id~key" };
  const context = vm.createContext({
    window: { TMPNOTE_CONFIG: {}, addEventListener() {} },
    document: {
      getElementById: element,
      addEventListener(name, callback) { listeners[name] = callback; },
    },
    location,
    history: { replaceState(_state, _title, url) { location.hash = url.slice(url.indexOf("#")); } },
    hasApi: () => true,
    isUrlNoteToken: () => false,
    burnRemoteNote: async () => ({ payload: "ciphertext" }),
    decryptNote: async () => "hello",
  });
  const source = readFileSync(new URL("../js/app.js", import.meta.url), "utf8")
    .replace(/^import .*;\n/gm, "")
    .replace(/route\(\);\s*$/, "globalThis.pending = route();");
  vm.runInContext(source, context);
  element("reveal-btn").click({ target: element("reveal-btn") });
  await context.pending;
  assert.equal(location.hash, "#/");
  assert.match(element("view").innerHTML, /Your note/);
  let prevented = false;
  listeners.click({
    button: 0,
    target: { closest: () => ({}) },
    preventDefault() { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.match(element("view").innerHTML, /id="create-form"/);
});

test("network errors explain connection failures without retrying consumption", async () => {
  globalThis.window = { TMPNOTE_CONFIG: { apiBase: "https://example.test" } };
  const originalFetch = globalThis.fetch;
  const source = readFileSync(new URL("../js/api.js", import.meta.url), "utf8");
  const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError("Load failed"); };
  try {
    await assert.rejects(api.burnRemoteNote("id"), /may already have been consumed/);
    assert.equal(calls, 1);
    await assert.rejects(api.createRemoteNote({ payload: "test", ttlSeconds: 60 }), /Cannot connect/);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.window;
  }
});
