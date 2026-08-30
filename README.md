# Study Flashcards

A study flashcard website: the frontend is a static site (GitHub Pages), the
backend is a Google Apps Script web app, and every image is actually stored
in **your Google Drive**. Viewers browse a clean flashcard interface and
never see Drive. You (the admin) sign in with your Google account to manage
subjects, topics, and images.

```
Browser  →  GitHub Pages (static HTML/CSS/JS)  →  Google Apps Script (API)  →  Google Drive (images) + Google Sheet (metadata)
```

---

## 1. Architecture

**Frontend** (`study-flashcards/` — deploy to GitHub Pages)
- `index.html` / `admin.html` — the two pages: public viewer and admin dashboard
- `js/config.js` — the two values you must fill in (API URL, OAuth Client ID)
- `js/api.js` — talks to the Apps Script backend
- `js/auth.js` — "Sign in with Google" for the admin page
- `js/viewer.js` — the flashcard viewer (page-turn animation, swipe, fullscreen, lazy loading)
- `js/app.js` — public site (routing, search)
- `js/admin.js` — admin dashboard (CRUD, drag-reorder, uploads)

**Backend** (`apps-script/` — deploy via script.google.com)
- `Code.gs` — the API router (read endpoints + authorized write endpoints)
- `Config.gs` — **you edit this**: your admin email(s) and OAuth Client ID
- `AuthService.gs` — verifies Google sign-in tokens server-side
- `DriveService.gs` — creates folders, uploads/deletes files, sets sharing
- `MetadataService.gs` — reads/writes the metadata Google Sheet
- `Utils.gs` — small shared helpers
- `appsscript.json` — permissions/deployment manifest

**Storage**
- Google Drive holds the actual image files, organized as
  `Study Flashcards / <Subject> / <Topic> / 001_name.jpg …`
