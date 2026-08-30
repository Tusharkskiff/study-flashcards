/**
 * api.js
 * Thin wrapper around fetch() for talking to the Google Apps Script backend.
 *
 * IMPORTANT CORS NOTE:
 * Apps Script web apps do not support the browser's CORS "preflight"
 * (OPTIONS) request. To avoid triggering a preflight at all, every POST
 * request below is sent with Content-Type: text/plain;charset=utf-8
 * (a "simple request" per the Fetch spec) even though the body is JSON.
 * The backend parses it as JSON regardless of the declared content type.
 * Do not change this to 'application/json' or add custom headers —
 * doing so will break cross-origin requests from GitHub Pages.
 */

const Api = (() => {
  async function readAction(action, params = {}) {
    const url = new URL(CONFIG.API_URL);
    url.searchParams.set("action", action);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });
    const res = await fetch(url.toString(), { method: "GET" });
    return parseResponse(res);
  }

  async function writeAction(action, payload = {}) {
    const idToken = Auth.getIdToken();
    const body = JSON.stringify({ action, idToken, payload });
    const res = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body
    });
    return parseResponse(res);
  }

  async function parseResponse(res) {
    let data;
    try {
      data = await res.json();
    } catch (err) {
      throw new ApiError("Unable to reach the backend. Please check your connection and try again.", "NETWORK_ERROR");
    }
    if (!data || data.ok !== true) {
      const message = (data && data.error) || "Something went wrong.";
      const code = (data && data.code) || "UNKNOWN_ERROR";
      throw new ApiError(message, code);
    }
    return data.data;
  }

  class ApiError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  }

  const imageCache = new Map(); // fileId -> "data:mime;base64,..." (in-memory, per page load)

  async function getImageDataUri(fileId) {
    if (imageCache.has(fileId)) return imageCache.get(fileId);
    const data = await readAction("getImage", { fileId });
    const uri = `data:${data.mimeType};base64,${data.base64}`;
    imageCache.set(fileId, uri);
    return uri;
  }

  return {
    // ---- public / read-only ----
    getLibrary: () => readAction("getLibrary"),
    getTopic: (topicId) => readAction("getTopic", { topicId }),
    getImageDataUri,
    search: (query) => readAction("search", { query }),

    // ---- admin / write ----
    checkAdmin: () => writeAction("checkAdmin"),
    createSubject: (name) => writeAction("createSubject", { name }),
    renameSubject: (id, name) => writeAction("renameSubject", { id, name }),
    deleteSubject: (id) => writeAction("deleteSubject", { id }),
    reorderSubjects: (orderedIds) => writeAction("reorderSubjects", { orderedIds }),

    createTopic: (subjectId, name) => writeAction("createTopic", { subjectId, name }),
    renameTopic: (id, name) => writeAction("renameTopic", { id, name }),
    deleteTopic: (id) => writeAction("deleteTopic", { id }),
    reorderTopics: (subjectId, orderedIds) => writeAction("reorderTopics", { subjectId, orderedIds }),

    uploadImage: (topicId, name, mimeType, base64Data) =>
      writeAction("uploadImage", { topicId, name, mimeType, base64Data }),
    deleteImage: (id) => writeAction("deleteImage", { id }),
    reorderImages: (topicId, orderedIds) => writeAction("reorderImages", { topicId, orderedIds }),
    renameImage: (id, name) => writeAction("renameImage", { id, name }),

    ApiError
  };
})();
