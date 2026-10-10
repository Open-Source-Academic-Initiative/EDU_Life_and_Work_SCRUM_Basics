/*
 * Minimal SCORM 1.2 runtime wrapper with a localStorage fallback.
 *
 * Inside an LMS (Moodle, etc.) it talks to window.API found in a parent
 * frame or the opener. Opened directly from disk or a plain web server it
 * keeps the same data in localStorage, so the game still works as a
 * preview and progress survives a reload.
 * Copied from EDU_Life_and_Work_LibreOffice_Calc; recordInteraction also
 * accepts a SCORM result string ("correct" | "wrong" | "neutral").
 */
(function () {
  "use strict";

  var STORAGE_KEY = "juego-scrum-restrepo:scorm12";

  function findAPI(win) {
    var tries = 0;
    while (win && tries < 12) {
      try {
        if (win.API) return win.API;
      } catch (e) { /* cross-origin frame: keep climbing */ }
      if (win.parent && win.parent !== win) { win = win.parent; }
      else break;
      tries++;
    }
    return null;
  }

  function locateAPI() {
    var api = findAPI(window);
    if (!api && window.opener) api = findAPI(window.opener);
    if (!api && window.top && window.top.opener) api = findAPI(window.top.opener);
    return api;
  }

  function LocalAPI() {
    var data = {};
    try { data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch (e) { data = {}; }
    function save() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* private mode */ }
    }
    return {
      LMSInitialize: function () {
        if (!data["cmi.core.lesson_status"]) data["cmi.core.lesson_status"] = "not attempted";
        return "true";
      },
      LMSFinish: function () { save(); return "true"; },
      LMSGetValue: function (k) {
        if (k === "cmi.core.student_name") return "";
        if (k === "cmi.core.entry") return data["cmi.suspend_data"] ? "resume" : "ab-initio";
        return data[k] != null ? String(data[k]) : "";
      },
      LMSSetValue: function (k, v) {
        // interactions are write-only in SCORM 1.2 and only useful to an LMS
        if (k.indexOf("cmi.interactions.") !== 0) data[k] = String(v);
        return "true";
      },
      LMSCommit: function () { save(); return "true"; },
      LMSGetLastError: function () { return "0"; },
      LMSGetErrorString: function () { return ""; },
      LMSGetDiagnostic: function () { return ""; },
      reset: function () { data = {}; save(); }
    };
  }

  function pad(n, w) { n = String(n); while (n.length < w) n = "0" + n; return n; }

  function formatTime(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    return pad(Math.floor(s / 3600), 4) + ":" + pad(Math.floor(s / 60) % 60, 2) + ":" + pad(s % 60, 2);
  }

  var SCORM = {
    api: null,
    connected: false,
    isLMS: false,
    startedAt: Date.now(),
    finished: false,
    interactionCount: 0,

    init: function () {
      var lmsApi = locateAPI();
      this.isLMS = !!lmsApi;
      this.api = lmsApi || LocalAPI();
      this.connected = String(this.api.LMSInitialize("")) === "true";
      if (this.isLMS) {
        var n = parseInt(this.get("cmi.interactions._count"), 10);
        this.interactionCount = isNaN(n) ? 0 : n;
      }
      var status = this.get("cmi.core.lesson_status");
      if (!status || status === "not attempted") this.set("cmi.core.lesson_status", "incomplete");
      return this.connected;
    },
    get: function (key) {
      if (!this.connected) return "";
      var v = this.api.LMSGetValue(key);
      return v == null ? "" : String(v);
    },
    set: function (key, value) {
      if (!this.connected) return false;
      return String(this.api.LMSSetValue(key, String(value))) === "true";
    },
    commit: function () {
      if (!this.connected) return false;
      return String(this.api.LMSCommit("")) === "true";
    },
    masteryScore: function () {
      var m = parseFloat(this.get("cmi.student_data.mastery_score"));
      return isNaN(m) ? null : m;
    },
    studentName: function () {
      // SCORM 1.2 gives "Last, First"
      var raw = this.get("cmi.core.student_name");
      if (!raw) return "";
      var parts = raw.split(",");
      return (parts.length > 1 ? parts[1] : parts[0]).trim();
    },
    // Moodle's SCORM 1.2 runtime appends values written to cmi.comments.
    appendsComments: function () {
      if (!this.isLMS) return false;
      try {
        var w = window;
        for (var i = 0; i < 12 && w; i++) {
          if (w.M && w.M.cfg && w.M.cfg.wwwroot) return true;
          if (w.parent === w) break;
          w = w.parent;
        }
      } catch (e) { /* cross-origin: not Moodle's page */ }
      return false;
    },
    studentFullName: function () {
      // "Toro Triana, David" -> "David Toro Triana"
      var raw = this.get("cmi.core.student_name");
      if (!raw) return "";
      var parts = raw.split(",");
      return parts.length > 1 ? (parts.slice(1).join(",").trim() + " " + parts[0].trim()).trim() : raw.trim();
    },
    recordInteraction: function (id, response, correctPattern, result) {
      if (!this.isLMS) return;
      var p = "cmi.interactions." + this.interactionCount + ".";
      this.set(p + "id", id);
      this.set(p + "type", "choice");
      this.set(p + "student_response", response);
      this.set(p + "correct_responses.0.pattern", correctPattern);
      this.set(p + "result", typeof result === "string" ? result : (result ? "correct" : "wrong"));
      this.set(p + "weighting", "1");
      this.interactionCount++;
    },
    finish: function (complete) {
      if (!this.connected || this.finished) return;
      this.set("cmi.core.session_time", formatTime(Date.now() - this.startedAt));
      this.set("cmi.core.exit", complete ? "" : "suspend");
      this.commit();
      this.api.LMSFinish("");
      this.finished = true;
    },
    resetLocal: function () {
      if (!this.isLMS && this.api.reset) this.api.reset();
    }
  };

  window.SCORM = SCORM;
})();