- A Google Sheet (created automatically, titled "Study Flashcards — Metadata
  (do not edit manually)") holds the structured data: stable IDs, display
  names, Drive folder/file references, and explicit ordering. It lives
  inside the same root Drive folder and is never exposed to the public site
  — only the backend reads it.

---

## 2. Why this is secure (read this before deploying)

- **No password ever lives in the GitHub Pages code.** The admin page uses
  Google's own "Sign in with Google" widget. The `GOOGLE_CLIENT_ID` in
  `js/config.js` is a *public* identifier — it is designed to be embedded in
  frontend code and is not a secret (Google's docs are explicit about this).
- **Authorization happens on the server, not the browser.** When you sign
  in, Google gives your browser a signed ID token. The Apps Script backend
  independently asks Google to validate that token, checks it was issued
  for *this* app, and checks your email against `ADMIN_EMAILS` in
  `Config.gs`. If someone edits the JavaScript running in their own browser,
  or calls the API directly with curl/Postman, they still cannot produce a
  token that passes this check for an email that isn't theirs.
- **Every write endpoint re-checks authorization independently** — the
  frontend hiding admin buttons from viewers is a UX nicety, not the
  security boundary. `deleteSubject`, `uploadImage`, etc. all call
  `requireAdmin(idToken)` before touching Drive.
- **Only the study library is public, not your whole Drive.** Each
  uploaded image file individually gets "Anyone with the link can view"
  sharing. Nothing else in your Drive is touched or exposed.
- **No OAuth client secret, refresh token, or service-account key is used
  anywhere.** Apps Script itself already has authorized access to your
  Drive/Sheets (via the scopes in `appsscript.json`) because you're the one
  deploying it — no extra credentials are needed or stored.

---

## 3. Step-by-step setup

### Step A — Create the Apps Script backend

1. Go to [script.google.com](https://script.google.com) and click **New
   project**.
2. Rename the project (e.g. "Study Flashcards Backend").
3. Delete the default `Code.gs` contents, then create each file from the
   `apps-script/` folder in this project with matching names and paste in
   the contents:
   - `Config.gs`, `Utils.gs`, `AuthService.gs`, `DriveService.gs`,
     `MetadataService.gs`, `Code.gs`
   - Use the file `+` button next to "Files" → **Script** for each `.gs` file.
4. Open **Project Settings** (gear icon) → check "Show `appsscript.json`
   manifest file in editor" → then open `appsscript.json` in the editor and
   replace its contents with `apps-script/appsscript.json` from this
   project.

### Step B — Create a Google OAuth Client ID (for admin sign-in)

This is free, takes about 2 minutes, and does not require enabling billing.

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Create a new project (or pick an existing one).
3. Click **Create Credentials → OAuth client ID**.
4. If prompted, configure the **OAuth consent screen** first: choose
   "External", fill in an app name and your email, and save (you don't need
   to submit for verification for personal/testing use — just add your own
   Google account under "Test users" if it stays in "Testing" mode).
5. Application type: **Web application**.
6. Under **Authorized JavaScript origins**, add the exact origin your site
   will be served from, e.g.:
   ```
   https://YOUR-USERNAME.github.io
   ```
   (No trailing slash, no path.)
7. Click **Create**. Copy the **Client ID** (looks like
   `123456-abc.apps.googleusercontent.com`). You do **not** need the client
   secret for anything in this project.

### Step C — Configure the backend

1. Back in the Apps Script editor, open `Config.gs`.
2. Set `ADMIN_EMAILS` to your own Google account email(s), exactly as they
   appear when you sign in with Google, e.g.:
   ```javascript
   const ADMIN_EMAILS = ["you@gmail.com"];
   ```
3. Set `GOOGLE_CLIENT_ID` to the Client ID from Step B.
4. (Optional) Change `ROOT_FOLDER_NAME` if you want a different Drive
   folder name than "Study Flashcards".
5. Save the project (Ctrl/Cmd+S).

### Step D — Deploy the backend as a Web App

1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" → choose **Web app**.
3. Description: anything you like.
4. **Execute as: Me** (your account) — this is what lets the script write
   to Drive on your behalf regardless of who's viewing the public site.
5. **Who has access: Anyone** — this allows the static GitHub Pages site to
   call the API without forcing every viewer to log into Google. (Write
   access is still fully gated by the ID-token check described above —
   "Anyone" here only means anyone can *reach* the API, not that anyone can
   *write*.)
6. Click **Deploy**. The first time, Google will ask you to authorize the
   script's permissions (Drive, Sheets, external requests) — review and
   accept; this is your own script asking for permission to act on your own
   Drive.
7. Copy the **Web app URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxx/exec
   ```

> **If you ever edit the backend code later**, you must create a **new
> deployment version** (Deploy → Manage deployments → edit → New version)
> for the changes to take effect on the existing URL.

### Step E — Configure the frontend

1. Open `study-flashcards/js/config.js`.
2. Set `API_URL` to the Web app URL from Step D.
3. Set `GOOGLE_CLIENT_ID` to the **same** Client ID from Step B.
4. (Optional) Change `SITE_TITLE`.

### Step F — Deploy the frontend to GitHub Pages

1. Create a new GitHub repository, e.g. `study-flashcards`.
2. Upload the entire contents of the `study-flashcards/` folder (not the
   folder itself — `index.html`, `admin.html`, `css/`, `js/`, this
   `README.md`) to the repository root.
3. In the repo, go to **Settings → Pages**.
4. Under "Build and deployment", set **Source: Deploy from a branch**,
   branch: `main` (or whichever branch you pushed to), folder: `/ (root)`.
5. Save. GitHub will give you a URL like:
   ```
   https://YOUR-USERNAME.github.io/study-flashcards/
   ```
6. **Go back to Step B in Google Cloud Console** and double-check the
   "Authorized JavaScript origins" matches this exactly (just the origin,
   `https://YOUR-USERNAME.github.io`, not the full path).

### Step G — First run

1. Visit `https://YOUR-USERNAME.github.io/study-flashcards/admin.html`.
2. Sign in with your Google account (the one in `ADMIN_EMAILS`).
3. You should see "Admin Dashboard" (an empty subjects list, since nothing
   exists yet). The first successful backend call automatically creates the
   "Study Flashcards" folder in your Drive and the metadata spreadsheet.
4. Create a subject, then a topic, then upload a few images.
5. Visit `https://YOUR-USERNAME.github.io/study-flashcards/` (no `admin.html`)
   to see the public viewer.

---

## 4. Testing checklist

```
[ ] Create subject — appears immediately on the site
[ ] Verify a matching folder appeared in Google Drive
[ ] Create topic inside that subject
[ ] Verify a matching subfolder appeared in Google Drive
[ ] Upload one image
[ ] Verify the file appeared in the Drive subfolder
[ ] View the image publicly (open the site in a private/incognito window)
[ ] Upload multiple images at once, watch the progress bar
[ ] Reorder images by dragging
[ ] Refresh the page — verify the new order persists
[ ] Test on a real mobile device: swipe left/right, fullscreen, upload
[ ] Sign into admin.html with a NON-admin Google account — confirm "Access denied"
[ ] While signed in as non-admin, open browser dev tools and try calling
    a write endpoint (e.g. fetch(...) a createSubject POST) directly —
    confirm the backend rejects it with an UNAUTHORIZED error
[ ] Delete an image — confirm it's removed from Drive (check Trash)
[ ] Delete a topic — confirm its images and Drive subfolder are gone
[ ] Rename a subject/topic — confirm the Drive folder ID is unchanged
    (rename doesn't break existing image links)
[ ] Toggle light/dark mode, refresh — preference persists
[ ] Search for a topic name — correct result appears
```

---

## 5. Troubleshooting

**"Failed to fetch" / network error calling the API from GitHub Pages**
Double check `API_URL` in `js/config.js` ends in `/exec` (not `/dev`), and
that the deployment's "Who has access" is set to "Anyone".

**Sign-in button doesn't appear, or sign-in fails silently**
Check that `GOOGLE_CLIENT_ID` matches exactly in both `js/config.js` and
`Config.gs`, and that your GitHub Pages origin is listed under "Authorized
JavaScript origins" in Google Cloud Console (Step B).

**"Access denied" even though you used the right account**
`ADMIN_EMAILS` in `Config.gs` must match your Google account's email
exactly (case doesn't matter, but check for typos). After editing
`Config.gs`, you must create a **new deployment version** for the change to
take effect.

**Images uploaded but don't display**
If your Google account is a Google Workspace account with an organization
policy restricting "anyone with the link" sharing, file sharing will be
blocked. The upload will report a clear "Sharing settings prevented..."
error rather than silently failing. Use a personal Google account, or ask
your Workspace admin to allow link-sharing for this use case.

---

## 6. Security review summary

| Concern | Status |
|---|---|
| Frontend admin password | None used — Google sign-in only |
| OAuth client secret / refresh tokens / service-account keys | Never used or stored |
| Server-side authorization on every write | Yes — `requireAdmin()` on every write action |
| Non-admin calling write API directly | Rejected with `UNAUTHORIZED`, verified server-side |
| Full Drive account exposure | No — only individual uploaded files are link-shared |
| XSS | All dynamic text is inserted via `escapeHtml()` / `textContent`, never raw HTML interpolation of user input |
| Unsafe file names | Sanitized (`sanitizeName()`) before use as Drive file/folder names |
| Malicious file uploads | MIME type allowlist (JPG/PNG/WEBP only) and a max file size enforced server-side |
| Secrets in the GitHub repository | None — `config.js` only contains a public API URL and a public OAuth Client ID |
