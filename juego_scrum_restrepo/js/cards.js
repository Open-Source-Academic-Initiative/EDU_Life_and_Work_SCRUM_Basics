/*
 * 1200x630 share cards (Open Graph size): a pixel scene drawn at 300x158 and
 * scaled 4x, plus a text band. Used by the game's results screen and by
 * tests/og_render.html, which renders the landing-page preview images.
 *
 *   Cards.make("win" | "lose" | "reto", { top, headline, phrase, footer })
 */
(function () {
  "use strict";

  var P = window.Pixel, D = window.STORY;

  function scene(kind) {
    var s = P.canvas(300, 158), c = s.getContext("2d"), r = P.rect;
    c.imageSmoothingEnabled = false;
    if (kind === "win") {
      for (var i = 0; i < 6; i++) r(c, 0, i * 18, 300, 18, ["#0b1640", "#13205a", "#1b2b70", "#253886", "#2f459b", "#3a52ad"][i]);
      for (var k = 0; k < 30; k++) r(c, Math.floor(P.hash(k, 1) * 300), Math.floor(P.hash(1, k) * 60), 1, 1, "#ffffff");
      for (var l = 0; l < 25; l++) r(c, l * 12 + 4, 18 + Math.round(Math.sin(l) * 3), 2, 2, ["#fcd116", "#ff8a65", "#80deea"][l % 3]);
      r(c, 0, 92, 300, 66, "#6d4c41");
      for (var f = 0; f < 10; f++) r(c, f * 30, 92, 1, 66, "#5d4037");
      r(c, 0, 92, 300, 2, "#8d6e63");
      P.text(c, "MADRID", 12, 40, "#fcd116", 2);
      // plane
      r(c, 220, 34, 26, 4, "#eceff1"); r(c, 230, 28, 6, 14, "#cfd8dc"); r(c, 244, 31, 3, 4, "#cfd8dc");
      var dancerA = { skin: "#c68642", hair: "#2b1a10", style: "long", shirt: "#d32f2f", pants: "#d32f2f" };
      var dancerB = { skin: "#8d5524", hair: "#111111", style: "short", shirt: "#fafafa", pants: "#212121" };
      c.drawImage(P.sprite(dancerA, "right", 1), 0, 0, 16, 16, 108, 52, 48, 48);
      c.drawImage(P.sprite(dancerB, "left", 1), 0, 0, 16, 16, 148, 52, 48, 48);
      for (var b = 0; b < 3; b++) { r(c, 222, 74 + b * 8, 40, 7, b % 2 ? "#e67e22" : "#d35400"); r(c, 230, 76 + b * 8, 24, 3, "#fff3e0"); }
      P.text(c, "RESTREPO", 226, 68, "#fcd116");
    } else if (kind === "lose") {
      for (var j = 0; j < 4; j++) r(c, 0, j * 15, 300, 15, ["#78909c", "#8a9ba5", "#9aa9b1", "#aab6bc"][j]);
      r(c, 0, 50, 300, 70, "#b5563b");
      for (var y = 0; y < 17; y++) r(c, 0, 52 + y * 4, 300, 1, "#8f3f2a");
      r(c, 70, 58, 160, 62, "#9e9e9e");
      for (var g = 0; g < 15; g++) r(c, 70, 60 + g * 4, 160, 1, "#757575");
      r(c, 96, 70, 108, 20, "#fafafa");
      P.text(c, "SE ARRIENDA", 106, 76, "#c62828", 2);
      r(c, 0, 120, 300, 38, "#9e9a92");
      c.drawImage(P.sprite(D.chars.marleny.look, "down", 0), 0, 0, 16, 16, 18, 50, 48, 48);
      for (var d = 0; d < 60; d++) r(c, Math.floor(P.hash(d, 3) * 300), Math.floor(P.hash(3, d) * 150), 1, 3, "rgba(200,220,255,0.7)");
    } else {
      // "reto": the Restrepo street with Monserrate, a TransMilenio bus and the cast
      // the text band covers y >= 101, so the cast stands on the sidewalk at 2x
      c.drawImage(P.sceneCanvas(D.scenes.calle, "calle"), 10, 0, 300, 158, 0, 0, 300, 158);
      var cast = [[D.players[0], "right", 30], [D.chars.marleny.look, "down", 70], [D.players[3], "left", 110], [D.chars.abelardo.look, "left", 210]];
      cast.forEach(function (p) { c.drawImage(P.sprite(p[0], p[1], 0), 0, 0, 16, 16, p[2], 64, 32, 32); });
      var cart = P.canvas(16, 20), cc = cart.getContext("2d");
      P.drawCart(cc, 0, 4);
      c.drawImage(cart, 0, 0, 16, 20, 242, 60, 32, 40);
    }
    return s;
  }

  function wrap(x, text, left, top, width, lh) {
    var words = text.split(" "), line = "";
    words.forEach(function (w) {
      var test = line ? line + " " + w : w;
      if (x.measureText(test).width > width && line) { x.fillText(line, left, top); top += lh; line = w; }
      else line = test;
    });
    if (line) x.fillText(line, left, top);
  }

  function make(kind, o) {
    var cv = P.canvas(1200, 630), x = cv.getContext("2d");
    x.imageSmoothingEnabled = false;
    x.drawImage(scene(kind), 0, 0, 1200, 632);
    var font = "system-ui, 'Segoe UI', Roboto, sans-serif";
    x.fillStyle = "rgba(16,12,28,0.86)";
    x.fillRect(0, 404, 1200, 226);
    x.fillStyle = kind === "lose" ? "#ff8a80" : "#fcd116";
    var size = 58;  // shrink long headlines to fit one line
    do { x.font = "bold " + size + "px " + font; size -= 2; } while (x.measureText(o.headline).width > 1120 && size > 30);
    x.fillText(o.headline, 40, 468);
    x.fillStyle = "#ffffff";
    x.font = "600 32px " + font;
    wrap(x, o.phrase, 40, 516, 1120, 38);
    x.fillStyle = "#b9f6ca";
    x.font = "600 24px " + font;
    x.fillText(o.footer, 40, 610);
    if (o.top) {
      x.fillStyle = "rgba(16,12,28,0.78)";
      x.fillRect(0, 0, 1200, 64);
      x.fillStyle = "#ffffff";
      x.font = "600 26px " + font;
      x.fillText(o.top, 40, 42);
    }
    return cv;
  }

  window.Cards = { make: make };
})();
