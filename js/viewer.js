/**
 * viewer.js
 * Renders a single topic's flashcards with:
 *  - lazy loading (only current + neighbor preloaded, never the whole set)
 *  - page-turn style transition
 *  - keyboard (arrow keys) and swipe navigation
 *  - fullscreen mode
 *  - "continue where you left off" via localStorage (browser-only, no backend)
 */

function createFlashcardViewer({ mount, topic, images, topicId }) {
  let index = 0;
  const total = images.length;
  const storageKey = `sf_progress_${topicId}`;
  let renderToken = 0; // guards against a slow older fetch overwriting a newer render

  mount.innerHTML = `
    <div class="viewer-wrap" id="viewerRoot">
      <div class="viewer-topbar">
        <h2>${escapeHtml(topic.name)}</h2>
        <button class="icon-btn" id="fsToggle" title="Fullscreen" aria-label="Toggle fullscreen">⛶</button>
      </div>
      <div class="viewer-stage" id="stage" tabindex="0"></div>
      <div class="viewer-controls">
        <button class="nav-btn" id="prevBtn" aria-label="Previous card">←</button>
        <div class="stamp" id="stamp"></div>
        <button class="nav-btn" id="nextBtn" aria-label="Next card">→</button>
      </div>
    </div>
  `;

  const stage = mount.querySelector("#stage");
  const stampEl = mount.querySelector("#stamp");
  const prevBtn = mount.querySelector("#prevBtn");
  const nextBtn = mount.querySelector("#nextBtn");
  const fsToggle = mount.querySelector("#fsToggle");
  const root = mount.querySelector("#viewerRoot");

  function preload(i) {
    if (i < 0 || i >= total) return;
    Api.getImageDataUri(images[i].fileId).catch(() => {}); // warms the cache silently
  }

  async function render(direction) {
    const myToken = ++renderToken;
    stampEl.textContent = `${index + 1} / ${total}`;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === total - 1;

    const face = document.createElement("div");
    face.className = "card-face";
    face.innerHTML = `<div class="loader"></div>`;

    const old = stage.querySelector(".card-face");
    if (direction && old) {
      face.classList.add(direction === "next" ? "enter-next" : "enter-prev");
      old.classList.add(direction === "next" ? "exit-next" : "exit-prev");
      old.addEventListener("animationend", () => old.remove(), { once: true });
    } else if (old) {
      old.remove();
    }
    stage.appendChild(face);

    const thisIndex = index;
    try {
      const dataUri = await Api.getImageDataUri(images[thisIndex].fileId);
      if (myToken !== renderToken) return; // a newer navigation happened while we were loading
      face.innerHTML = "";
      const img = document.createElement("img");
      img.alt = `${topic.name} card ${thisIndex + 1} of ${total}`;
      img.src = dataUri;
      face.appendChild(img);
    } catch (err) {
      if (myToken !== renderToken) return;
      face.innerHTML = `<div style="color: var(--danger); font-size: 0.85rem; padding: 20px; text-align:center;">Couldn't load this image. ${escapeHtml(err.message || "")}</div>`;
    }

    preload(index - 1);
    preload(index + 1);
    saveProgress();
  }

  function go(delta) {
    const newIndex = index + delta;
    if (newIndex < 0 || newIndex >= total) return;
    index = newIndex;
    render(delta > 0 ? "next" : "prev");
  }

  function saveProgress() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ index, total, ts: Date.now() }));
    } catch (e) { /* localStorage unavailable, ignore */ }
  }

  function checkResume() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && saved.total === total && saved.index > 0 && saved.index < total) {
        showResumeToast(saved.index);
      }
    } catch (e) { /* ignore */ }
  }

  function showResumeToast(savedIndex) {
    const toast = document.createElement("div");
    toast.className = "continue-toast";
    toast.innerHTML = `
      <span>Continue from card ${savedIndex + 1}?</span>
      <button id="resumeYes">Resume</button>
      <a class="dismiss" id="resumeNo">Start over</a>
    `;
    document.body.appendChild(toast);
    toast.querySelector("#resumeYes").onclick = () => {
      index = savedIndex;
      render(null);
      toast.remove();
    };
    toast.querySelector("#resumeNo").onclick = () => toast.remove();
    setTimeout(() => toast.remove(), 8000);
  }

  // ---- controls ----
  prevBtn.onclick = () => go(-1);
  nextBtn.onclick = () => go(1);

  function keyHandler(e) {
    if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "Escape" && document.fullscreenElement) exitFullscreen();
  }
  document.addEventListener("keydown", keyHandler);

  // swipe
  let touchStartX = null;
  stage.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touchStartX = null;
  }, { passive: true });

  // fullscreen
  function enterFullscreen() {
    const wrap = root;
    if (wrap.requestFullscreen) wrap.requestFullscreen().catch(() => {});
    document.body.classList.add("fullscreen-active");
    stage.classList.add("fullscreen-mode");
  }
  function exitFullscreen() {
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    document.body.classList.remove("fullscreen-active");
    stage.classList.remove("fullscreen-mode");
  }
  fsToggle.onclick = () => {
    if (document.fullscreenElement) exitFullscreen();
    else enterFullscreen();
  };
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      document.body.classList.remove("fullscreen-active");
      stage.classList.remove("fullscreen-mode");
    }
  });

  function destroy() {
    document.removeEventListener("keydown", keyHandler);
  }

  render(null);
  checkResume();

  return { destroy };
}
