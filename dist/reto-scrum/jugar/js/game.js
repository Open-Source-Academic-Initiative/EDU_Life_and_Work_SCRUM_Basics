/*
 * El Scrum más Master del Restrepo — game loop, dialogues, decisions, feedback and
 * SCORM reporting. Story text lives in content/story.json (-> js/story-data.js).
 * A course profile (content/profiles/*.json) may add D.course and decision.courseRef.
 *
 * SCORM 1.2: completion only. The status becomes "completed" when the player
 * reaches an ending (saved or bankrupt). Each decision is recorded as a
 * cmi.interactions entry; attempts and the current run live in suspend_data.
 */
(function () {
  "use strict";

  var D = window.STORY, P = window.Pixel, SCORM = window.SCORM;
  var KEYS = ["caja", "cliente", "equipo"];
  var LABEL = { caja: "Caja", cliente: "Cliente", equipo: "Equipo" };
  var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  var STEP_MS = 150;
  var TOTAL = D.chapters.reduce(function (n, c) { return n + c.decisions.length; }, 0);

  var $ = function (id) { return document.getElementById(id); };
  var cv = $("screen"), ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }
  function clamp(v) { return Math.max(0, Math.min(100, v)); }

  // ================================================================ state
  // meta: a = attempts started, w = runs won, h = last results [{r, n, k}]
  var meta = { a: 0, w: 0, h: [] };
  // run: n = attempt number, av = avatar, ci = chapter index,
  // ch = {decisionId: option index}, st = indicators, hints, hinted, end
  var run = null;
  var mode = "title";

  function save() {
    var loc = "inicio";
    if (run) loc = run.end ? "fin" : (currentDecision() || {}).id || D.chapters[run.ci].id;
    SCORM.set("cmi.suspend_data", JSON.stringify({ v: 1, m: meta, r: run }));
    SCORM.set("cmi.core.lesson_location", loc);
    SCORM.commit();
  }
  function load() {
    try {
      var data = JSON.parse(SCORM.get("cmi.suspend_data") || "{}");
      if (data.m) meta = data.m;
      if (data.r && D.chapters[data.r.ci]) run = data.r;
    } catch (e) { /* corrupt or empty: start fresh */ }
  }

  function chapter() { return D.chapters[run.ci]; }
  function currentDecision() {
    if (!run || run.end) return null;
    var ds = chapter().decisions;
    for (var i = 0; i < ds.length; i++) if (!(ds[i].id in run.ch)) return ds[i];
    return null;
  }
  function charOf(id) { return D.chars[id]; }
  function playerLook() { return D.players[run ? run.av : 0]; }

  // Seeded option order: stable for a run (resume shows the same order),
  // different between attempts so nobody memorises "always the first one".
  function optionOrder(dec) {
    var idx = dec.options.map(function (o, i) { return i; });
    var seed = (run.n * 7919 + dec.id.charCodeAt(1) * 131 + dec.id.charCodeAt(3) * 17) | 0;
    for (var i = idx.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      var j = seed % (i + 1), tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
    }
    return idx;
  }

  // ================================================================ world
  var world = null;
  var player = { x: 0, y: 0, tx: 0, ty: 0, prog: 0, moving: false, dir: "down", steps: 0, path: [], talkTo: null };
  var held = null;
  var bus = { x: -120, active: false, wait: 2000 };

  function loadScene(ci) {
    var ch = D.chapters[ci], scene = D.scenes[ch.scene];
    world = {
      id: ch.scene, scene: scene, map: scene.map,
      npcs: ch.npcs.map(function (n) {
        return {
          id: n.id, x: n.x, y: n.y, dir: n.dir || "down", idle: n.idle || [], idleI: 0,
          screen: !!n.screen, vendor: !!n.vendor, look: charOf(n.id).look,
          cart: n.vendor ? { x: n.x + 1, y: n.y } : null
        };
      })
    };
    player.x = player.tx = ch.player[0];
    player.y = player.ty = ch.player[1];
    player.moving = false; player.path = []; player.talkTo = null; player.dir = "up";
    $("hud-chapter").textContent = ch.title;
    $("hud-topic").textContent = ch.topic + " · " + scene.name;
  }

  function npcAt(x, y) {
    if (!world) return null;
    for (var i = 0; i < world.npcs.length; i++) {
      var n = world.npcs[i];
      if ((n.x === x && n.y === y) || (n.cart && n.cart.x === x && n.cart.y === y)) return n;
    }
    return null;
  }
  // The bus is 92 px long; the zebra crossing spans x 144–176.
  function busOnZebra() { return bus.active && bus.x + 92 > 140 && bus.x < 180; }
  function walkable(x, y, ignoreBus) {
    if (x < 0 || y < 0 || x > 19 || y > 10) return false;
    var ch = world.map[y][x];
    if (P.isSolid(ch) || ch === "r" || ch === "=") return false;
    if (ch === "z" && !ignoreBus && busOnZebra()) return false;
    return !npcAt(x, y);
  }
  function adjacent(n, x, y) {
    x = x == null ? player.x : x; y = y == null ? player.y : y;
    var tiles = [[n.x, n.y]].concat(n.cart ? [[n.cart.x, n.cart.y]] : []);
    return tiles.some(function (t) { return Math.abs(t[0] - x) + Math.abs(t[1] - y) === 1; });
  }
  function bfs(goal) {
    var start = [player.x, player.y], seen = {}, queue = [[start]];
    seen[start] = true;
    while (queue.length) {
      var path = queue.shift(), cur = path[path.length - 1];
      if (goal(cur[0], cur[1])) return path.slice(1);
      for (var d in DIRS) {
        var nx = cur[0] + DIRS[d][0], ny = cur[1] + DIRS[d][1], k = nx + "," + ny;
        if (!seen[k] && walkable(nx, ny, true)) { seen[k] = true; queue.push(path.concat([[nx, ny]])); }
      }
    }
    return null;
  }
  function stepTo(nx, ny) {
    var dx = nx - player.x, dy = ny - player.y;
    player.dir = dx > 0 ? "right" : dx < 0 ? "left" : dy > 0 ? "down" : "up";
    player.tx = nx; player.ty = ny; player.moving = true; player.prog = 0; player.steps++;
  }
  function tryStep(dir) {
    player.dir = dir;
    var nx = player.x + DIRS[dir][0], ny = player.y + DIRS[dir][1];
    if (walkable(nx, ny)) stepTo(nx, ny);
  }
  function face(n) {
    var tx = n.x, ty = n.y;
    if (n.cart && Math.abs(n.cart.x - player.x) + Math.abs(n.cart.y - player.y) === 1) { tx = n.cart.x; ty = n.cart.y; }
    var dx = tx - player.x, dy = ty - player.y;
    player.dir = dx > 0 ? "right" : dx < 0 ? "left" : dy > 0 ? "down" : "up";
    if (!n.screen) {
      var ex = player.x - n.x, ey = player.y - n.y;
      n.dir = Math.abs(ex) >= Math.abs(ey) ? (ex > 0 ? "right" : "left") : (ey > 0 ? "down" : "up");
    }
  }
  function goTalk(n) {
    if (adjacent(n)) { face(n); interact(n); return; }
    var path = bfs(function (x, y) { return adjacent(n, x, y); });
    if (path) { player.path = path; player.talkTo = n; }
  }
  function goTo(x, y) {
    var path = bfs(function (px, py) { return px === x && py === y; });
    if (path) { player.path = path; player.talkTo = null; }
  }

  function update(dt) {
    if (world && world.id === "calle") updateBus(dt);
    if (mode !== "play") return;
    if (player.moving) {
      player.prog += dt / STEP_MS;
      if (player.prog >= 1) { player.x = player.tx; player.y = player.ty; player.moving = false; player.prog = 0; }
      else return;
    }
    if (player.path.length) {
      var n = player.path.shift();
      if (walkable(n[0], n[1])) stepTo(n[0], n[1]);
      else if (walkable(n[0], n[1], true)) player.path.unshift(n); // wait at the curb for the bus
      else player.path = [];
    } else if (player.talkTo) {
      var t = player.talkTo; player.talkTo = null;
      if (adjacent(t)) { face(t); interact(t); }
    } else if (held) {
      tryStep(held);
    }
  }
  function updateBus(dt) {
    if (bus.active) {
      // brake for a pedestrian on (or about to step on) the zebra crossing
      var next = player.path[0], z = function (t) { return t && world.map[t[1]][t[0]] === "z"; };
      var crossing = z([player.x, player.y]) || (player.moving && z([player.tx, player.ty])) || z(next);
      if (crossing && bus.x + 92 < 140 && bus.x + 92 > 90) return;
      bus.x += dt * 0.09;
      if (bus.x > 340) { bus.active = false; bus.wait = 4000 + Math.random() * 4000; }
    } else {
      bus.wait -= dt;
      var onZebra = world.map[player.y][player.x] === "z" || (player.moving && world.map[player.ty][player.tx] === "z");
      if (bus.wait <= 0 && !onZebra) { bus.active = true; bus.x = -100; }
    }
  }

  // ================================================================ render
  function render(t) {
    if (!world) return;
    ctx.drawImage(P.sceneCanvas(world.scene, world.id), 0, 0);
    if (world.id === "calle") {
      P.drawCableCar(ctx, t);
      if (bus.active) P.drawBus(ctx, Math.round(bus.x), 100);
    }
    var list = [];
    world.npcs.forEach(function (n) {
      list.push({ y: n.y, draw: function () {
        if (n.screen) { P.drawScreen(ctx, n.x * 16, n.y * 16, n.look, t); return; }
        shadow(n.x * 16, n.y * 16);
        ctx.drawImage(P.sprite(n.look, n.dir, 0), n.x * 16, n.y * 16 - 3);
      } });
      if (n.cart) list.push({ y: n.cart.y, draw: function () { P.drawCart(ctx, n.cart.x * 16, n.cart.y * 16); } });
    });
    if (mode === "play" || mode === "dialog") {
      var px = player.x + (player.tx - player.x) * (player.moving ? player.prog : 0);
      var py = player.y + (player.ty - player.y) * (player.moving ? player.prog : 0);
      var frame = player.moving ? (player.prog < 0.5 ? player.steps % 2 : 0) : 0;
      list.push({ y: py + 0.01, draw: function () {
        shadow(Math.round(px * 16), Math.round(py * 16));
        ctx.drawImage(P.sprite(playerLook(), player.dir, frame), Math.round(px * 16), Math.round(py * 16) - 3);
      } });
    }
    list.sort(function (a, b) { return a.y - b.y; }).forEach(function (e) { e.draw(); });

    if (mode === "play" && run) {
      var dec = currentDecision();
      world.npcs.forEach(function (n) {
        var my = n.screen ? n.y * 16 - 2 : n.y * 16 - 3;
        if (dec && dec.npc === n.id) P.drawMarker(ctx, n.x * 16, my, t, "task");
        else if (dec && n.vendor && !run.hinted[dec.id]) P.drawMarker(ctx, n.x * 16, my, t, "hint");
      });
    }
  }
  function shadow(x, y) {
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(x + 4, y + 12, 8, 2);
  }

  var last = 0;
  function frame(t) {
    var dt = Math.min(50, t - (last || t));
    last = t;
    update(dt);
    render(t);
    requestAnimationFrame(frame);
  }

  // ================================================================ meters
  function drawMeters(deltas) {
    KEYS.forEach(function (k) {
      var el = document.querySelector('.meter[data-k="' + k + '"]');
      var v = run ? run.st[k] : 0;
      el.querySelector("i").style.width = v + "%";
      el.querySelector(".val").textContent = v;
      el.classList.toggle("low", v <= 25);
      el.setAttribute("aria-label", LABEL[k] + ": " + v + " de 100");
      if (deltas && deltas[k]) {
        var b = document.createElement("span");
        b.className = "delta " + (deltas[k] > 0 ? "up" : "down");
        b.textContent = (deltas[k] > 0 ? "+" : "") + deltas[k];
        el.appendChild(b);
        setTimeout(function () { b.remove(); }, 1800);
      }
    });
  }
  function change(fx) {
    var real = {};
    KEYS.forEach(function (k) {
      if (!fx[k]) return;
      var before = run.st[k];
      run.st[k] = clamp(before + fx[k]);
      real[k] = run.st[k] - before;
    });
    drawMeters(real);
  }
  function failed() {
    if (run.st.caja <= 0) return "bankrupt";
    if (run.st.equipo <= 0) return "quit";
    return null;
  }

  // ================================================================ dialogue
  var dlg = { open: false, typing: null, full: "", onNext: null, choices: null };

  function speakerOf(line, who) {
    var m = /^\(([^)]+)\)\s+(.+)$/.exec(line);
    if (m) {
      for (var id in D.chars) if (D.chars[id].name.indexOf(m[1]) >= 0) return { who: id, text: m[2] };
    }
    return { who: who, text: line };
  }
  function setSpeaker(who) {
    var pc = $("portrait"), px = pc.getContext("2d");
    px.imageSmoothingEnabled = false;
    px.clearRect(0, 0, 16, 16);
    if (who === "player") {
      px.drawImage(P.sprite(playerLook(), "down", 0), 0, 0);
      $("dlg-who").innerHTML = "Tú <small>aprendiz</small>";
    } else if (who && D.chars[who]) {
      px.drawImage(P.sprite(D.chars[who].look, "down", 0), 0, 0);
      $("dlg-who").innerHTML = esc(D.chars[who].name) + " <small>" + esc(D.chars[who].role) + "</small>";
    } else {
      $("dlg-who").innerHTML = "Narración";
    }
    pc.hidden = !who;
  }
  function openDialog() {
    dlg.open = true;
    mode = "dialog";
    player.path = []; player.talkTo = null; held = null;
    $("dlg").hidden = false;
    $("help").hidden = true;
  }
  function closeDialog() {
    dlg.open = false;
    $("dlg").hidden = true;
    $("help").hidden = false;
    if (mode === "dialog") mode = "play";
    updateHelp();
  }
  function typeText(text, done) {
    var el = $("dlg-text"), i = 0;
    var narration = /^\(.*\)$/.test(text);
    el.className = "say" + (narration ? " narration" : "");
    dlg.full = text;
    clearInterval(dlg.typing);
    el.textContent = "";
    dlg.typing = setInterval(function () {
      i += 2;
      el.textContent = text.slice(0, i);
      if (i >= text.length) { clearInterval(dlg.typing); dlg.typing = null; if (done) done(); }
    }, 22);
    dlg.finishTyping = function () {
      clearInterval(dlg.typing); dlg.typing = null; el.textContent = text; if (done) done();
    };
  }
  // say(who, [lines], done): shows each line, waits for "Continuar"
  function say(who, lines, done) {
    openDialog();
    var i = 0;
    $("dlg-choices").innerHTML = "";
    function next() {
      if (i >= lines.length) { dlg.onNext = null; if (done) done(); else closeDialog(); return; }
      var s = speakerOf(fill(lines[i++]), who);
      setSpeaker(s.who);
      $("dlg-next").hidden = true;
      typeText(s.text, function () {
        $("dlg-next").hidden = false;
        $("dlg-next").focus({ preventScroll: true });
      });
      dlg.onNext = next;
    }
    next();
  }
  function advance() {
    if (!dlg.open) return;
    if (dlg.typing) { dlg.finishTyping(); return; }
    if (dlg.onNext && !$("dlg-next").hidden) dlg.onNext();
  }
  // ask(who, prompt, [labels], done(index))
  function ask(who, prompt, labels, done) {
    openDialog();
    setSpeaker(who);
    dlg.onNext = null;
    $("dlg-next").hidden = true;
    var box = $("dlg-choices");
    box.innerHTML = "";
    typeText(prompt, function () {
      labels.forEach(function (label, i) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "choice";
        b.innerHTML = "<kbd>" + (i + 1) + "</kbd><span>" + esc(label) + "</span>";
        b.onclick = function () { box.innerHTML = ""; dlg.choices = null; done(i); };
        box.appendChild(b);
      });
      // no auto-focus: a player mashing Enter through the lines must not pick an answer by accident
      dlg.choices = box.querySelectorAll("button");
      box.focus({ preventScroll: true });
    });
  }
  function fill(line) {
    var name = SCORM.studentName();
    return line.replace(/,? \{name\}/, name ? ", " + name : "");
  }

  // ================================================================ gameplay
  function interact(n) {
    if (mode !== "play") return;
    var dec = currentDecision();
    if (n.vendor) return vendor(n, dec);
    if (dec && dec.npc === n.id) return decide(dec);
    var lines = n.idle.length ? [n.idle[n.idleI++ % n.idle.length]] : ["…"];
    if (dec) lines.push("Creo que " + charOf(dec.npc).name + " te está buscando.");
    say(n.id, lines);
  }

  function vendor(n, dec) {
    if (!dec) return say(n.id, [n.idle[0]]);
    if (run.hinted[dec.id]) return say(n.id, ["Le repito el consejo, veci:", dec.hint]);
    say(n.id, ["¡Mazamorra, mazamorrita con panela! ¿Le provoca? Son dos mil pesitos… y le regalo un consejo."], function () {
      ask("player", "¿Compras una mazamorra con pista?", ["Sí, una con panela 🥣 (−" + D.hintCost + " de caja)", "No, gracias, veci"], function (i) {
        if (i === 1) return say(n.id, ["¡Listo, veci! Aquí estoy si me necesita."]);
        run.hints++;
        run.hinted[dec.id] = 1;
        change({ caja: -D.hintCost });
        save();
        say(n.id, [dec.hint], function () {
          if (failed()) return fail(failed());
          closeDialog();
        });
      });
    });
  }

  function decide(dec) {
    var order = optionOrder(dec);
    say(dec.npc, dec.lines, function () {
      ask("player", dec.prompt, order.map(function (i) { return dec.options[i].text; }), function (pick) {
        var oi = order[pick], opt = dec.options[oi];
        run.ch[dec.id] = oi;
        change(opt.fx);
        var good = dec.options.map(function (o) { return o.q; }).indexOf("good");
        SCORM.recordInteraction(dec.id, "abc"[oi], "abc"[good],
          opt.q === "good" ? "correct" : opt.q === "partial" ? "neutral" : "wrong");
        save();
        say(dec.npc, [opt.reply], afterDecision);
      });
    });
  }

  function afterDecision() {
    var f = failed();
    if (f) return fail(f);
    if (currentDecision()) { closeDialog(); save(); return; }
    // chapter complete
    if (run.ci === D.chapters.length - 1) return verdict();
    closeDialog();
    run.ci++;
    change({ caja: -D.drain });
    save();
    if (failed()) return fail(failed());
    transit(true);
  }

  function verdict() {
    var st = run.st;
    var win = st.cliente >= D.win.cliente && st.equipo >= D.win.equipo && st.caja > 0;
    say("carmen", [win ? D.endings.verdictWin : D.endings.verdictLose], function () { finish(win); });
  }
  function fail(kind) {
    say("marleny", [D.endings[kind]], function () { finish(false); });
  }

  function finish(win) {
    closeDialog();
    run.end = win ? "win" : "lose";
    if (win) meta.w++;
    var prof = profile();
    meta.h.push({ r: win ? 1 : 0, n: run.n, k: prof.good });
    meta.h = meta.h.slice(-6);
    SCORM.set("cmi.core.lesson_status", "completed");
    save();
    showResults();
  }

  // ================================================================ input
  var KEYMAP = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right" };
  document.addEventListener("keydown", function (e) {
    if (e.target && /TEXTAREA|INPUT/.test(e.target.tagName)) return;
    if (mode === "dialog") {
      if (dlg.choices) {
        var n = parseInt(e.key, 10);
        if (n >= 1 && n <= dlg.choices.length) { e.preventDefault(); dlg.choices[n - 1].click(); return; }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          var list = Array.prototype.slice.call(dlg.choices), i = list.indexOf(document.activeElement);
          if (i < 0) i = e.key === "ArrowDown" ? -1 : 0;
          list[(i + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length].focus();
        }
        return;
      }
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); advance(); }
      return;
    }
    if (mode !== "play") return;
    if (KEYMAP[e.key]) { e.preventDefault(); held = KEYMAP[e.key]; player.path = []; player.talkTo = null; }
    else if (e.key === " " || e.key === "Enter" || e.key === "e" || e.key === "E") {
      e.preventDefault();
      var dx = DIRS[player.dir][0], dy = DIRS[player.dir][1];
      var n2 = npcAt(player.x + dx, player.y + dy);
      if (!n2) {
        var dec = currentDecision();
        world.npcs.forEach(function (c) { if (adjacent(c) && (!n2 || (dec && c.id === dec.npc))) n2 = c; });
      }
      if (n2) { face(n2); interact(n2); }
    }
  });
  document.addEventListener("keyup", function (e) { if (KEYMAP[e.key] === held) held = null; });
  window.addEventListener("blur", function () { held = null; });

  cv.addEventListener("pointerdown", function (e) {
    if (mode === "dialog") { advance(); return; }
    if (mode !== "play") return;
    var r = cv.getBoundingClientRect();
    var tx = Math.floor((e.clientX - r.left) / r.width * 20);
    var ty = Math.floor((e.clientY - r.top) / r.height * 11);
    var n = npcAt(tx, ty) || npcAt(tx, ty + 1); // tapping a head counts too
    if (n) goTalk(n); else goTo(tx, ty);
  });
  $("dlg-next").onclick = advance;
  $("dlg-text").onclick = advance;
  $("btn-mission").onclick = function () {
    var dec = currentDecision();
    if (!dec || mode !== "play") return;
    world.npcs.forEach(function (n) { if (n.id === dec.npc) goTalk(n); });
  };

  function updateHelp() {
    var dec = run && currentDecision();
    $("mission").innerHTML = dec
      ? "🎯 <b>Misión:</b> habla con <b>" + esc(charOf(dec.npc).name) + "</b> (el del signo <b class=\"bang\">!</b>). " +
        "¿Dudas? Don Abelardo vende mazamorra… y pistas."
      : "";
  }

  // ================================================================ screens
  function overlay(html, cls) {
    var o = $("overlay");
    o.className = "overlay " + (cls || "");
    o.innerHTML = html;
    o.hidden = false;
    o.scrollTop = 0;
    var first = o.querySelector("[data-focus]") || o.querySelector("button");
    if (first) first.focus({ preventScroll: true });
    return o;
  }
  function hideOverlay() { $("overlay").hidden = true; }
  function showHud(on) { $("hud").hidden = !on; $("panel").hidden = !on; }

  function titleScreen() {
    mode = "title";
    loadScene(1);
    showHud(false);
    var inProgress = run && !run.end;
    var stats = meta.a ? "<p class=\"stats\">Intentos: <b>" + meta.a + "</b> · Talleres salvados: <b>" + meta.w + "</b></p>" : "";
    var o = overlay(
      "<div class=\"card title-card\">" +
      "<p class=\"kicker\">" + esc(D.course ? D.course.kicker : D.kicker) + "</p>" +
      "<h1>El Scrum más Master<br>del Restrepo</h1>" +
      "<p class=\"lead\">" + esc(D.subtitle) + ".</p>" +
      "<p>Camina por el barrio Restrepo, habla con la gente del taller y toma decisiones con Scrum. " +
      "Cuida la <b>caja</b>, la confianza del <b>cliente</b> y el ánimo del <b>equipo</b>: si uno llega a cero, el taller se quiebra.</p>" +
      stats +
      "<div class=\"actions\">" +
      (inProgress ? "<button class=\"btn primary\" id=\"t-cont\" data-focus>▶ Continuar intento #" + run.n + "</button>" : "") +
      "<button class=\"btn " + (inProgress ? "" : "primary") + "\" id=\"t-new\"" + (inProgress ? "" : " data-focus") + ">" +
      (inProgress ? "↺ Empezar de nuevo" : meta.a ? "▶ Jugar otra vez" : "▶ Jugar") + "</button></div>" +
      "<p class=\"small\">≈ 20 minutos · Flechas/WASD o toca la pantalla para caminar · Espacio/Enter para hablar</p>" +
      "<p class=\"small\">OpenSAI · Código MIT · Contenido CC BY-SA 4.0 · Basado en la Guía Scrum 2020</p>" +
      "</div>", "title");
    if (inProgress) o.querySelector("#t-cont").onclick = function () { transit(false); };
    o.querySelector("#t-new").onclick = chooseAvatar;
  }

  function chooseAvatar() {
    var html = "<div class=\"card\"><h2>Elige tu personaje</h2><p>Llegas al taller del Restrepo con ganas de ayudar. ¿Quién eres?</p><div class=\"avatars\">";
    D.players.forEach(function (p, i) {
      html += "<button class=\"avatar\" data-i=\"" + i + "\"" + (i === 0 ? " data-focus" : "") + " aria-label=\"Personaje " + (i + 1) + "\"><canvas width=\"16\" height=\"16\"></canvas></button>";
    });
    html += "</div></div>";
    var o = overlay(html, "title");
    o.querySelectorAll(".avatar").forEach(function (b) {
      var c = b.querySelector("canvas").getContext("2d");
      c.drawImage(P.sprite(D.players[+b.dataset.i], "down", 0), 0, 0);
      b.onclick = function () { newRun(+b.dataset.i); };
    });
  }

  function newRun(av) {
    meta.a++;
    run = {
      n: meta.a, av: av, ci: 0, ch: {}, hints: 0, hinted: {}, end: null,
      st: { caja: D.start.caja, cliente: D.start.cliente, equipo: D.start.equipo }
    };
    save();
    intro(0);
  }

  function intro(i) {
    if (i >= D.intro.length) return transit(false);
    var o = overlay("<div class=\"card story\"><p class=\"kicker\">Intento #" + run.n + "</p><p class=\"big\">" + esc(D.intro[i]) +
      "</p><div class=\"actions\"><button class=\"btn primary\" data-focus>Siguiente ▸</button></div></div>", "title");
    o.querySelector("button").onclick = function () { intro(i + 1); };
  }

  // Chapter card over an animated Bogotá scene (TransMilenio or the cable car)
  function transit(paid) {
    mode = "transit";
    var ch = chapter();
    loadScene(run.ci === D.chapters.length - 1 ? run.ci : 1);
    world.npcs = [];
    $("hud-chapter").textContent = ch.title;
    $("hud-topic").textContent = ch.topic;
    showHud(true);
    $("panel").hidden = true;
    drawMeters();
    var o = overlay(
      "<div class=\"card transit\"><p class=\"kicker\">" + esc(D.groups[ch.group].name) +
      (D.course ? " · " + esc(D.course.evidence[ch.group]) : "") + "</p>" +
      "<h2>" + esc(ch.title) + "</h2><p>" + esc(ch.transit) + "</p>" +
      (paid ? "<p class=\"cost\">💸 Pagaste nómina, arriendo y cuero: −" + D.drain + " de caja.</p>" : "") +
      "<div class=\"actions\"><button class=\"btn primary\" data-focus>¡A camellar! ▸</button></div></div>", "transit");
    o.querySelector("button").onclick = startChapter;
  }

  function startChapter() {
    hideOverlay();
    loadScene(run.ci);
    showHud(true);
    drawMeters();
    mode = "play";
    updateHelp();
    var ch = chapter();
    var fresh = ch.decisions.every(function (d) { return !(d.id in run.ch); });
    if (fresh && ch.opening) say(ch.opening.who, ch.opening.lines);
  }

  // ================================================================ results
  function profile() {
    var by = {}, good = 0, picks = [];
    D.chapters.forEach(function (ch) {
      ch.decisions.forEach(function (d) {
        if (!(d.id in run.ch)) return;
        var q = d.options[run.ch[d.id]].q;
        by[ch.group] = by[ch.group] || { g: 0, n: 0 };
        by[ch.group].n++;
        if (q === "good") { by[ch.group].g++; good++; }
        picks.push({ d: d, q: q, group: ch.group });
      });
    });
    var best = null, worst = null;
    Object.keys(D.groups).forEach(function (k) {
      if (!by[k]) return;
      var r = by[k].g / by[k].n;
      if (!best || r > best.r) best = { k: k, r: r };
      if (!worst || r < worst.r) worst = { k: k, r: r };
    });
    var perfect = good === TOTAL;
    return {
      good: good, picks: picks, perfect: perfect,
      // a strength title only when it is earned (3 of 4 right in that activity)
      title: perfect ? D.perfectTitle : best && best.r >= 0.75 ? D.groups[best.k].title : D.rookieTitle,
      weak: worst && worst.r < 1 ? D.groups[worst.k].weak : null
    };
  }

  function ref(d) { return d.ref + (d.courseRef ? " · " + d.courseRef : ""); }

  function shareText(win, prof) {
    var e = D.endings[win ? "win" : "lose"];
    var tags = " #" + D.hashtag + " #" + D.campaign;
    if (win) {
      return D.title + " me dijo: «" + e.headline + " " + e.phrase + "» Salvé el taller con Scrum " +
        (run.n === 1 ? "a la primera" : "en el intento #" + run.n) + " (" + prof.title + "). ¿Te le mides al reto?" + tags;
    }
    return D.title + " me dijo: «" + e.phrase + "» " +
      (prof.weak ? "Me rajé en " + prof.weak + ". " : "") + "¿Tú sí salvas el taller con Scrum?" + tags;
  }

  function showResults() {
    mode = "results";
    var win = run.end === "win", e = D.endings[win ? "win" : "lose"], prof = profile();
    var goods = prof.picks.filter(function (p) { return p.q === "good"; });
    var misses = prof.picks.filter(function (p) { return p.q === "bad"; })
      .concat(prof.picks.filter(function (p) { return p.q === "partial"; }));
    // variety: prefer one strength per activity before repeating one
    var shownGood = [], groupsSeen = {};
    goods.forEach(function (p) { if (!groupsSeen[p.group] && shownGood.length < 3) { groupsSeen[p.group] = 1; shownGood.push(p); } });
    goods.forEach(function (p) { if (shownGood.indexOf(p) < 0 && shownGood.length < 3) shownGood.push(p); });

    var congrats;
    if (win && prof.perfect) congrats = "🏆 ¡Perfecto: " + TOTAL + " de " + TOTAL + "! Eres <b>" + esc(D.perfectTitle) + "</b>.";
    else if (win && run.n > 1) congrats = "🏆 ¡Lo lograste en el intento #" + run.n + "! Inspeccionar y adaptar hasta salir adelante: eso es Scrum de verdad.";
    else if (win) congrats = "🎉 ¡A la primera! ¿Te atreves a ser <b>" + esc(D.perfectTitle) + "</b> con " + TOTAL + " de " + TOTAL + "?";
    else congrats = "🔁 Cada intento es un sprint: inspecciona lo que pasó, adapta tus decisiones y vuelve. ¡El taller te espera!";

    var text = shareText(win, prof);
    var card = makeCard(win, prof);
    var dataUrl = card.toDataURL("image/png");
    // each ending has its own landing page, so the link preview matches the result
    var url = D.landing.base + D.landing.pages[win ? "win" : "lose"].path;
    var li = "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(url);
    var fb = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url) + "&hashtag=" + encodeURIComponent("#" + D.hashtag);
    var wa = "https://wa.me/?text=" + encodeURIComponent(text + " " + url);
    var xx = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(url);

    function li_(p, good) {
      return "<li><b>" + esc(p.d.concept) + ".</b> " + esc(good ? p.d.learn.good : p.d.learn.bad) +
        (good ? "" : " <small>📖 " + esc(ref(p.d)) + "</small>") + "</li>";
    }
    var all = prof.picks.map(function (p) {
      var icon = p.q === "good" ? "✅" : p.q === "partial" ? "🟡" : "❌";
      return "<li>" + icon + " " + esc(p.d.concept) + " <small>" + esc(ref(p.d)) + "</small></li>";
    }).join("");

    var meters = KEYS.map(function (k) {
      return "<span class=\"fm\">" + { caja: "💰", cliente: "🤝", equipo: "💪" }[k] + " " + LABEL[k] + " <b>" + run.st[k] + "</b></span>";
    }).join("");

    var o = overlay(
      "<div class=\"card results " + (win ? "win" : "lose") + "\">" +
      "<img class=\"share-card\" src=\"" + dataUrl + "\" alt=\"Tarjeta del resultado: " + esc(e.headline + " " + e.phrase) + "\">" +
      "<p class=\"kicker\">Intento #" + run.n + " · " + prof.good + " de " + TOTAL + " decisiones acertadas · " + run.hints + " mazamorra" + (run.hints === 1 ? "" : "s") + "</p>" +
      "<h2>" + esc(e.headline) + "</h2><p class=\"phrase\">" + esc(e.phrase) + "</p>" +
      "<p>" + esc(e.story) + "</p>" +
      "<p class=\"final-meters\">" + meters + "</p>" +
      "<p class=\"congrats\">" + congrats + "</p>" +
      "<p class=\"profile\">Tu perfil: <b>" + esc(prof.title) + "</b></p>" +
      "<div class=\"fb-grid\">" +
      "<section class=\"fb good\"><h3>✅ Lo que hiciste bien</h3><ul>" +
      (shownGood.length ? shownGood.map(function (p) { return li_(p, true); }).join("") : "<li>Todavía nada… ¡pero ya sabes por dónde empezar!</li>") + "</ul></section>" +
      "<section class=\"fb bad\"><h3>📚 Para estudiar</h3><ul>" +
      (misses.length ? misses.slice(0, 3).map(function (p) { return li_(p, false); }).join("") : "<li>¡Nada! Reto extra: lógralo sin comprar mazamorras 😉</li>") + "</ul><p class=\"small\">" + esc(D.refsNote) + "</p></section>" +
      "</div>" +
      "<details><summary>Ver todas tus decisiones</summary><ol class=\"all\">" + all + "</ol></details>" +
      "<section class=\"share\"><h3>📣 Reta a tus amigos</h3>" +
      "<textarea id=\"share-text\" readonly rows=\"4\">" + esc(text) + "</textarea>" +
      "<div class=\"share-btns\">" +
      "<button class=\"btn\" id=\"copy\">📋 Copiar reto</button>" +
      "<a class=\"btn\" id=\"dl\" download=\"scrum-master-restrepo-intento-" + run.n + ".png\" href=\"" + dataUrl + "\">🖼️ Descargar tarjeta</a>" +
      "<a class=\"btn li\" href=\"" + esc(li) + "\" target=\"_blank\" rel=\"noopener\">LinkedIn</a>" +
      "<a class=\"btn fb\" href=\"" + esc(fb) + "\" target=\"_blank\" rel=\"noopener\">Facebook</a>" +
      "<a class=\"btn wa\" href=\"" + esc(wa) + "\" target=\"_blank\" rel=\"noopener\">WhatsApp</a>" +
      "<a class=\"btn xx\" href=\"" + esc(xx) + "\" target=\"_blank\" rel=\"noopener\">X</a>" +
      "</div><p class=\"small\">LinkedIn y Facebook no aceptan texto precargado: copia el reto, descarga tu tarjeta y pégalos en tu publicación.</p></section>" +
      "<div class=\"actions\"><button class=\"btn primary\" id=\"again\" data-focus>🔁 Intentar de nuevo</button>" +
      "<button class=\"btn\" id=\"home\">Inicio</button></div>" +
      "</div>", "results-o");
    o.querySelector("#again").onclick = chooseAvatar;
    o.querySelector("#home").onclick = titleScreen;
    o.querySelector("#copy").onclick = function () {
      var ta = $("share-text"), btn = this;
      function ok() { btn.textContent = "✅ ¡Copiado!"; setTimeout(function () { btn.textContent = "📋 Copiar reto"; }, 2000); }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(ta.value).then(ok, function () { ta.select(); if (document.execCommand("copy")) ok(); });
      } else { ta.select(); if (document.execCommand("copy")) ok(); }
    };
  }

  // 1200x630 share card (js/cards.js) with this run's attempt, score and profile
  function makeCard(win, prof) {
    var e = D.endings[win ? "win" : "lose"];
    return window.Cards.make(win ? "win" : "lose", {
      top: "Intento #" + run.n + " · " + prof.good + "/" + TOTAL + " decisiones Scrum · " + prof.title,
      headline: e.headline, phrase: e.phrase,
      footer: D.title + " · Reto Scrum · #" + D.hashtag
    });
  }

  // ================================================================ boot
  SCORM.init();
  load();
  window.addEventListener("pagehide", function () { save(); SCORM.finish(false); });
  window.addEventListener("beforeunload", function () { save(); SCORM.finish(false); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) save(); });
  titleScreen();
  requestAnimationFrame(frame);

  // test hook for the harness / console
  window.Juego = { state: function () { return { meta: meta, run: run, mode: mode }; } };
})();
