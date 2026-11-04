/* /submit/ — form switching, validation, poster checks and the POST to the Apps Script endpoint.
   Markup comes from scripts/build-submit.ts; the server mirror of these rules is scripts/AppsScript-Submissions.gs.
   The page ships closed (submit disabled + Instagram note); it opens only when data/site-config.json has submitEndpoint. */
(function () {
  "use strict";
  var KEYS = ["tournament", "event", "club", "photo", "correction"];
  var MAX_BYTES = 5 * 1024 * 1024;
  var TYPES = { "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"] };
  var forms = {};
  var endpoint = "";
  KEYS.forEach(function (k) { forms[k] = document.getElementById("f-" + k); });
  var seg = document.querySelectorAll(".sub-seg button[data-form]");

  // ---------- switching ----------
  function current() {
    var h = location.hash.replace("#", "");
    return KEYS.indexOf(h) >= 0 ? h : "tournament";
  }
  function show(key) {
    KEYS.forEach(function (k) { forms[k].hidden = k !== key; });
    seg.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.form === key)); });
  }
  seg.forEach(function (b) {
    b.addEventListener("click", function () {
      if (location.hash !== "#" + b.dataset.form) history.pushState(null, "", "#" + b.dataset.form);
      show(b.dataset.form);
    });
  });
  window.addEventListener("hashchange", function () { show(current()); });
  window.addEventListener("popstate", function () { show(current()); });
  show(current());

  // ---------- helpers ----------
  function labelText(el) {
    var l = el.labels && el.labels[0];
    var group = el.closest("fieldset.group");
    var src = group ? group.querySelector("legend") : l;
    if (!src) return "This Field";
    var c = src.cloneNode(true);
    c.querySelectorAll(".opt").forEach(function (o) { o.remove(); });
    return c.textContent.trim();
  }
  function hiddenUp(el) { return !!el.closest("[hidden]"); }
  function errSlot(el) {
    var group = el.closest("fieldset.group");
    return document.getElementById((group ? group.id : el.id) + "-err");
  }
  function setErr(el, msg) {
    var slot = errSlot(el);
    if (!slot) return; // honeypot and other controls without an error slot
    var target = el.closest("fieldset.group") || el;
    if (msg) { slot.textContent = msg; slot.hidden = false; target.setAttribute("aria-invalid", "true"); }
    else { slot.textContent = ""; slot.hidden = true; target.removeAttribute("aria-invalid"); }
  }
  function isHttps(s) {
    var m = /^https:\/\/([A-Za-z0-9.-]+\.[A-Za-z]{2,})(:\d{1,5})?([\/?#][^\s]*)?$/.exec(s);
    return m ? m[1].toLowerCase() : "";
  }
  function isDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[1] >= 2020 && +m[1] <= 2100;
  }
  function mb(bytes) { return (bytes / 1048576).toFixed(1) + " MB"; }

  /** Plain-word problem with a chosen file, or "" when it is fine. Checks MIME type AND extension. */
  function fileProblem(file) {
    var ext = (file.name.split(".").pop() || "").toLowerCase();
    var okExt = TYPES[file.type] && TYPES[file.type].indexOf(ext) >= 0;
    if (!okExt) return "This File Is Not a JPG, PNG or WebP Image. Please Choose One of Those.";
    if (file.size > MAX_BYTES) return "This File Is " + mb(file.size) + ". The Limit Is 5 MB. Please Choose a Smaller Image.";
    if (file.size === 0) return "This File Is Empty. Please Choose Another Image.";
    return "";
  }

  /** Validate one control; returns the message ("" when fine). Skips controls inside hidden blocks. */
  function check(el) {
    if (hiddenUp(el) || el.name === "website_url") return "";
    var v = (el.value || "").trim();
    var label = labelText(el);
    if (el.type === "file") {
      var f = el.files && el.files[0];
      if (!f) return el.required ? "Please Choose an Image to Upload." : "";
      return fileProblem(f);
    }
    if (el.type === "checkbox" && !el.closest("fieldset.group")) {
      if (el.required && !el.checked) return el.name === "licenceConfirmed" ? "Please Confirm You Have the Right to Share This Photo." : "Please Tick This Box to Continue.";
      return "";
    }
    if (el.type === "radio" || el.type === "checkbox") {
      var group = el.closest("fieldset.group");
      if (group.hasAttribute("data-required") && !group.querySelector("input:checked")) return "Please Choose One: " + label + ".";
      return "";
    }
    if (!v) return el.required ? label + " is required." : "";
    var max = +el.getAttribute("maxlength");
    if (max && v.length > max) return label + " is too long. Keep it under " + max + " characters.";
    switch (el.dataset.kind) {
      case "email": return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? "" : "That Email Address Does Not Look Right. Check It and Try Again.";
      case "url": return isHttps(v) ? "" : "Use a Full Web Address Starting With https://";
      case "igurl": return /(^|\.)instagram\.com$/.test(isHttps(v)) ? "" : "Use an Instagram link starting with https://www.instagram.com/";
      case "date": return isDate(v) ? "" : "Use a Real Date.";
      case "time": return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? "" : "Use a 24-Hour Time Like 19:30.";
      case "int": return /^\d+$/.test(v) && +v >= +el.dataset.min && +v <= +el.dataset.max ? "" : "Use a Whole Number From " + el.dataset.min + " to " + el.dataset.max + ".";
      case "phone": return /^[+0-9 ()\-]{6,30}$/.test(v) ? "" : "Use Only Digits, Spaces, + and -.";
      case "instagram": return /^@?[A-Za-z0-9._]{1,30}$/.test(v) || /(^|\.)instagram\.com$/.test(isHttps(v)) ? "" : "Use an @handle or an https://instagram.com link.";
    }
    return "";
  }

  function controls(form) {
    return Array.prototype.filter.call(form.querySelectorAll("input, select, textarea"), function (el) { return el.type !== "hidden"; });
  }

  /** Validate a whole form; returns the invalid controls (first one per group). */
  function validate(form) {
    var bad = [], seen = {};
    controls(form).forEach(function (el) {
      var group = el.closest("fieldset.group");
      var key = group ? group.id : el.id;
      if (seen[key]) return;
      seen[key] = true;
      var msg = check(el);
      setErr(el, msg);
      if (msg) bad.push(el);
    });
    // cross-field rules
    var pairs = [["startDate", "endDate", "The End Date Is Before the Start Date."], ["startTime", "endTime", "The End Time Is Before the Start Time."]];
    pairs.forEach(function (p) {
      var a = form.querySelector('[name="' + p[0] + '"]'), b = form.querySelector('[name="' + p[1] + '"]');
      if (!a || !b || !a.value || !b.value || bad.indexOf(a) >= 0 || bad.indexOf(b) >= 0) return;
      var wrong = p[0] === "startDate" ? b.value < a.value : b.value <= a.value;
      if (wrong) { setErr(b, p[2]); bad.push(b); }
    });
    return bad;
  }

  // ---------- club picker ----------
  function fillClubs(clubs) {
    document.querySelectorAll("select[data-clubs]").forEach(function (sel) {
      var other = sel.querySelector('option[value="__other"]');
      clubs.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (c) {
        var o = document.createElement("option");
        o.value = c.name;
        o.textContent = c.city ? c.name + " · " + c.city : c.name;
        o.dataset.slug = c.slug || "";
        o.dataset.city = c.city || "";
        sel.insertBefore(o, other);
      });
    });
  }
  document.querySelectorAll("select[data-clubs]").forEach(function (sel) {
    sel.addEventListener("change", function () {
      var form = sel.form;
      var other = form.querySelector(".other-venue");
      other.hidden = sel.value !== "__other";
      if (!other.hidden) other.querySelector("input").focus();
      var city = form.querySelector('[name="city"]');
      var picked = sel.selectedOptions[0];
      if (city && picked && picked.dataset.city && !city.value) city.value = picked.dataset.city;
    });
  });

  // ---------- event: one date or every week ----------
  document.querySelectorAll('input[name="howOften"]').forEach(function (r) {
    r.addEventListener("change", function () {
      var form = r.form, weekly = form.querySelector('input[name="howOften"][value="Every Week"]').checked;
      form.querySelector(".when-once").hidden = weekly;
      form.querySelector(".when-weekly").hidden = !weekly;
    });
  });

  // ---------- live re-check after an error has been shown ----------
  // On `input` too, not only `change`: an error that clears on blur shifts the layout between mousedown and
  // mouseup on the submit button, and the click is lost. Clearing while typing settles the layout first.
  KEYS.forEach(function (k) {
    var form = forms[k];
    function recheck(e) {
      var el = e.target;
      if (el.type === "file") { if (e.type === "change") setErr(el, check(el)); return; }
      if ((el.closest("fieldset.group") || el).getAttribute("aria-invalid") === "true") setErr(el, check(el));
    }
    form.addEventListener("input", recheck);
    form.addEventListener("change", recheck);
  });

  // ---------- payload ----------
  function readBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { var s = String(r.result); resolve(s.slice(s.indexOf(",") + 1)); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(file);
    });
  }
  function payload(form) {
    var out = new URLSearchParams();
    out.set("action", "submit");
    out.set("type", form.dataset.type);
    var groups = {};
    controls(form).forEach(function (el) {
      if (!el.name || el.hasAttribute("data-local") || el.type === "file") return;
      var blank = hiddenUp(el);
      if (el.type === "checkbox" && el.closest("fieldset.group")) {
        (groups[el.name] = groups[el.name] || []);
        if (el.checked && !blank) groups[el.name].push(el.value);
        return;
      }
      if (el.type === "checkbox") { out.set(el.name, el.checked && !blank ? "yes" : ""); return; }
      if (el.type === "radio") { if (!out.has(el.name)) out.set(el.name, ""); if (el.checked && !blank) out.set(el.name, el.value); return; }
      var v = blank ? "" : el.value.trim();
      if (el.name === "club" && v === "__other") v = form.querySelector('[name="clubOther"]').value.trim();
      out.set(el.name, v);
    });
    Object.keys(groups).forEach(function (n) { out.set(n, groups[n].join(",")); });
    return out;
  }

  // ---------- submit ----------
  KEYS.forEach(function (k) {
    var form = forms[k];
    var btn = form.querySelector('button[type="submit"]');
    var label = btn.textContent;
    var formErr = form.querySelector(".form-err");
    var sending = false;

    function done() {
      form.querySelector(".fields").hidden = true;
      var sent = form.querySelector(".sent");
      sent.hidden = false;
      sent.setAttribute("tabindex", "-1");
      sent.focus();
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (sending || !endpoint) return;
      formErr.hidden = true;
      var bad = validate(form);
      if (bad.length) {
        formErr.textContent = bad.length === 1 ? "Please Fix the Field Marked Below." : "Please Fix the " + bad.length + " Fields Marked Below.";
        formErr.hidden = false;
        bad[0].focus();
        return;
      }
      sending = true;
      btn.disabled = true;
      btn.textContent = "Sending…";
      var hp = form.querySelector('[name="website_url"]');
      if (hp && hp.value.trim()) { setTimeout(done, 400); return; } // honeypot: pretend it worked, send nothing

      var body = payload(form);
      var fileInput = form.querySelector("input[type=file]");
      var file = fileInput && fileInput.files && fileInput.files[0];
      var ready = file ? readBase64(file).then(function (b64) {
        body.set("posterName", file.name);
        body.set("posterMime", file.type);
        body.set("posterData", b64);
      }) : Promise.resolve();

      ready.then(function () {
        return fetch(endpoint, { method: "POST", mode: "no-cors", body: body });
      }).then(function () {
        if (window.ptTrack) window.ptTrack("submission_sent", { form_type: k });   // real sends only, never the honeypot path
        done();
      }, function () {
        sending = false;
        btn.disabled = false;
        btn.textContent = label;
        formErr.textContent = "We Could Not Send This. Check Your Connection and Try Again.";
        formErr.hidden = false;
      });
    });

    form.querySelector("[data-again]").addEventListener("click", function () {
      form.reset();
      form.querySelectorAll(".other-venue, .when-weekly").forEach(function (el) { el.hidden = true; });
      var once = form.querySelector(".when-once"); if (once) once.hidden = false;
      controls(form).forEach(function (el) { setErr(el, ""); });
      form.querySelector(".sent").hidden = true;
      form.querySelector(".fields").hidden = false;
      sending = false;
      btn.disabled = false;
      btn.textContent = label;
      controls(form)[0].focus();
    });
  });

  // ---------- correction: prefill the page link ----------
  var page = document.querySelector('#f-correction [name="pageUrl"]');
  var q = new URLSearchParams(location.search).get("page");
  if (page && q && isHttps(q)) page.value = q;
  else if (page && document.referrer && /^https:\/\/(www\.)?padelthailand\.com\//.test(document.referrer)) page.value = document.referrer;

  // ---------- open or stay closed ----------
  function getJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  Promise.all([
    getJson("/data/site-config.json").catch(function () { return {}; }),
    getJson("/data/clubs.json").catch(function () { return { clubs: [] }; }),
  ]).then(function (res) {
    fillClubs((res[1] && res[1].clubs) || []);
    var url = String((res[0] && res[0].submitEndpoint) || "").trim();
    endpoint = /^https:\/\//.test(url) ? url : "";
    KEYS.forEach(function (k) {
      forms[k].querySelector(".closed").hidden = !!endpoint;
      forms[k].querySelector('button[type="submit"]').disabled = !endpoint;
    });
    document.body.dataset.submit = endpoint ? "open" : "closed";
  });
})();
