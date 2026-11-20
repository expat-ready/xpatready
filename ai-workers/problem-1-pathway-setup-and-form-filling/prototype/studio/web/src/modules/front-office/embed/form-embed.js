// FO-4b (BACKLOG FO-4b; AG-2-5 rules 2, 7, 10-11; AG-2-8a; AG-2-49): the firm's enquiry form drawn on the firm's own
// site by one script our API serves (api/src/front-office/sales/embed.ts, GET /api/public/embed/form.js). The snippet is
//   <div data-expatready-form="<token>"><a href="<our site>/front-office/web-form/<token>">Send us an enquiry</a></div>
//   <script src="<our site>/api/public/embed/form.js" async></script>   (snippet.ts writes it)
// Each draw takes a fresh submissionId and signed load stamp from FO-2's open read; a send carries the page's campaign
// facts (utm source, medium, campaign, term, content; one click id and its kind; landing and referring page), as the
// browser has them, nothing guessed. No cookies, no storage, no request after the form is sent (no tracking). Plain DOM,
// text only (never HTML from the server), in a shadow root so the firm's page and the form do not restyle each other.
// If the script is blocked or the form cannot be read (a site not allowed, the form off, no network), the link stays:
// the hosted form still works. Plain JavaScript with no build step and no package (STANDARDS §1 untouched).
(function () {
  "use strict";
  var me = document.currentScript || Array.prototype.slice.call(document.scripts).filter(function (s) { return /\/api\/public\/embed\/form\.js(?:[?#]|$)/.test(s.src); })[0];
  if (!me || !me.src) return;
  var BASE = new URL(me.src, location.href).origin;
  /** AG-2-49 rule 3: a send sooner than 2 s after the draw reads as a bot, so a quick person is held until then, never lost. */
  var MIN_FILL_MS = 2100;
  var UTM = [["utm_source", "utmSource"], ["utm_medium", "utmMedium"], ["utm_campaign", "utmCampaign"], ["utm_term", "utmTerm"], ["utm_content", "utmContent"]];
  // The four named kinds first; any other platform's click id is kept with kind OTHER (AG-2-8a §12), never guessed.
  var CLICK = [["gclid", "GCLID"], ["fbclid", "FBCLID"], ["msclkid", "MSCLKID"], ["ttclid", "TTCLID"], ["gbraid", "OTHER"], ["wbraid", "OTHER"], ["dclid", "OTHER"], ["li_fat_id", "OTHER"], ["twclid", "OTHER"]];
  var TRAP = "website";   // the honeypot (AG-2-49 rule 3): people never see or reach it
  var cut = function (s, n) { return Array.from(String(s)).slice(0, n).join(""); };

  /** The page's campaign facts when present (AG-2-5 rule 7, AG-2-8a rule 2); the page address without its #part. */
  function campaign() {
    var q = new URLSearchParams(location.search), a = {};
    UTM.forEach(function (u) { var v = q.get(u[0]); if (v && v.trim()) a[u[1]] = cut(v.trim(), 200); });
    for (var i = 0; i < CLICK.length; i++) { var c = q.get(CLICK[i][0]); if (c && c.trim()) { a.clickId = cut(c.trim(), 200); a.clickIdKind = CLICK[i][1]; break; } }
    a.landingPage = cut(location.origin + location.pathname + location.search, 2000);
    if (document.referrer) a.referrerUrl = cut(document.referrer, 2000);
    return a;
  }

  /** One call to the form's open door: never a cookie (credentials omitted), never cached. A refusal is its problem body. */
  function call(path, init) {
    return fetch(BASE + "/api/public/forms/" + path, Object.assign({ mode: "cors", credentials: "omit", cache: "no-store" }, init)).then(function (res) {
      return res.text().then(function (t) {
        var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; }
        if (!res.ok) { var p = d && typeof d === "object" ? d : {}; p.status = res.status; throw p; }
        return d;
      });
    });
  }

  var CSS = ":host{all:initial;display:block;color:#1c2430;font:16px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}"
    + "*{box-sizing:border-box}.xr{max-width:32rem;border:1px solid #d5dae1;border-radius:12px;background:#fff;padding:20px}"
    + "h2{margin:0 0 4px;font-size:1.25rem;line-height:1.3;overflow-wrap:anywhere}form{display:flex;flex-direction:column;gap:14px;margin-top:14px;position:relative}"
    + "label{display:block;font-weight:600;font-size:.9rem;margin-bottom:4px}.hint{font-size:.8rem;color:#4a5563;margin:0 0 4px}"
    + "input[type=text],input[type=email],input[type=tel],select{width:100%;min-height:44px;font:inherit;color:inherit;background:#fff;border:1px solid #8a94a3;border-radius:8px;padding:8px 10px}"
    + "input:focus-visible,select:focus-visible,button:focus-visible,.sum:focus-visible{outline:3px solid var(--expatready-focus,#1d4ed8);outline-offset:2px}"
    + "[aria-invalid=true]{border-color:#b42318}.err{color:#b42318;font-size:.85rem;margin:4px 0 0}"
    + ".tick{display:flex;gap:8px;align-items:flex-start;font-weight:400;font-size:.9rem}.tick input{width:20px;height:20px;margin:2px 0 0;flex:none}"
    + "button{min-height:44px;align-self:flex-start;font:inherit;font-weight:600;color:#fff;background:var(--expatready-accent,#1d4ed8);border:0;border-radius:8px;padding:10px 18px;cursor:pointer}"
    + "button[disabled]{opacity:.7;cursor:progress}.sum{border:1px solid #d5dae1;border-left:4px solid #b42318;border-radius:8px;padding:10px 12px;font-size:.9rem}"
    + ".sum p{margin:0;font-weight:600}.sum ul,.sum .why{margin:4px 0 0;padding-left:18px;color:#4a5563;font-weight:400}.sum .why{padding:0}"
    + ".trap{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}.thanks{white-space:pre-line;margin:8px 0 0}";

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function draw(host) {
    var formRef = host.getAttribute("data-expatready-form") || "";
    if (host.getAttribute("data-expatready-state")) return;   // drawn once, even if the script is on the page twice
    host.setAttribute("data-expatready-state", "loading");
    call(encodeURIComponent(formRef)).then(function (form) {
      if (!form || typeof form.submissionId !== "string" || typeof form.loadStamp !== "string") throw new Error("not a form");
      render(host, formRef, form);
    }).catch(function () { host.setAttribute("data-expatready-state", "link"); });   // the link stays: the hosted form works
  }

  function render(host, formRef, form) {
    var root = host.shadowRoot || host.attachShadow({ mode: "open" });   // the link stays in the page, unseen behind the form
    var drawnAt = Date.now(), busy = false;
    var box = el("div", { "class": "xr" });
    var title = el("h2", null, form.name);
    box.appendChild(title);
    var f = el("form", { novalidate: "" });
    var summary = el("div", { "class": "sum", role: "alert", tabindex: "-1", id: "xr-summary", hidden: "" });
    f.appendChild(summary);
    var inputs = {}, errs = {};
    function field(key, label, input, hint) {
      var wrap = el("div"), id = "xr-" + key;
      input.id = id; input.name = key;
      wrap.appendChild(el("label", { "for": id }, label));
      var described = [];
      if (hint) { wrap.appendChild(el("p", { "class": "hint", id: id + "-hint" }, hint)); described.push(id + "-hint"); }
      wrap.appendChild(input);
      var e = el("p", { "class": "err", id: id + "-err", hidden: "" }); wrap.appendChild(e); described.push(id + "-err");
      input.setAttribute("aria-describedby", described.join(" "));
      inputs[key] = input; errs[key] = e; f.appendChild(wrap);
    }
    field("givenNames", "First name", el("input", { type: "text", autocomplete: "given-name", maxlength: "100", required: "" }));
    field("familyName", "Last name (optional)", el("input", { type: "text", autocomplete: "family-name", maxlength: "100" }));
    field("email", "Email", el("input", { type: "email", inputmode: "email", autocomplete: "email", maxlength: "254", required: "" }));
    field("phone", "Phone (optional)", el("input", { type: "tel", inputmode: "tel", autocomplete: "tel", maxlength: "40" }), "With your country code if you are outside Canada, for example +44 20 7946 0000.");
    if (Array.isArray(form.interestedIn) && form.interestedIn.length) {
      var sel = el("select");
      sel.appendChild(el("option", { value: "" }, "Choose one"));
      form.interestedIn.forEach(function (s) { sel.appendChild(el("option", { value: String(s.id) }, s.label)); });
      field("interestedIn", "Interested in (optional)", sel);
    }
    var tick = null, tickText = null;
    function drawTick() {
      if (tick) { tick.parentNode.remove(); tick = null; }
      if (!form.consentText) return;
      var lab = el("label", { "class": "tick" });
      tick = el("input", { type: "checkbox", name: "consent" });
      tickText = el("span", null, form.consentText);
      lab.appendChild(tick); lab.appendChild(tickText);
      f.insertBefore(lab, trapBox);
    }
    // Hidden by the `hidden` attribute (the browser's own rule, which no page CSP can block), not by our styles alone (break M1).
    var trapBox = el("div", { "class": "trap", "aria-hidden": "true", hidden: "" });
    var trap = el("input", { type: "text", name: TRAP, tabindex: "-1", autocomplete: "off" });
    trapBox.appendChild(trap); f.appendChild(trapBox);
    drawTick();
    var button = el("button", { type: "submit" }, "Send my enquiry");
    f.appendChild(button);
    box.appendChild(f);

    function show(fieldErrors, refused) {
      Object.keys(errs).forEach(function (k) {
        var m = fieldErrors[k];
        errs[k].textContent = m || ""; errs[k].hidden = !m;
        if (m) inputs[k].setAttribute("aria-invalid", "true"); else inputs[k].removeAttribute("aria-invalid");
      });
      var list = Object.keys(fieldErrors).map(function (k) { return fieldErrors[k]; });
      summary.textContent = "";
      if (!list.length && !refused) { summary.hidden = true; f.removeAttribute("aria-describedby"); return; }
      if (list.length) {
        summary.appendChild(el("p", null, "Please check the form"));
        var ul = el("ul"); list.forEach(function (m) { ul.appendChild(el("li", null, m)); }); summary.appendChild(ul);
      } else { summary.appendChild(el("p", null, "Not sent")); summary.appendChild(el("p", { "class": "why" }, refused)); }
      summary.hidden = false; f.setAttribute("aria-describedby", "xr-summary");
      requestAnimationFrame(function () { summary.focus(); });
    }
    function done(text, state) {
      box.textContent = "";
      box.appendChild(el("h2", null, state === "thanks" ? (form.name || "Thank you") : "Enquiry form"));
      var p = el("p", { "class": "thanks", role: "status", tabindex: "-1", "data-form-state": state }, text);
      box.appendChild(p);
      host.setAttribute("data-expatready-state", state);
      requestAnimationFrame(function () { p.focus(); });
    }

    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (busy) return;   // one send at a time; a repeat with the same submissionId is one lead anyway (AG-2-84)
      var v = {}; Object.keys(inputs).forEach(function (k) { v[k] = inputs[k].value.trim(); });
      var own = {};
      if (!v.givenNames) own.givenNames = "Enter your first name.";
      if (!v.email) own.email = "Enter your email.";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@.]+$/.test(v.email)) own.email = "Enter an email like name@example.com.";
      show(own, null);
      if (Object.keys(own).length) return;
      busy = true; button.disabled = true; button.setAttribute("aria-busy", "true"); button.textContent = "Sending…";   // the hold up to 2 s and the network (review m3)
      var wait = Math.max(0, drawnAt + MIN_FILL_MS - Date.now());
      new Promise(function (r) { setTimeout(r, wait); }).then(function () {
        var body = { submissionId: form.submissionId, loadStamp: form.loadStamp, givenNames: v.givenNames, email: v.email, attribution: campaign() };
        if (v.familyName) body.familyName = v.familyName;
        if (v.phone) body.phone = v.phone;
        if (v.interestedIn) body.interestedIn = v.interestedIn;
        if (form.consentText) body.consent = !!(tick && tick.checked);
        if (trap.value) body[TRAP] = trap.value;
        return call(encodeURIComponent(formRef) + "/submissions", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
      }).then(function (r) {
        done(r && typeof r.thankYouText === "string" ? r.thankYouText : "Thank you.", "thanks");
      }).catch(function (p) {
        p = p || {};
        if (p.code === "FORM_NOT_AVAILABLE") { done("This form is not available.", "not-available"); return; }
        // An old page (a restart or a changed wording): read it again, answers kept, the tick cleared (it counts only for words seen).
        if (p.code === "RELOAD") {
          return call(encodeURIComponent(formRef)).then(function (fresh) {
            form = fresh; drawnAt = Date.now(); drawTick();
            show({}, "The form was refreshed. Please check your answers" + (form.consentText ? ", tick the box again if you agree to its words," : "") + " and press Send my enquiry again.");
          }, function () { show({}, "The form could not be sent. Please reload the page and try again."); });
        }
        var fields = {};
        if (p.fields && typeof p.fields === "object") Object.keys(p.fields).forEach(function (k) { fields[k] = String(p.fields[k]); });
        var onField = {}, other = [];
        Object.keys(fields).forEach(function (k) { if (errs[k]) onField[k] = fields[k]; else other.push(fields[k]); });
        if (Object.keys(onField).length) { show(onField, null); return; }
        if (typeof p.detail === "string" && p.status) { show({}, p.detail); return; }
        // Nothing readable came back: the network, or a form switched off (its pre-flight fails before the send). Ask the
        // form's read once. Only its readable "not available" closes the form (AG-2-5 rule 11, break m1); anything else
        // keeps every answer and asks for a retry (break R1). The read's new submissionId is not used: the visitor's
        // send keeps its own, so a retry is still one lead.
        var retry = "The form could not be sent. Please check your connection and try again.";
        return call(encodeURIComponent(formRef)).then(function () { show({}, retry); }, function (q) {
          if (q && q.code === "FORM_NOT_AVAILABLE") done("This form is not available.", "not-available");
          else show({}, q && q.status && typeof q.detail === "string" ? q.detail : retry);
        });
      }).then(function () { busy = false; button.disabled = false; button.removeAttribute("aria-busy"); button.textContent = "Send my enquiry"; });
    });

    // A constructed style sheet where the browser has one (a page CSP without 'unsafe-inline' does not block it, break
    // M1); a <style> element otherwise. Either way nothing a person must not see depends on it (the honeypot is `hidden`).
    root.textContent = "";
    var sheet = null;
    try { if ("adoptedStyleSheets" in root && typeof CSSStyleSheet === "function") { sheet = new CSSStyleSheet(); sheet.replaceSync(CSS); root.adoptedStyleSheets = [sheet]; } } catch (e) { sheet = null; }
    if (!sheet) root.appendChild(el("style", null, CSS));
    root.appendChild(box);
    host.setAttribute("data-expatready-state", "form");
  }

  function drawAll() { Array.prototype.forEach.call(document.querySelectorAll("[data-expatready-form]"), draw); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", drawAll); else drawAll();
})();
