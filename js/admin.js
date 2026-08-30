/**
 * admin.js — admin dashboard. Requires Google sign-in; every write is
 * re-verified by the backend, so hiding these controls is a UX nicety only,
 * never the actual security boundary.
 */

const Admin = (() => {
  const mount = document.getElementById("adminRoot");
  const gate = document.getElementById("authGate");
  const shell = document.getElementById("adminShell");
  const profileChip = document.getElementById("profileChip");

  async function boot() {
    Theme.init();
    document.getElementById("themeToggle").onclick = Theme.toggle;

    const status = gate.querySelector("#gateStatus");

    if (!CONFIG.GOOGLE_CLIENT_ID || CONFIG.GOOGLE_CLIENT_ID.indexOf("YOUR_GOOGLE_OAUTH_CLIENT_ID") === 0) {
      status.textContent = "GOOGLE_CLIENT_ID hasn't been set in js/config.js yet.";
      status.className = "denied";
      return;
    }
    if (!CONFIG.API_URL || CONFIG.API_URL.indexOf("YOUR_APPS_SCRIPT") === 0) {
      status.textContent = "API_URL hasn't been set in js/config.js yet.";
      status.className = "denied";
      return;
    }

    try {
      await Auth.ready();
    } catch (err) {
      status.textContent = err.message;
      status.className = "denied";
      return;
    }

    Auth.init(onSignedIn);
    Auth.renderButton(document.getElementById("g_id_button_wrap"));

    if (Auth.isSignedIn()) {
      await onSignedIn();
    }
  }

  async function onSignedIn() {
    gate.querySelector("#gateStatus").textContent = "Checking authorization…";
    gate.querySelector("#gateStatus").className = "";
    try {
      const result = await Api.checkAdmin();
      if (!result || !result.isAdmin) {
        showDenied();
        return;
      }
      gate.style.display = "none";
      shell.style.display = "block";
      renderProfileChip();
      window.addEventListener("hashchange", route);
      route();
    } catch (err) {
      showDenied(err.message);
    }
  }

  function showDenied(message) {
    const status = gate.querySelector("#gateStatus");
    status.textContent = message || "Access denied. You are not authorized to modify this library.";
    status.className = "denied";
    Auth.signOut();
  }

  function renderProfileChip() {
    const profile = Auth.getProfile();
    if (!profile) return;
    profileChip.style.display = "flex";
    profileChip.innerHTML = `
      <img src="${profile.picture || ""}" alt="">
      <span>${escapeHtml(profile.name || profile.email)}</span>
      <button class="btn btn-ghost btn-sm" id="signOutBtn">Sign out</button>
    `;
    document.getElementById("signOutBtn").onclick = () => location.reload();
  }

  // ---------------- routing ----------------
  async function route() {
    const hash = location.hash.replace(/^#\/?/, "");
    const parts = hash.split("/").filter(Boolean);
    try {
      if (parts.length === 0) await renderSubjects();
      else if (parts[0] === "subject" && parts[1]) await renderTopics(parts[1]);
      else if (parts[0] === "topic" && parts[1]) await renderImages(parts[1]);
      else await renderSubjects();
    } catch (err) {
      handleApiError(err, "Failed to load.");
    }
  }

  // ---------------- Subjects ----------------
  async function renderSubjects() {
    mount.innerHTML = `
      <div class="page-head">
        <div><h1>Subjects</h1><div class="subtitle">Top-level folders of your study library</div></div>
        <button class="btn btn-accent" id="addSubjectBtn">+ Create Subject</button>
      </div>
      <div class="admin-list" id="subjList"><p>Loading…</p></div>
    `;
    document.getElementById("addSubjectBtn").onclick = () => promptCreate("Create subject", "Subject name", async (name) => {
      await Api.createSubject(name);
      Toast.success("Subject created.");
      renderSubjects();
    });
    const lib = await Api.getLibrary();
    const list = document.getElementById("subjList");
    if (!lib.subjects.length) {
      list.innerHTML = `<div class="empty-state"><h3>No subjects yet</h3><p>Create your first subject to get started.</p></div>`;
      return;
    }
    list.innerHTML = lib.subjects.map((s) => rowTemplate(s.id, s.name, `${s.topics.length} topics`, `#/subject/${s.id}`)).join("");
    wireRow(list, {
      onOpen: (id) => location.hash = `#/subject/${id}`,
      onRename: (id, name) => promptRename("Rename subject", name, async (newName) => {
        await Api.renameSubject(id, newName);
        Toast.success("Renamed.");
        renderSubjects();
      }),
      onDelete: (id, name) => confirmDelete("Delete subject", `Delete "${name}"? This will also delete all its topics and images from Google Drive. This cannot be undone.`, async () => {
        await Api.deleteSubject(id);
        Toast.success("Subject deleted.");
        renderSubjects();
      }),
      onReorder: async (orderedIds) => { await Api.reorderSubjects(orderedIds); }
    });
    enableDragReorder(list, ".admin-row");
  }

  // ---------------- Topics ----------------
  async function renderTopics(subjectId) {
    mount.innerHTML = `<p>Loading…</p>`;
    const lib = await Api.getLibrary();
    const subject = lib.subjects.find((s) => s.id === subjectId);
    if (!subject) { mount.innerHTML = `<div class="empty-state"><h3>Subject not found</h3></div>`; return; }
    mount.innerHTML = `
      <div class="breadcrumbs"><a href="#/">Subjects</a><span class="sep">/</span><span class="current">${escapeHtml(subject.name)}</span></div>
      <div class="page-head">
        <div><h1>${escapeHtml(subject.name)}</h1><div class="subtitle">${subject.topics.length} topics</div></div>
        <button class="btn btn-accent" id="addTopicBtn">+ Create Topic</button>
      </div>
      <div class="admin-list" id="topicList"></div>
    `;
    document.getElementById("addTopicBtn").onclick = () => promptCreate("Create topic", "Topic name", async (name) => {
      await Api.createTopic(subjectId, name);
      Toast.success("Topic created.");
      renderTopics(subjectId);
    });
    const list = document.getElementById("topicList");
    if (!subject.topics.length) {
      list.innerHTML = `<div class="empty-state"><h3>No topics yet</h3></div>`;
      return;
    }
    list.innerHTML = subject.topics.map((t) => rowTemplate(t.id, t.name, `${t.cardCount} cards`, `#/topic/${t.id}`)).join("");
    wireRow(list, {
      onOpen: (id) => location.hash = `#/topic/${id}`,
      onRename: (id, name) => promptRename("Rename topic", name, async (newName) => {
        await Api.renameTopic(id, newName);
        Toast.success("Renamed.");
        renderTopics(subjectId);
      }),
      onDelete: (id, name) => confirmDelete("Delete topic", `Delete "${name}"? This will also delete all images inside it from Google Drive.`, async () => {
        await Api.deleteTopic(id);
        Toast.success("Topic deleted.");
        renderTopics(subjectId);
      }),
      onReorder: async (orderedIds) => { await Api.reorderTopics(subjectId, orderedIds); }
    });
    enableDragReorder(list, ".admin-row");
  }

  // ---------------- Images ----------------
  async function renderImages(topicId) {
    mount.innerHTML = `<p>Loading…</p>`;
    const data = await Api.getTopic(topicId);
    if (!data || !data.topic) { mount.innerHTML = `<div class="empty-state"><h3>Topic not found</h3></div>`; return; }
    const { topic, images, subject } = data;
    mount.innerHTML = `
      <div class="breadcrumbs">
        <a href="#/">Subjects</a><span class="sep">/</span>
        <a href="#/subject/${subject.id}">${escapeHtml(subject.name)}</a><span class="sep">/</span>
        <span class="current">${escapeHtml(topic.name)}</span>
      </div>
      <div class="page-head">
        <div><h1>${escapeHtml(topic.name)}</h1><div class="subtitle" id="cardCountLabel">${images.length} cards</div></div>
        <button class="btn btn-ghost btn-sm" id="renameTopicBtn">Rename topic</button>
      </div>
      <div class="dropzone" id="dropzone">
        <div>Drag & drop images here, or click to choose files</div>
        <div style="font-size:0.78rem; margin-top:4px;">JPG, JPEG, PNG, WEBP · multiple files supported</div>
        <input type="file" id="fileInput" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple style="display:none;">
      </div>
      <div id="progressPanel"></div>
      <div class="image-grid" id="imageGrid"></div>
    `;

    document.getElementById("renameTopicBtn").onclick = () => promptRename("Rename topic", topic.name, async (newName) => {
      await Api.renameTopic(topic.id, newName);
      Toast.success("Renamed.");
      renderImages(topicId);
    });

    renderImageGrid(images, topicId);
    wireUpload(topicId, images);
  }

  function renderImageGrid(images, topicId) {
    const grid = document.getElementById("imageGrid");
    if (!images.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><h3>No cards yet</h3><p>Upload images to get started.</p></div>`;
      return;
    }
    grid.innerHTML = images.map((img, i) => `
      <div class="image-card" draggable="true" data-id="${img.id}" data-file-id="${img.fileId}">
        <span class="idx-badge">${i + 1}</span>
        <div class="loader" style="margin:auto;"></div>
        <button class="del-btn" data-id="${img.id}" title="Delete card" aria-label="Delete card">✕</button>
      </div>
    `).join("");

    grid.querySelectorAll(".image-card").forEach((card) => {
      Api.getImageDataUri(card.dataset.fileId)
        .then((dataUri) => {
          const loader = card.querySelector(".loader");
          if (loader) loader.remove();
          const img = document.createElement("img");
          img.src = dataUri;
          img.alt = "";
          card.insertBefore(img, card.querySelector(".del-btn"));
        })
        .catch((err) => {
          const loader = card.querySelector(".loader");
          if (loader) loader.outerHTML = `<div style="font-size:0.7rem; color:var(--danger); text-align:center; padding:8px;">Failed to load</div>`;
          console.error(err);
        });
    });

    grid.querySelectorAll(".del-btn").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        confirmDelete("Delete card", "Delete this image? It will be removed from Google Drive.", async () => {
          await Api.deleteImage(btn.dataset.id);
          Toast.success("Deleted.");
          renderImages(topicId);
        });
      };
    });
    enableDragReorder(grid, ".image-card", async (orderedIds) => {
      await Api.reorderImages(topicId, orderedIds);
    });
  }

  function wireUpload(topicId, currentImages) {
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("fileInput");
    dropzone.onclick = () => fileInput.click();
    fileInput.onchange = () => handleFiles(fileInput.files);
    ["dragover", "dragenter"].forEach((ev) => dropzone.addEventListener(ev, (e) => {
      e.preventDefault(); dropzone.classList.add("drag-over");
    }));
    ["dragleave", "drop"].forEach((ev) => dropzone.addEventListener(ev, (e) => {
      e.preventDefault(); dropzone.classList.remove("drag-over");
    }));
    dropzone.addEventListener("drop", (e) => {
      if (e.dataTransfer.files && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });

    async function handleFiles(fileList) {
      const files = Array.from(fileList).filter((f) => /image\/(jpeg|png|webp)/.test(f.type));
      if (!files.length) { Toast.error("Please choose JPG, PNG, or WEBP images."); return; }

      const panel = document.getElementById("progressPanel");
      panel.innerHTML = `
        <div class="progress-panel">
          <div id="progressLabel">Uploading… 0 / ${files.length} images</div>
          <div class="progress-bar-track"><div class="progress-bar-fill" id="progressFill" style="width:0%"></div></div>
        </div>
      `;
      const fill = document.getElementById("progressFill");
      const label = document.getElementById("progressLabel");

      let succeeded = 0;
      let failed = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const base64 = await readFileAsBase64(file);
          await Api.uploadImage(topicId, file.name, file.type, base64);
          succeeded++;
        } catch (err) {
          failed++;
          console.error(`Failed to upload ${file.name}`, err);
        }
        const pct = Math.round(((i + 1) / files.length) * 100);
        fill.style.width = pct + "%";
        label.textContent = `Uploading… ${i + 1} / ${files.length} images`;
      }

      if (failed === 0) {
        label.textContent = `Upload complete. ${succeeded} image${succeeded === 1 ? "" : "s"} added.`;
        Toast.success(`Upload complete. ${succeeded} image${succeeded === 1 ? "" : "s"} added.`);
      } else {
        label.textContent = `Upload finished with issues: ${succeeded} of ${files.length} images uploaded successfully.`;
        Toast.error(`Image upload partially failed. ${succeeded} of ${files.length} images uploaded successfully.`);
      }
      setTimeout(() => { panel.innerHTML = ""; }, 5000);
      renderImages(topicId);
    }
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // result is "data:image/png;base64,AAAA..." — strip the prefix
        const result = reader.result;
        const base64 = result.substring(result.indexOf(",") + 1);
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Could not read file " + file.name));
      reader.readAsDataURL(file);
    });
  }

  // ---------------- shared row / drag / modal helpers ----------------
  function rowTemplate(id, title, meta, href) {
    return `
      <div class="admin-row" draggable="true" data-id="${id}">
        <span class="drag-handle">⠿</span>
        <span class="row-title" data-open="${href}">${escapeHtml(title)}</span>
        <span class="row-meta">${escapeHtml(meta)}</span>
        <span class="row-actions">
          <button class="btn btn-ghost btn-sm" data-rename>Rename</button>
          <button class="btn btn-danger btn-sm" data-delete>Delete</button>
        </span>
      </div>
    `;
  }

  function wireRow(container, { onOpen, onRename, onDelete, onReorder }) {
    container.querySelectorAll(".admin-row").forEach((row) => {
      const id = row.dataset.id;
      const titleEl = row.querySelector(".row-title");
      const name = titleEl.textContent;
      titleEl.onclick = () => onOpen(id);
      row.querySelector("[data-rename]").onclick = (e) => { e.stopPropagation(); onRename(id, name); };
      row.querySelector("[data-delete]").onclick = (e) => { e.stopPropagation(); onDelete(id, name); };
    });
    container._onReorder = onReorder;
  }

  function enableDragReorder(container, itemSelector, reorderCallback) {
    let draggedEl = null;
    container.querySelectorAll(itemSelector).forEach((el) => {
      el.addEventListener("dragstart", () => { draggedEl = el; el.classList.add("dragging"); });
      el.addEventListener("dragend", async () => {
        el.classList.remove("dragging");
        const orderedIds = Array.from(container.querySelectorAll(itemSelector)).map((n) => n.dataset.id);
        const cb = reorderCallback || container._onReorder;
        if (cb) {
          try { await cb(orderedIds); } catch (err) { handleApiError(err, "Could not save new order."); }
        }
      });
    });
    container.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!draggedEl) return;
      const after = getDragAfterElement(container, itemSelector, e.clientX, e.clientY);
      if (after == null) container.appendChild(draggedEl);
      else container.insertBefore(draggedEl, after);
    });
  }

  // Finds the element the dragged item should be inserted before, based on
  // whichever sibling's center point is closest to the pointer. Works for
  // both single-column lists and multi-column grids.
  function getDragAfterElement(container, selector, x, y) {
    const els = [...container.querySelectorAll(`${selector}:not(.dragging)`)];
    let closest = { distance: Number.POSITIVE_INFINITY, element: null };
    for (const child of els) {
      const box = child.getBoundingClientRect();
      const centerX = box.left + box.width / 2;
      const centerY = box.top + box.height / 2;
      const dist = Math.hypot(x - centerX, y - centerY);
      const isAfterPointer = (y < centerY) || (Math.abs(y - centerY) < box.height / 2 && x < centerX);
      if (isAfterPointer && dist < closest.distance) closest = { distance: dist, element: child };
    }
    return closest.element;
  }

  // ---------------- modal helpers ----------------
  function openModal(html) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `<div class="modal">${html}</div>`;
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
    return backdrop;
  }

  function promptCreate(title, placeholder, onSubmit) {
    const backdrop = openModal(`
      <h3>${escapeHtml(title)}</h3>
      <input type="text" id="modalInput" placeholder="${escapeHtml(placeholder)}" autofocus>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="modalCancel">Cancel</button>
        <button class="btn btn-primary" id="modalOk">Create</button>
      </div>
    `);
    const input = backdrop.querySelector("#modalInput");
    input.focus();
    backdrop.querySelector("#modalCancel").onclick = () => backdrop.remove();
    const submit = async () => {
      const val = input.value.trim();
      if (!val) return;
      backdrop.querySelector("#modalOk").disabled = true;
      try {
        await onSubmit(val);
        backdrop.remove();
      } catch (err) {
        handleApiError(err, "Could not save.");
        backdrop.querySelector("#modalOk").disabled = false;
      }
    };
    backdrop.querySelector("#modalOk").onclick = submit;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  }

  function promptRename(title, currentName, onSubmit) {
    const backdrop = openModal(`
      <h3>${escapeHtml(title)}</h3>
      <input type="text" id="modalInput" value="${escapeHtml(currentName)}">
      <div class="modal-actions">
        <button class="btn btn-ghost" id="modalCancel">Cancel</button>
        <button class="btn btn-primary" id="modalOk">Save</button>
      </div>
    `);
    const input = backdrop.querySelector("#modalInput");
    input.focus(); input.select();
    backdrop.querySelector("#modalCancel").onclick = () => backdrop.remove();
    const submit = async () => {
      const val = input.value.trim();
      if (!val || val === currentName) { backdrop.remove(); return; }
      backdrop.querySelector("#modalOk").disabled = true;
      try {
        await onSubmit(val);
        backdrop.remove();
      } catch (err) {
        handleApiError(err, "Could not rename.");
        backdrop.querySelector("#modalOk").disabled = false;
      }
    };
    backdrop.querySelector("#modalOk").onclick = submit;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  }

  function confirmDelete(title, message, onConfirm) {
    const backdrop = openModal(`
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="modalCancel">Cancel</button>
        <button class="btn btn-danger" id="modalOk">Delete</button>
      </div>
    `);
    backdrop.querySelector("#modalCancel").onclick = () => backdrop.remove();
    backdrop.querySelector("#modalOk").onclick = async () => {
      backdrop.querySelector("#modalOk").disabled = true;
      try {
        await onConfirm();
        backdrop.remove();
      } catch (err) {
        handleApiError(err, "Could not delete.");
        backdrop.querySelector("#modalOk").disabled = false;
      }
    };
  }

  return { boot };
})();

document.addEventListener("DOMContentLoaded", Admin.boot);
