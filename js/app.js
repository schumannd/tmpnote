import { encryptNote, decryptNote } from "./crypto.js";
import { hasApi, createRemoteNote, burnRemoteNote } from "./api.js";
import { encodeUrlNote, isUrlNoteToken, decodeUrlNote } from "./url-storage.js";

const view = document.getElementById("view");
const cfg = () => window.TMPNOTE_CONFIG || {};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function basePath() {
  // Support project Pages ( /repo/ ) and user Pages ( / )
  const path = location.pathname.replace(/index\.html$/, "");
  return path.endsWith("/") ? path : `${path}/`;
}

function noteUrl(token, key) {
  return `${location.origin}${basePath()}#/n/${token}~${key}`;
}

function parseRoute() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  const noteMatch = path.match(/^\/n\/(.+)$/);
  if (noteMatch) {
    const body = noteMatch[1];
    const tilde = body.lastIndexOf("~");
    if (tilde === -1) return { name: "invalid" };
    return {
      name: "note",
      token: body.slice(0, tilde),
      key: body.slice(tilde + 1),
    };
  }
  return { name: "home" };
}

function ttlOptions() {
  return [
    { value: 3600, label: "1 hour" },
    { value: 86400, label: "1 day" },
    { value: 604800, label: "7 days" },
    { value: 2592000, label: "30 days" },
  ];
}

function renderHome() {
  const api = hasApi();
  const options = ttlOptions()
    .map(
      (o) =>
        `<option value="${o.value}" ${
          o.value === (cfg().defaultTtlSeconds || 604800) ? "selected" : ""
        }>${o.label}</option>`
    )
    .join("");

  view.innerHTML = `
    <section class="panel">
      <h1>Leave a note that won’t linger</h1>
      <p class="lede">
        Write something sensitive, share the link, and it disappears after it’s opened.
      </p>
      <form id="create-form">
        <div class="field">
          <label for="note">Your note</label>
          <textarea id="note" name="note" maxlength="${
            cfg().maxNoteLength || 10000
          }" placeholder="Passwords, one-time codes, private messages…" required></textarea>
        </div>
        ${
          api
            ? `<div class="field row">
                <div>
                  <label for="ttl">Expires if unread</label>
                  <select id="ttl" name="ttl">${options}</select>
                </div>
                <div>
                  <label>Mode</label>
                  <p class="mode-hint" style="margin:0.55rem 0 0">Burn after first open (API)</p>
                </div>
              </div>`
            : `<p class="warn-banner">
                No API configured — notes are packed into the link (URL mode).
                Anyone with the link can open it more than once. Set <code>apiBase</code> in
                <code>config.js</code> for true self-destruct.
              </p>`
        }
        <div class="actions">
          <button type="submit" class="btn-primary" id="create-btn">Create note</button>
        </div>
        <p class="status" id="status" role="status"></p>
      </form>
    </section>
  `;

  const form = document.getElementById("create-form");
  const status = document.getElementById("status");
  const btn = document.getElementById("create-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const plaintext = document.getElementById("note").value.trim();
    if (!plaintext) return;
    const max = cfg().maxNoteLength || 10000;
    if (plaintext.length > max) {
      status.className = "status error";
      status.textContent = `Note is too long (max ${max} characters).`;
      return;
    }

    btn.disabled = true;
    status.className = "status";
    status.textContent = "Encrypting…";

    try {
      const { payload, key } = await encryptNote(plaintext);
      let token;

      if (hasApi()) {
        const ttlSeconds = Number(
          document.getElementById("ttl")?.value || cfg().defaultTtlSeconds || 604800
        );
        status.textContent = "Uploading ciphertext…";
        const { id } = await createRemoteNote({ payload, ttlSeconds });
        token = id;
      } else {
        token = encodeUrlNote(payload);
        // Rough guard: very long URLs break in some messengers
        const url = noteUrl(token, key);
        if (url.length > 6000) {
          throw new Error(
            "Note is too long for URL mode. Configure an API in config.js or shorten the note."
          );
        }
      }

      location.hash = `#/share/${token}~${key}`;
    } catch (err) {
      status.className = "status error";
      status.textContent = err.message || "Could not create note.";
      btn.disabled = false;
    }
  });
}

