/**
 * ============================================================
 *  CONFIGURATION — EDIT THESE TWO VALUES BEFORE DEPLOYING
 * ============================================================
 *
 * API_URL:
 *   The URL you get after deploying the Google Apps Script
 *   project as a Web App. Looks like:
 *   https://script.google.com/macros/s/XXXXXXXXXXXXXXXX/exec
 *
 * GOOGLE_CLIENT_ID:
 *   A PUBLIC OAuth 2.0 Client ID (Web application type) created
 *   in Google Cloud Console, used only for "Sign in with Google"
 *   on the admin page. This value is NOT a secret — Google's own
 *   Identity Services library is designed to have this id be
 *   public and embedded in frontend code. No client secret,
 *   refresh token, or private key is ever used or stored here.
 *
 *   See README.md section "Google Sign-In setup" for how to
 *   create this Client ID (2 minutes, no billing required).
 * ============================================================
 */
const CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbyZkWl7c-VR3aSqOu-Y85ovVpB6GB43I4So_D5mlgf_XBO3pigld3iHwCkXtUFf5n_W/exec",
  GOOGLE_CLIENT_ID: "454289766628-f6kmn82t7fd855jl164df22qg79h27dt.apps.googleusercontent.com",
  SITE_TITLE: "My Study Cards"
};
