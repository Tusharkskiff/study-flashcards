/**
 * auth.js
 * Handles "Sign in with Google" for the admin page using Google Identity
 * Services (GIS). We never store or check a password in this frontend code.
 *
 * Flow:
 *  1. Admin clicks the Google Sign-In button rendered by GIS.
 *  2. Google returns a signed ID token (a JWT) proving the admin's identity.
 *  3. We store that token in sessionStorage (cleared when the tab closes)
 *     and send it with every admin API call.
 *  4. The Apps Script backend independently verifies the token's signature
 *     and expiry with Google, then checks the email against a server-side
 *     allowlist. The frontend's opinion of "am I admin" is never trusted.
 */

const Auth = (() => {
  const TOKEN_KEY = "sf_id_token";
  const PROFILE_KEY = "sf_profile";
  let onSignInCallback = null;

  function init(onSignIn) {
    onSignInCallback = onSignIn;
    if (!window.google || !google.accounts || !google.accounts.id) {
      console.error("Google Identity Services library did not load.");
      return;
    }
    google.accounts.id.initialize({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
      auto_select: false
    });
  }

  /**
   * The GIS script tag loads with async/defer, so it can finish loading
   * AFTER our own code has already run once on DOMContentLoaded. Callers
   * should await this before calling init()/renderButton() to avoid a
   * race where the sign-in button silently never appears.
   */
  function ready(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      if (window.google && google.accounts && google.accounts.id) {
        resolve();
        return;
      }
      const start = Date.now();
      const interval = setInterval(() => {
        if (window.google && google.accounts && google.accounts.id) {
          clearInterval(interval);
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          reject(new Error(
            "Google Sign-In didn't load. This is usually an ad blocker/privacy " +
            "extension blocking accounts.google.com, or a network issue. " +
            "Disable any blocker for this site and refresh."
          ));
        }
      }, 100);
    });
  }

  function renderButton(el) {
    if (!window.google || !google.accounts || !google.accounts.id) return;
    google.accounts.id.renderButton(el, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "pill"
    });
  }

  function handleCredentialResponse(response) {
    // response.credential is the signed Google ID token (JWT)
    sessionStorage.setItem(TOKEN_KEY, response.credential);
    try {
      const payload = decodeJwtPayload(response.credential);
      sessionStorage.setItem(PROFILE_KEY, JSON.stringify({
        email: payload.email,
        name: payload.name,
        picture: payload.picture
      }));
    } catch (e) { /* non-fatal, backend still verifies the token */ }
    if (onSignInCallback) onSignInCallback();
  }

  function decodeJwtPayload(jwt) {
    const base64Url = jwt.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  }

  function getIdToken() {
    return sessionStorage.getItem(TOKEN_KEY) || null;
  }

  function getProfile() {
    const raw = sessionStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function isSignedIn() {
    return !!getIdToken();
  }

  function signOut() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(PROFILE_KEY);
    if (window.google && google.accounts && google.accounts.id) {
      google.accounts.id.disableAutoSelect();
    }
  }

  return { init, ready, renderButton, getIdToken, getProfile, isSignedIn, signOut };
})();
