/* SMEF Cash Offer - Front-end flow (no backend required for demo)
   - VIN decoding: NHTSA vPIC (decodevinvaluesextended)
   - ZIP decode: Zippopotam.us (US ZIP → city/state)

   To connect a backend later, set:
     window.SMEF_API_ENDPOINT = "https://<your-azure-function>/api/leads"
   Or edit SMEF_CONFIG below.
*/

const SMEF_CONFIG = {
  // Option A: your own backend endpoint (recommended)
  apiEndpoint: window.SMEF_API_ENDPOINT || "",

  // Option B (optional): FormSubmit.co (no backend)
  // Set to your email to enable. Example: "leads@yourdomain.com"
  // Docs: https://formsubmit.co/
  formsubmitEmail: ""
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const form = $("#smefForm");
const steps = $$(".step");
const stepperItems = $$(".stepper__item");
const stepperBarFill = $("#stepperBarFill");

let currentStep = 1;
let maxStepReached = 1;
let vinOptionalMode = false;
let lastSubmissionPayload = null;

function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

function setStatus(el, html){
  if (!el) return;
  el.innerHTML = html || "";
}

function showStep(stepId){
  steps.forEach(s => {
    const id = s.getAttribute("data-step");
    s.hidden = id !== String(stepId);
  });

  // Success screen is special
  if (stepId === "success"){
    currentStep = 7;
  } else {
    currentStep = Number(stepId);
  }

  maxStepReached = Math.max(maxStepReached, currentStep);
  updateStepper();

  // Scroll nicely to top of panel
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (String(stepId) === "7") buildReview();
}

function updateStepper(){
  const total = 7;
  const pct = ((currentStep - 1) / (total - 1)) * 100;
  stepperBarFill.style.width = `${clamp(pct, 0, 100)}%`;

  stepperItems.forEach(item => {
    const s = Number(item.getAttribute("data-step"));
    item.classList.toggle("is-active", s === currentStep);
    item.classList.toggle("is-done", s < currentStep);
    item.classList.toggle("is-disabled", s > maxStepReached + 0); // future steps
    const btn = $(".stepper__btn", item);
    btn.disabled = s > maxStepReached;
    btn.setAttribute("aria-current", s === currentStep ? "step" : "false");
  });
}

function normalizeVin(raw){
  return (raw || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function validateVin(vin){
  const cleaned = normalizeVin(vin);

  if (!cleaned) return { ok: false, msg: "Please enter a VIN." };
  if (cleaned.length !== 17) return { ok: false, msg: "VIN must be 17 characters." };
  if (/[IOQ]/.test(cleaned)) return { ok: false, msg: "VIN cannot contain I, O, or Q." };
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleaned)) return { ok: false, msg: "VIN has invalid characters." };

  return { ok: true, msg: "" };
}

function digitsOnly(s){ return (s || "").replace(/\D/g, ""); }

function validatePhone(phone){
  const digits = digitsOnly(phone);
  if (!digits) return { ok: false, msg: "Please enter a mobile number." };
  if (digits.length < 10) return { ok: false, msg: "Mobile number looks too short." };
  return { ok: true, msg: "" };
}

function validateZip(zip){
  const z = (zip || "").trim();
  if (!z) return { ok: false, msg: "Please enter a ZIP code." };
  if (!/^\d{5}$/.test(z)) return { ok: false, msg: "ZIP must be 5 digits." };
  return { ok: true, msg: "" };
}

function setFieldError(fieldNameOrId, msg){
  // Supports:
  // - <div class="field-error" data-error-for="xyz">
  // - special VIN error element
  if (fieldNameOrId === "vin"){
    $("#vinError").textContent = msg || "";
    return;
  }
  const el = document.querySelector(`[data-error-for="${CSS.escape(fieldNameOrId)}"]`);
  if (el) el.textContent = msg || "";
}

function clearErrorsInStep(stepNumber){
  const step = steps.find(s => s.getAttribute("data-step") === String(stepNumber));
  if (!step) return;
  $$(".field-error", step).forEach(e => (e.textContent = ""));
  if (stepNumber === 1) $("#vinError").textContent = "";
}

function getFieldValue(name){
  const el = form.elements[name];
  if (!el) return "";

  // Radio group
  if (el instanceof RadioNodeList){
    return el.value || "";
  }

  // Normal input/select
  return el.value || "";
}

function setFieldValue(name, value){
  const el = form.elements[name];
  if (!el) return;

  if (el instanceof RadioNodeList){
    // Try to set matching radio
    const radios = $$(`input[type="radio"][name="${CSS.escape(name)}"]`, form);
    radios.forEach(r => (r.checked = r.value === value));
    return;
  }

  el.value = value ?? "";
}

function setRadioByGuess(name, raw){
  const v = (raw || "").toLowerCase();
  const radios = $$(`input[type="radio"][name="${CSS.escape(name)}"]`, form);
  const map = radios.map(r => ({ value: r.value, key: r.value.toLowerCase() }));

  const match =
    map.find(x => v.includes("title") && x.key.includes("title")) ||
    map.find(x => (v.includes("loan") || v.includes("finance")) && x.key.includes("financed")) ||
    map.find(x => v.includes("lease") && x.key.includes("lease")) ||
    map.find(x => x.key.includes(v));

  if (match) setFieldValue(name, match.value);
}

function validateStep(stepNumber){
  clearErrorsInStep(stepNumber);

  if (stepNumber === 1){
    const vinInput = $("#vin");
    const vin = normalizeVin(vinInput.value);
    vinInput.value = vin;

    if (!vin && vinOptionalMode){
      return true;
    }
    const v = validateVin(vin);
    if (!v.ok){
      setFieldError("vin", v.msg);
      return false;
    }
    return true;
  }

  if (stepNumber === 2){
    let ok = true;
    const year = getFieldValue("year").trim();
    const make = getFieldValue("make").trim();
    const model = getFieldValue("model").trim();
    const condition = getFieldValue("condition");
    const accident = getFieldValue("accident");
    const mods = getFieldValue("mods");

    if (!/^\d{4}$/.test(year)){ setFieldError("year", "Enter a 4-digit year."); ok = false; }
    if (!make){ setFieldError("make", "Make is required."); ok = false; }
    if (!model){ setFieldError("model", "Model is required."); ok = false; }
    if (!condition){ setFieldError("condition", "Select a condition."); ok = false; }
    if (!accident){ setFieldError("accident", "Select accident history."); ok = false; }
    if (!mods){ setFieldError("mods", "Select modification status."); ok = false; }

    return ok;
  }

  if (stepNumber === 3){
    let ok = true;
    const title = getFieldValue("title_status");
    const timeline = getFieldValue("timeline");
    if (!title){ setFieldError("title_status", "Select one."); ok = false; }
    if (!timeline){ setFieldError("timeline", "Select one."); ok = false; }
    return ok;
  }

  if (stepNumber === 4){
    let ok = true;
    const zip = getFieldValue("zip");
    const z = validateZip(zip);
    if (!z.ok){ setFieldError("zip", z.msg); ok = false; }

    const driveable = getFieldValue("driveable");
    if (!driveable){ setFieldError("driveable", "Select one."); ok = false; }

    const city = getFieldValue("city");
    const state = getFieldValue("state");
    if (ok && (!city || !state)){
      // Not fatal; but nudge
      setStatus($("#zipStatus"), `<span class="bad">Couldn’t decode ZIP. You can still continue.</span>`);
    }

    return ok;
  }

  if (stepNumber === 5){
    let ok = true;
    const name = getFieldValue("full_name").trim();
    const phone = getFieldValue("mobile");
    const emailEl = $("#email");
    const pref = getFieldValue("contact_pref");
    const consent = $("#consent").checked;

    if (!name){ setFieldError("full_name", "Name is required."); ok = false; }

    const p = validatePhone(phone);
    if (!p.ok){ setFieldError("mobile", p.msg); ok = false; }

    if (!emailEl.value.trim()){
      setFieldError("email", "Email is required.");
      ok = false;
    } else if (!emailEl.checkValidity()){
      setFieldError("email", "Enter a valid email.");
      ok = false;
    }

    if (!pref){ setFieldError("contact_pref", "Select a preference."); ok = false; }
    if (!consent){ setFieldError("consent", "Please check the consent box."); ok = false; }

    return ok;
  }

  if (stepNumber === 6){
    // Media is optional, but enforce photo count
    const photos = $("#photos").files || [];
    if (photos.length > 50){
      setFieldError("photos", "Max 50 photos.");
      return false;
    }
    return true;
  }

  return true;
}

/* -------- VIN Decode (NHTSA) -------- */
let lastDecoded = { year: "", make: "", model: "", trim: "" };
let vinDecoded = false;

async function decodeVin(vin){
  const statusEl = $("#decodeStatus");
  vinDecoded = false;

  const normalized = normalizeVin(vin);
  const v = validateVin(normalized);
  if (!v.ok){
    setFieldError("vin", v.msg);
    setStatus(statusEl, "");
    $("#decodedCard").hidden = true;
    return null;
  }

  setFieldError("vin", "");
  setStatus(statusEl, "Decoding VIN…");

  try{
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvaluesextended/${encodeURIComponent(normalized)}?format=json`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const row = data?.Results?.[0] || {};
    const year = (row.ModelYear || "").trim();
    const make = (row.Make || "").trim();
    const model = (row.Model || "").trim();
    const trim = (row.Trim || "").trim();

    lastDecoded = { year, make, model, trim };

    // NHTSA sometimes returns "0" or blanks
    const hasBasics = Boolean(year && make && model);

    if (hasBasics){
      vinDecoded = true;
      setStatus(statusEl, `<span class="ok">Decoded: ${escapeHtml(year)} ${escapeHtml(make)} ${escapeHtml(model)}</span>`);
      updateDecodedCard(lastDecoded);

      // Prefill step 2 fields
      setFieldValue("year", year);
      setFieldValue("make", make);
      setFieldValue("model", model);
      setFieldValue("trim", trim);
    } else {
      setStatus(statusEl, `<span class="bad">Decoded, but some details are missing. You can enter Year/Make/Model manually on the next step.</span>`);
      updateDecodedCard(lastDecoded, true);
    }

    return lastDecoded;
  }catch(err){
    console.error(err);
    setStatus(statusEl, `<span class="bad">Couldn’t decode VIN right now. You can continue and enter Year/Make/Model manually.</span>`);
    $("#decodedCard").hidden = true;
    return null;
  }
}

function updateDecodedCard({year, make, model, trim}, isPartial=false){
  $("#decodedCard").hidden = false;
  $("#kvYear").textContent = year || "—";
  $("#kvMake").textContent = make || "—";
  $("#kvModel").textContent = model || "—";
  $("#kvTrim").textContent = trim || "—";

  if (year && make && model){
    $("#decodedTitle").textContent = `${year} ${make} ${model}`;
    $("#decodedSub").textContent = isPartial ? "Some details may be missing — please verify." : "Verify details below.";
  } else {
    $("#decodedTitle").textContent = "VIN decoded (partial)";
    $("#decodedSub").textContent = "Please verify Year/Make/Model on the next step.";
  }
}

/* -------- ZIP Decode -------- */
async function decodeZip(zip){
  const statusEl = $("#zipStatus");
  const z = (zip || "").trim();
  const v = validateZip(z);
  if (!v.ok){
    setFieldError("zip", v.msg);
    setStatus(statusEl, "");
    return null;
  }

  setFieldError("zip", "");
  setStatus(statusEl, "Looking up ZIP…");

  try{
    const res = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(z)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const place = data?.places?.[0];
    const city = place?.["place name"] || "";
    const state = place?.["state abbreviation"] || "";
    setFieldValue("city", city);
    setFieldValue("state", state);
    setStatus(statusEl, `<span class="ok">${escapeHtml(city)}, ${escapeHtml(state)}</span>`);
    return { city, state };
  }catch(err){
    console.warn(err);
    setStatus(statusEl, `<span class="bad">Couldn’t decode ZIP automatically.</span>`);
    // Keep city/state editable? It's readonly in HTML; for failure, allow manual:
    $("#city").readOnly = false;
    $("#state").readOnly = false;
    return null;
  }
}

/* -------- Media helpers -------- */
function summarizeFiles(fileList){
  const files = Array.from(fileList || []);
  if (!files.length) return "";
  const totalBytes = files.reduce((acc, f) => acc + (f.size || 0), 0);
  return `${files.length} file(s) • ${formatBytes(totalBytes)}`;
}

function formatBytes(bytes){
  if (!bytes && bytes !== 0) return "";
  const units = ["B","KB","MB","GB"];
  let b = bytes;
  let i = 0;
  while (b >= 1024 && i < units.length - 1){
    b /= 1024;
    i++;
  }
  return `${b.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/* -------- Review -------- */
function buildSubmissionPayload(){
  const payload = {
    submitted_at: new Date().toISOString(),
    vin: normalizeVin(getFieldValue("vin")),
    vehicle: {
      year: getFieldValue("year").trim(),
      make: getFieldValue("make").trim(),
      model: getFieldValue("model").trim(),
      trim: getFieldValue("trim").trim(),
      mileage: getFieldValue("mileage").trim(),
      condition: getFieldValue("condition"),
      accident_history: getFieldValue("accident"),
      modifications: getFieldValue("mods"),
      notes: getFieldValue("notes").trim()
    },
    ownership: {
      title_status: getFieldValue("title_status"),
      lender: getFieldValue("lender").trim(),
      payoff: getFieldValue("payoff").trim(),
      timeline: getFieldValue("timeline")
    },
    location: {
      zip: getFieldValue("zip").trim(),
      city: getFieldValue("city").trim(),
      state: getFieldValue("state").trim(),
      driveable: getFieldValue("driveable"),
      pickup_preference: getFieldValue("pickup")
    },
    contact: {
      name: getFieldValue("full_name").trim(),
      mobile: getFieldValue("mobile").trim(),
      email: getFieldValue("email").trim(),
      preferred_contact: getFieldValue("contact_pref")
    },
    media: {
      photo_count: ($("#photos").files || []).length,
      photo_names: Array.from($("#photos").files || []).map(f => f.name).slice(0, 50),
      video_name: ($("#video").files || [])[0]?.name || "",
      link: getFieldValue("media_link").trim()
    },
    meta: {
      vin_decoded: vinDecoded,
      user_agent: navigator.userAgent
    }
  };

  return payload;
}

function buildReview(){
  const el = $("#reviewBlock");
  if (!el) return;

  const payload = buildSubmissionPayload();
  lastSubmissionPayload = payload;

  const cards = [
    {
      title: "VIN & decoded",
      step: 1,
      rows: [
        ["VIN", payload.vin || "(not provided)"],
        ["Decoded", payload.meta.vin_decoded ? "Yes (NHTSA)" : "No / partial"]
      ]
    },
    {
      title: "Vehicle",
      step: 2,
      rows: [
        ["Year/Make/Model", `${payload.vehicle.year} ${payload.vehicle.make} ${payload.vehicle.model}`.trim() || "—"],
        ["Trim", payload.vehicle.trim || "—"],
        ["Mileage", payload.vehicle.mileage || "—"],
        ["Condition", payload.vehicle.condition || "—"],
        ["Accident history", payload.vehicle.accident_history || "—"],
        ["Modifications", payload.vehicle.modifications || "—"],
        ["Notes", payload.vehicle.notes || "—"]
      ]
    },
    {
      title: "Ownership",
      step: 3,
      rows: [
        ["Title status", payload.ownership.title_status || "—"],
        ["Lender", payload.ownership.lender || "—"],
        ["Payoff", payload.ownership.payoff || "—"],
        ["Timeline", payload.ownership.timeline || "—"]
      ]
    },
    {
      title: "Location",
      step: 4,
      rows: [
        ["ZIP", payload.location.zip || "—"],
        ["City/State", `${payload.location.city || "—"}, ${payload.location.state || "—"}`],
        ["Drivable", payload.location.driveable || "—"],
        ["Pickup", payload.location.pickup_preference || "—"]
      ]
    },
    {
      title: "Contact",
      step: 5,
      rows: [
        ["Name", payload.contact.name || "—"],
        ["Mobile", payload.contact.mobile || "—"],
        ["Email", payload.contact.email || "—"],
        ["Preferred contact", payload.contact.preferred_contact || "—"]
      ]
    },
    {
      title: "Media",
      step: 6,
      rows: [
        ["Photos selected", String(payload.media.photo_count || 0)],
        ["Video selected", payload.media.video_name || "—"],
        ["Dropbox/Drive link", payload.media.link || "—"]
      ]
    }
  ];

  el.innerHTML = cards.map(card => `
    <div class="review-card">
      <div class="review-card__top">
        <h3>${escapeHtml(card.title)}</h3>
        <button type="button" class="edit-link" data-jump="${card.step}">Edit</button>
      </div>
      <div class="kvlist">
        ${card.rows.map(([k,v]) => `<div class="kvline"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}</div>`).join("")}
      </div>
    </div>
  `).join("");

  $$("[data-jump]", el).forEach(btn => {
    btn.addEventListener("click", () => {
      const step = btn.getAttribute("data-jump");
      showStep(step);
    });
  });
}

/* -------- Draft (localStorage) -------- */
const DRAFT_KEY = "smef_draft_v1";

function saveDraft(){
  const payload = buildSubmissionPayload();
  localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  return payload;
}

function loadDraft(){
  try{
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  }catch(_){ return null; }
}

function applyDraft(d){
  if (!d) return;

  // Simple mapping
  setFieldValue("vin", d.vin || "");
  setFieldValue("year", d.vehicle?.year || "");
  setFieldValue("make", d.vehicle?.make || "");
  setFieldValue("model", d.vehicle?.model || "");
  setFieldValue("trim", d.vehicle?.trim || "");
  setFieldValue("mileage", d.vehicle?.mileage || "");
  setFieldValue("condition", d.vehicle?.condition || "");
  setFieldValue("accident", d.vehicle?.accident_history || "");
  setFieldValue("mods", d.vehicle?.modifications || "");
  setFieldValue("notes", d.vehicle?.notes || "");

  setFieldValue("title_status", d.ownership?.title_status || "");
  setFieldValue("lender", d.ownership?.lender || "");
  setFieldValue("payoff", d.ownership?.payoff || "");
  setFieldValue("timeline", d.ownership?.timeline || "");

  setFieldValue("zip", d.location?.zip || "");
  setFieldValue("city", d.location?.city || "");
  setFieldValue("state", d.location?.state || "");
  setFieldValue("driveable", d.location?.driveable || "");
  setFieldValue("pickup", d.location?.pickup_preference || "");

  setFieldValue("full_name", d.contact?.name || "");
  setFieldValue("mobile", d.contact?.mobile || "");
  setFieldValue("email", d.contact?.email || "");
  setFieldValue("contact_pref", d.contact?.preferred_contact || "");

  if (d.contact?.name || d.contact?.email) $("#consent").checked = true;
}

/* -------- Submission (demo-safe) -------- */
async function submitLead(){
  const submitStatus = $("#submitStatus");
  const devNote = $("#devNote");
  setStatus(submitStatus, "Submitting…");
  devNote.hidden = true;
  devNote.textContent = "";

  const payload = buildSubmissionPayload();
  lastSubmissionPayload = payload;

  // Package as FormData so it can include files later
  const fd = new FormData();
  fd.append("payload", JSON.stringify(payload));
  const photos = $("#photos").files || [];
  const video = $("#video").files || [];
  Array.from(photos).slice(0, 50).forEach((f, i) => fd.append(`photo_${i+1}`, f));
  if (video[0]) fd.append("video", video[0]);

  // Option A: your backend
  if (SMEF_CONFIG.apiEndpoint){
    try{
      const res = await fetch(SMEF_CONFIG.apiEndpoint, { method: "POST", body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(submitStatus, `<span class="ok">Submitted.</span>`);
      return { ok: true, mode: "api" };
    }catch(err){
      console.error(err);
      setStatus(submitStatus, `<span class="bad">Couldn’t submit to API endpoint.</span>`);
      return { ok: false, mode: "api" };
    }
  }

  // Option B: FormSubmit (no backend)
  if (SMEF_CONFIG.formsubmitEmail){
    try{
      const url = `https://formsubmit.co/ajax/${encodeURIComponent(SMEF_CONFIG.formsubmitEmail)}`;
      const body = {
        _subject: `SMEF Lead: ${payload.vehicle.year} ${payload.vehicle.make} ${payload.vehicle.model}`.trim(),
        _template: "table",
        payload_json: JSON.stringify(payload, null, 2)
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(submitStatus, `<span class="ok">Submitted.</span>`);
      return { ok: true, mode: "formsubmit" };
    }catch(err){
      console.error(err);
      setStatus(submitStatus, `<span class="bad">Couldn’t submit via FormSubmit.</span>`);
      return { ok: false, mode: "formsubmit" };
    }
  }

  // Demo mode: nothing sent
  saveDraft();
  setStatus(submitStatus, `<span class="ok">Demo complete.</span>`);
  devNote.hidden = false;
  devNote.textContent = "Developer note: No endpoint is configured, so nothing was sent. A draft was saved in this browser (localStorage).";
  return { ok: true, mode: "demo" };
}

/* -------- Safety helpers -------- */
function escapeHtml(str){
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* -------- Event wiring -------- */
function wireStepper(){
  stepperItems.forEach(item => {
    const step = Number(item.getAttribute("data-step"));
    const btn = $(".stepper__btn", item);
    btn.addEventListener("click", () => {
      if (step <= maxStepReached){
        showStep(step);
      }
    });
  });
}

function wireNavButtons(){
  $$("[data-next]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const stepNum = currentStep;

      // Special: if step 1 has VIN and isn't decoded yet, try decoding first
      if (stepNum === 1){
        const vin = normalizeVin($("#vin").value);
        $("#vin").value = vin;

        if (vin && validateVin(vin).ok){
          await decodeVin(vin);
        }
      }

      const ok = validateStep(stepNum);
      if (!ok) return;

      showStep(stepNum + 1);
    });
  });

  $$("[data-prev]").forEach(btn => {
    btn.addEventListener("click", () => {
      showStep(currentStep - 1);
    });
  });
}

function wireVinControls(){
  const vinInput = $("#vin");
  const decodeBtn = $("#decodeVinBtn");
  const pasteBtn = $("#pasteVinBtn");
  const continueNoVinBtn = $("#continueNoVinBtn");

  vinInput.addEventListener("input", () => {
    vinInput.value = normalizeVin(vinInput.value).slice(0, 17);
    if ($("#vinError").textContent) setFieldError("vin", "");
  });

  vinInput.addEventListener("blur", async () => {
    const vin = normalizeVin(vinInput.value);
    vinInput.value = vin;
    if (vin.length === 17){
      await decodeVin(vin);
    }
  });

  decodeBtn.addEventListener("click", async () => {
    const vin = normalizeVin(vinInput.value);
    vinInput.value = vin;
    await decodeVin(vin);
  });

  pasteBtn.addEventListener("click", async () => {
    try{
      const text = await navigator.clipboard.readText();
      vinInput.value = normalizeVin(text).slice(0, 17);
      await decodeVin(vinInput.value);
    }catch(_){
      // fallback: focus to allow long-press paste
      vinInput.focus();
      setFieldError("vin", "Tip: long-press in the box to paste.");
    }
  });

  continueNoVinBtn.addEventListener("click", () => {
    vinOptionalMode = true;
    $("#vin").value = "";
    $("#decodedCard").hidden = true;
    setStatus($("#decodeStatus"), `<span class="ok">No problem — enter Year/Make/Model on the next step.</span>`);
  });
}

function wireOwnership(){
  const loanFields = $("#loanFields");
  $$('input[type="radio"][name="title_status"]').forEach(r => {
    r.addEventListener("change", () => {
      const v = getFieldValue("title_status");
      loanFields.hidden = !(v === "Financed / Loan" || v === "Lease");
    });
  });
}

function wireZip(){
  const zipInput = $("#zip");
  zipInput.addEventListener("input", () => {
    zipInput.value = zipInput.value.replace(/\D/g, "").slice(0, 5);
  });
  zipInput.addEventListener("blur", () => decodeZip(zipInput.value));
}

function wireMedia(){
  const photos = $("#photos");
  const video = $("#video");

  photos.addEventListener("change", () => {
    const list = photos.files || [];
    if (list.length > 50){
      setFieldError("photos", "Max 50 photos. Please re-select fewer files.");
      photos.value = "";
      $("#photosSummary").textContent = "";
      return;
    }
    setFieldError("photos", "");
    $("#photosSummary").textContent = summarizeFiles(list);
  });

  video.addEventListener("change", () => {
    const f = (video.files || [])[0];
    $("#videoSummary").textContent = f ? `${f.name} • ${formatBytes(f.size)}` : "";
  });
}

function wireHelpDialog(){
  const dlg = $("#helpDialog");
  $("#openHelp").addEventListener("click", () => dlg.showModal());
  $("#closeHelp").addEventListener("click", () => dlg.close());
}

/* -------- SMEF chat (rule-based MVP) -------- */
const chat = {
  panel: $("#chatPanel"),
  body: $("#chatBody"),
  form: $("#chatForm"),
  input: $("#chatInput"),
  state: { stage: "intro" } // intro → vin → confirm → mileage → title → zip → name → mobile → email → link → done
};

function chatOpen(){
  chat.panel.hidden = false;
  chat.input.focus();
  if (chat.state.stage === "intro"){
    chatSay("Hi — I’m SMEF. Paste your VIN (17 characters) and I’ll start the intake. You can type “skip” to use the form.");
    chat.state.stage = "vin";
  }
}

function chatClose(){
  chat.panel.hidden = true;
}

function chatSay(text){
  const div = document.createElement("div");
  div.className = "msg";
  div.innerHTML = escapeHtml(text);
  chat.body.appendChild(div);
  chat.body.scrollTop = chat.body.scrollHeight;
}

function chatMe(text){
  const div = document.createElement("div");
  div.className = "msg msg--me";
  div.textContent = text;
  chat.body.appendChild(div);
  chat.body.scrollTop = chat.body.scrollHeight;
}

async function chatHandle(text){
  const t = (text || "").trim();
  if (!t) return;

  if (t.toLowerCase() === "skip"){
    chatSay("No problem — use the form steps above. If you change your mind, paste a VIN anytime.");
    chat.state.stage = "vin";
    return;
  }

  if (chat.state.stage === "vin"){
    const vin = normalizeVin(t);
    const v = validateVin(vin);
    if (!v.ok){
      chatSay(v.msg);
      return;
    }
    setFieldValue("vin", vin);
    showStep(1);
    await decodeVin(vin);

    const year = getFieldValue("year");
    const make = getFieldValue("make");
    const model = getFieldValue("model");
    const guess = [year, make, model].filter(Boolean).join(" ");
    chatSay(guess ? `I found: ${guess}. Is that correct? (yes/no)` : "I decoded the VIN, but details were incomplete. Is the info on the form correct? (yes/no)");
    chat.state.stage = "confirm";
    return;
  }

  if (chat.state.stage === "confirm"){
    const yes = /^y(es)?\b/i.test(t);
    const no = /^n(o)?\b/i.test(t);

    if (yes){
      chatSay("Great. What’s the mileage?");
      chat.state.stage = "mileage";
      return;
    }
    if (no){
      chatSay("Got it. Please correct Year/Make/Model on Step 2, then come back and tell me the mileage.");
      chat.state.stage = "mileage";
      showStep(2);
      return;
    }
    chatSay("Please reply “yes” or “no”.");
    return;
  }

  if (chat.state.stage === "mileage"){
    const digits = digitsOnly(t);
    if (!digits){
      chatSay("Please enter a number (example: 12450).");
      return;
    }
    setFieldValue("mileage", digits);
    chatSay("Do you have the title? Reply: “title”, “loan”, or “lease”.");
    chat.state.stage = "title";
    showStep(2);
    return;
  }

  if (chat.state.stage === "title"){
    setRadioByGuess("title_status", t);
    const val = getFieldValue("title_status");
    if (!val){
      chatSay("Please reply with: title / loan / lease.");
      return;
    }
    chatSay("What ZIP code is the car in?");
    chat.state.stage = "zip";
    showStep(3);
    return;
  }

  if (chat.state.stage === "zip"){
    const z = (t || "").replace(/\D/g, "").slice(0, 5);
    const v = validateZip(z);
    if (!v.ok){
      chatSay(v.msg);
      return;
    }
    setFieldValue("zip", z);
    showStep(4);
    await decodeZip(z);

    chatSay("What’s your name?");
    chat.state.stage = "name";
    return;
  }

  if (chat.state.stage === "name"){
    if (t.length < 2){
      chatSay("Please enter your name.");
      return;
    }
    setFieldValue("full_name", t);
    chatSay("Mobile number (for texting you offers)?");
    chat.state.stage = "mobile";
    showStep(5);
    return;
  }

  if (chat.state.stage === "mobile"){
    const v = validatePhone(t);
    if (!v.ok){
      chatSay(v.msg);
      return;
    }
    setFieldValue("mobile", t);
    chatSay("Email address?");
    chat.state.stage = "email";
    return;
  }

  if (chat.state.stage === "email"){
    const emailEl = $("#email");
    emailEl.value = t.trim();
    if (!emailEl.checkValidity()){
      chatSay("That email doesn’t look valid. Please try again.");
      return;
    }
    setFieldValue("contact_pref", "Text");
    $("#consent").checked = true;
    chatSay("Optional: paste a Dropbox/Drive link to photos/video, or type “done”.");
    chat.state.stage = "link";
    return;
  }

  if (chat.state.stage === "link"){
    if (t.toLowerCase() !== "done"){
      setFieldValue("media_link", t.trim());
    }
    chatSay("All set. I filled what I could — tap Review, then submit.");
    chat.state.stage = "done";
    showStep(7);
    return;
  }

  chatSay("If you need anything else, paste a VIN or use the form steps.");
}

/* -------- Wire chat -------- */
function wireChat(){
  $("#openChat").addEventListener("click", chatOpen);
  $("#closeChat").addEventListener("click", chatClose);

  chat.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = chat.input.value;
    if (!text.trim()) return;
    chatMe(text.trim());
    chat.input.value = "";
    await chatHandle(text);
  });
}

/* -------- Misc buttons -------- */
function wireMisc(){
  $("#saveDraftBtn").addEventListener("click", () => {
    saveDraft();
    setStatus($("#submitStatus"), `<span class="ok">Draft saved in this browser.</span>`);
  });

  $("#startOverBtn").addEventListener("click", () => {
    localStorage.removeItem(DRAFT_KEY);
    form.reset();
    vinDecoded = false;
    vinOptionalMode = false;
    maxStepReached = 1;
    setStatus($("#decodeStatus"), "");
    setStatus($("#zipStatus"), "");
    setStatus($("#submitStatus"), "");
    $("#decodedCard").hidden = true;
    $("#photosSummary").textContent = "";
    $("#videoSummary").textContent = "";
    $("#city").readOnly = true;
    $("#state").readOnly = true;
    showStep(1);
  });

  $("#downloadJsonBtn").addEventListener("click", () => {
    const payload = lastSubmissionPayload || buildSubmissionPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smef-submission-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

/* -------- Form submit -------- */
function wireSubmit(){
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Validate all steps quickly
    for (let i = 1; i <= 6; i++){
      const ok = validateStep(i);
      if (!ok){
        showStep(i);
        return;
      }
    }

    const res = await submitLead();
    if (res.ok){
      showStep("success");
    }
  });
}

/* -------- Init -------- */
function init(){
  wireStepper();
  wireNavButtons();
  wireVinControls();
  wireOwnership();
  wireZip();
  wireMedia();
  wireHelpDialog();
  wireChat();
  wireMisc();
  wireSubmit();

  // Load draft if present
  const draft = loadDraft();
  if (draft){
    applyDraft(draft);
    maxStepReached = 7; // allow navigation
    setStatus($("#decodeStatus"), `<span class="ok">Draft loaded from this browser.</span>`);
  }

  showStep(1);
}

init();
