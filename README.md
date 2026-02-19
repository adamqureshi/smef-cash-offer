# SMEF Cash Offer (Front-End MVP)

This repo is a **mobile-first, grayscale** lead-intake flow for **Sell My Exotic FAST (SMEF)**.

**What it does**
- BIG VIN input with **17-character validation**
- VIN decode via **NHTSA vPIC** (Year / Make / Model / Trim)
- ZIP decode to City/State (US) via **Zippopotam.us**
- Dealer-ready intake questions (condition, title/loan, timeline, location)
- Validates **mobile + email**
- Media step (select photos/video or paste Dropbox/Drive link)
- Clear multi-step progress + review screen with **Edit** links
- Optional **SMEF chat bubble** (rule-based MVP) that helps fill the form

> ⚠️ This is a **front-end** MVP. By default it runs in **Demo mode** (no lead is sent anywhere).  
> To capture leads, connect an endpoint (Azure Function) or enable FormSubmit.

---

## Files
- `index.html`
- `styles.css`
- `app.js`
- `icon.png` (place in repo root)

---

## Run locally
Just open `index.html` in a browser.

For best results, serve the folder with a local dev server:
- VS Code: “Live Server”
- Node: `npx serve`
- Python: `python -m http.server 8080`

---

## Enable lead capture (optional)
### Option A (recommended): Azure backend
Set a global JS var before `app.js`, or in console:

```js
window.SMEF_API_ENDPOINT = "https://<your-function-app>.azurewebsites.net/api/leads";
```

Then implement your backend to accept `multipart/form-data` with:
- `payload` (JSON string)
- `photo_1 ... photo_50` (optional)
- `video` (optional)

### Option B: FormSubmit (no backend)
In `app.js`, set:

```js
formsubmitEmail: "leads@yourdomain.com"
```

This sends the JSON payload to your email. (Uploads are not included in the FormSubmit path.)

---

## Backend notes (Azure)
A clean Azure MVP stack:
- **Azure Functions (HTTP trigger)**: `/api/leads`
- **Azure Blob Storage**: store photos/video (container per lead)
- **Cosmos DB** (or Table Storage): store lead JSON
- **SendGrid** (or Azure Communication Services): email/SMS notifications
- **Key Vault**: store secrets (SendGrid key, storage connection string)
- Optional: **Queue Storage / Service Bus** for asynchronous dealer routing

Dealer routing logic (v1 idea):
- Match by:
  - make/model/price band
  - ZIP radius / region coverage
  - dealer preferences (ex: “Ferrari only”, “Lambo only”, etc.)
- Send the dealer a “Lead packet” link (secure, expiring) containing:
  - vehicle details
  - media links
  - contact info (only when dealer is approved)

Security basics:
- Rate limit / bot protection (hCaptcha / Cloudflare Turnstile)
- File size limits + MIME validation on upload
- Virus scan on Blob (Defender for Storage or third-party)

---

## Business model language
If you need wording that is clear + compliant:
- “We are not a dealer. We connect sellers with independent dealer buyers.”
- “If a dealer purchases a vehicle from our introduction, the dealer may pay us a referral success fee.”

Common name ideas for your $750–$1,000 fee:
- **Referral Success Fee**
- **Closed-Deal Fee**
- **Buyer Network Success Fee**
- **Introduced Transaction Fee**

---

## Data sources
- VIN decoding: NHTSA vPIC `decodevinvaluesextended`
- ZIP decode: Zippopotam.us

---

## Footer
Made in NYC. Another QURESHI Media LLC project. Independent. © 2026 https://qureshimedia.com/
