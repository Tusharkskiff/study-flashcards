/**
 * app.js — public (viewer) site. No login required.
 * Simple hash router: #/ , #/subject/:id , #/topic/:id
 */

const App = (() => {
  const mount = document.getElementById("appRoot");
  let library = null; // cached { subjects: [...] }
  let libraryLoadedAt = 0;
  const CACHE_MS = 60 * 1000; // re-fetch library at most once a minute
  let activeViewer = null;

  async function getLibrary(force = false) {
    if (!force && library && Date.now() - libraryLoadedAt < CACHE_MS) return library;
    library = await Api.getLibrary();
    libraryLoadedAt = Date.now();
    return library;
  }

  function setBreadcrumbs(items) {
    const el = document.getElementById("breadcrumbs");
    el.innerHTML = items.map((item, i) => {
      const isLast = i === items.length - 1;
      if (isLast) return `<span class="current">${escapeHtml(item.label)}</span>`;
      return `<a href="${item.href}">${escapeHtml(item.label)}</a><span class="sep">/</span>`;
    }).join("");
  }

  async function route() {
    if (activeViewer) { activeViewer.destroy(); activeViewer = null; }
    const hash = location.hash.replace(/^#\/?/, "");
    const parts = hash.split("/").filter(Boolean);
    try {
      if (parts.length === 0) {
        await renderHome();
      } else if (parts[0] === "subject" && parts[1]) {
        await renderSubject(parts[1]);
      } else if (parts[0] === "topic" && parts[1]) {
        await renderTopic(parts[1]);
      } else {
        await renderHome();
      }
    } catch (err) {
      handleApiError(err, "Unable to load this page.");
      mount.innerHTML = `<div class="empty-state"><h3>Something went wrong</h3><p>${escapeHtml(err.message || "")}</p></div>`;
    }
    window.scrollTo({ top: 0 });
  }

  async function renderHome() {
    setBreadcrumbs([{ label: "Home", href: "#/" }]);
    mount.innerHTML = `<div class="page-head"><div><h1>${escapeHtml(CONFIG.SITE_TITLE)}</h1><div class="subtitle">Pick a subject to start studying</div></div></div><div class="grid" id="subjGrid"><p>Loading…</p></div>`;
    const lib = await getLibrary();
    const grid = document.getElementById("subjGrid");
    if (!lib.subjects.length) {
      grid.innerHTML = `<div class="empty-state"><h3>No subjects yet</h3><p>Check back soon — the study library is being set up.</p></div>`;
      return;
    }
    grid.innerHTML = lib.subjects.map((s) => `
      <a class="tile" href="#/subject/${s.id}">
        <div class="tile-title">${escapeHtml(s.name)}</div>
        <div class="tile-meta">${s.topics.length} topic${s.topics.length === 1 ? "" : "s"}</div>
      </a>
    `).join("");
  }

  async function renderSubject(subjectId) {
    const lib = await getLibrary();
    const subject = lib.subjects.find((s) => s.id === subjectId);
    if (!subject) {
      mount.innerHTML = `<div class="empty-state"><h3>Subject not found</h3><a class="btn" href="#/">Go home</a></div>`;
      return;
    }
    setBreadcrumbs([{ label: "Home", href: "#/" }, { label: subject.name, href: `#/subject/${subject.id}` }]);
    mount.innerHTML = `<div class="page-head"><div><h1>${escapeHtml(subject.name)}</h1><div class="subtitle">${subject.topics.length} topic${subject.topics.length === 1 ? "" : "s"}</div></div></div><div class="grid" id="topicGrid"></div>`;
    const grid = document.getElementById("topicGrid");
    if (!subject.topics.length) {
      grid.innerHTML = `<div class="empty-state"><h3>No topics yet</h3></div>`;
      return;
    }
    grid.innerHTML = subject.topics.map((t) => `
      <a class="tile" href="#/topic/${t.id}">
        <div class="tile-title">${escapeHtml(t.name)}</div>
        <div class="tile-meta">${t.cardCount} card${t.cardCount === 1 ? "" : "s"}</div>
      </a>
    `).join("");
  }

  async function renderTopic(topicId) {
    mount.innerHTML = `<p>Loading flashcards…</p>`;
    const data = await Api.getTopic(topicId);
    if (!data || !data.topic) {
      mount.innerHTML = `<div class="empty-state"><h3>Topic not found</h3><a class="btn" href="#/">Go home</a></div>`;
      return;
    }
    const { topic, images, subject } = data;
    setBreadcrumbs([
      { label: "Home", href: "#/" },
      { label: subject.name, href: `#/subject/${subject.id}` },
      { label: topic.name, href: `#/topic/${topic.id}` }
    ]);
    mount.innerHTML = "";
    if (!images.length) {
      mount.innerHTML = `<div class="empty-state"><h3>No cards yet</h3><p>Images haven't been added to this topic yet.</p></div>`;
      return;
    }
    activeViewer = createFlashcardViewer({ mount, topic, images, topicId: topic.id });
  }

  function initSearch() {
    const input = document.getElementById("searchInput");
    const resultsEl = document.getElementById("searchResults");
    let debounceTimer;
    input.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      const q = input.value.trim();
      if (!q) { resultsEl.style.display = "none"; resultsEl.innerHTML = ""; return; }
      debounceTimer = setTimeout(async () => {
        try {
          const lib = await getLibrary();
          const matches = [];
          const ql = q.toLowerCase();
          lib.subjects.forEach((s) => {
            if (s.name.toLowerCase().includes(ql)) matches.push({ label: s.name, sub: "Subject", href: `#/subject/${s.id}` });
            s.topics.forEach((t) => {
              if (t.name.toLowerCase().includes(ql)) matches.push({ label: t.name, sub: s.name, href: `#/topic/${t.id}` });
            });
          });
          if (!matches.length) {
            resultsEl.innerHTML = `<div style="padding:12px 14px; color: var(--ink-soft); font-size:0.85rem;">No matches</div>`;
          } else {
            resultsEl.innerHTML = matches.slice(0, 12).map((m) =>
              `<a href="${m.href}"><div>${escapeHtml(m.label)}</div><div class="muted">${escapeHtml(m.sub)}</div></a>`
            ).join("");
          }
          resultsEl.style.display = "block";
        } catch (err) {
          handleApiError(err, "Search failed.");
        }
      }, 220);
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-box")) resultsEl.style.display = "none";
    });
    resultsEl.addEventListener("click", () => { resultsEl.style.display = "none"; input.value = ""; });
  }

  function init() {
    Theme.init();
    document.getElementById("themeToggle").onclick = Theme.toggle;
    initSearch();
    window.addEventListener("hashchange", route);
    route();
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", App.init);