function renderShare(token, key) {
  const url = noteUrl(token, key);
  const burned = hasApi() && !isUrlNoteToken(token);

  view.innerHTML = `
    <section class="panel">
      <h1>Link ready</h1>
      <p class="lede">
        ${
          burned
            ? "This link works once. After someone opens it, the note is gone."
            : "This link contains the encrypted note. Treat it like a password."
        }
      </p>
      <div class="field">
        <label for="share-url">Shareable link</label>
        <div class="link-box">
          <input id="share-url" type="text" readonly value="${escapeHtml(url)}" />
          <button type="button" class="btn-primary" id="copy-btn">Copy</button>
        </div>
      </div>
      <p class="status" id="status" role="status"></p>
      <div class="actions">
        <a class="btn btn-ghost" href="#/">Create another</a>
      </div>
    </section>
  `;

  const input = document.getElementById("share-url");
  const copyBtn = document.getElementById("copy-btn");
  const status = document.getElementById("status");

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
      status.className = "status ok";
      status.textContent = "Copied to clipboard.";
    } catch {
      input.select();
      status.className = "status";
      status.textContent = "Select the link and copy manually.";
    }
  });
}

async function renderNote(token, key) {
  view.innerHTML = `
    <section class="panel">
      <h1>Opening note…</h1>
      <p class="lede">Decrypting in your browser.</p>
      <p class="status" id="status" role="status"></p>
    </section>
  `;

  const status = document.getElementById("status");

  try {
    let payload;
    let burned = false;

    if (isUrlNoteToken(token)) {
      payload = decodeUrlNote(token);
    } else {
      if (!hasApi()) {
        throw new Error(
          "This note requires the API, but apiBase is not set in config.js."
        );
      }
      status.textContent = "Fetching & burning ciphertext…";
      view.innerHTML = `
        <section class="panel">
          <h1>Private note</h1>
          <p class="lede">Revealing this note permanently consumes the link.</p>
          <button type="button" class="btn-primary" id="reveal-btn">Reveal and destroy</button>
        </section>
      `;
      await new Promise((resolve) => {
        document.getElementById("reveal-btn").addEventListener("click", (event) => {
          event.target.disabled = true;
          resolve();
        }, { once: true });
      });
      const data = await burnRemoteNote(token);
      payload = data.payload;
      burned = true;
    }

    const plaintext = await decryptNote(payload, key);

    view.innerHTML = `
      <section class="panel">
        <div class="meta">
          <span class="badge">${burned ? "Destroyed after this view" : "Decrypted locally"}</span>
        </div>
        ${
          burned
            ? ""
            : `<p class="warn-banner">URL mode: the link still works if shared again. Close this tab when you’re done.</p>`
        }
        <h1>Your note</h1>
        <pre class="note-body">${escapeHtml(plaintext)}</pre>
        <div class="actions">
          <a class="btn btn-primary" href="#/">Create a note</a>
        </div>
      </section>
    `;

    // Scrub key from the address bar after a successful read (API mode)
    if (burned) {
      history.replaceState(null, "", `${basePath()}#/`);
    }
  } catch (err) {
    view.innerHTML = `
      <section class="panel">
        <h1>Unavailable</h1>
        <p class="lede">${escapeHtml(err.message || "Could not open this note.")}</p>
        <div class="actions">
          <a class="btn btn-primary" href="#/">Create a note</a>
        </div>
      </section>
    `;
  }
}

function renderInvalid() {
  view.innerHTML = `
    <section class="panel">
      <h1>Invalid link</h1>
      <p class="lede">This note URL is incomplete or malformed.</p>
      <div class="actions">
        <a class="btn btn-primary" href="#/">Create a note</a>
      </div>
    </section>
  `;
}

function route() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const shareMatch = hash.match(/^\/share\/(.+)$/);
  if (shareMatch) {
    const body = shareMatch[1];
    const tilde = body.lastIndexOf("~");
    if (tilde === -1) return renderInvalid();
    return renderShare(body.slice(0, tilde), body.slice(tilde + 1));
  }

  const r = parseRoute();
  if (r.name === "note") return renderNote(r.token, r.key);
  if (r.name === "invalid") return renderInvalid();
  return renderHome();
}

window.addEventListener("hashchange", route);
route();
