/*
 * Pixel art drawn in code: no image files. Tiles are 16x16, the screen is
 * 20x11 tiles (320x176 px) and CSS scales it up with crisp pixels.
 *
 *   Pixel.sprite(look, dir, frame)  -> cached 16x16 canvas of a character
 *   Pixel.sceneCanvas(scene, id)    -> cached 320x176 background of a scene
 *   Pixel.drawBus / drawCart / drawScreen / drawCableCar  animated extras
 *   Pixel.text(ctx, str, x, y, color)  3x5 bitmap font for signs
 */
(function () {
  "use strict";

  var T = 16, W = 320, H = 176;

  function rect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  function hash(x, y) {
    var n = (x * 374761393 + y * 668265263) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }
  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.min(255, Math.round(((n >> 16) & 255) * f));
    var g = Math.min(255, Math.round(((n >> 8) & 255) * f));
    var b = Math.min(255, Math.round((n & 255) * f));
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function canvas(w, h) {
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }

  // ------------------------------------------------------------ 3x5 font
  var FONT = {
    A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110",
    E: "111100110100111", F: "111100110100100", G: "011100101101011", H: "101101111101101",
    I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111",
    M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100",
    Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
    U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
    Y: "101101010010010", Z: "111001010100111",
    "0": "111101101101111", "1": "010110010010111", "2": "110001010100111", "3": "110001010001110",
    "4": "101101111001001", "5": "111100110001110", "6": "011100111101111", "7": "111001010010010",
    "8": "111101111101111", "9": "111101111001110",
    ".": "000000000000010", "!": "010010010000010", "?": "110001010000010", "-": "000000111000000",
    "$": "011110010011110", "%": "101001010100101", "/": "001001010100100", ":": "000010000010000",
    "&": "010101010101011", "#": "101111101111101", "+": "000010111010000"
  };
  var ACCENTS = { "Á": "A", "É": "E", "Í": "I", "Ó": "O", "Ú": "U", "Ñ": "N" };

  function text(c, str, x, y, color, scale) {
    var s = scale || 1;
    c.fillStyle = color;
    str = String(str).toUpperCase();
    for (var i = 0; i < str.length; i++) {
      var ch = ACCENTS[str[i]] || str[i], g = FONT[ch];
      if (g) {
        for (var p = 0; p < 15; p++) {
          if (g[p] === "1") c.fillRect(x + (p % 3) * s, y + Math.floor(p / 3) * s, s, s);
        }
      }
      x += 4 * s;
    }
  }
  function textWidth(str, scale) { return String(str).length * 4 * (scale || 1) - (scale || 1); }

  // ------------------------------------------------------------ characters
  // Palette letters: h hair, H hair shade, s skin, S skin shade, e eye,
  // m mouth, t shirt, T shirt shade, p pants, b shoes, a/A accessory,
  // c cap/hat, C cap shade, g glasses frame, w white.
  var BASE = {
    down: [
      "................",
      "......hhhh......",
      "....hhhhhhhh....",
      "...hhhhhhhhhh...",
      "...hhsssssshh...",
      "...hssessessh...",
      "...hssssssssh...",
      "....sssmmsss....",
      ".....SssssS.....",
      "....tttttttt....",
      "...stttttttts...",
      "...sTttttttTs...",
      "....pppppppp....",
      "....ppp..ppp....",
      "....ppp..ppp....",
      "....bbb..bbb...."
    ],
    up: [
      "................",
      "......hhhh......",
      "....hhhhhhhh....",
      "...hhhhhhhhhh...",
      "...hhhhhhhhhh...",
      "...hhhhhhhhhh...",
      "...hHhhhhhhHh...",
      "....sHHHHHHs....",
      ".....SssssS.....",
      "....tttttttt....",
      "...stttttttts...",
      "...sTttttttTs...",
      "....pppppppp....",
      "....ppp..ppp....",
      "....ppp..ppp....",
      "....bbb..bbb...."
    ],
    side: [
      "................",
      "......hhhh......",
      ".....hhhhhhh....",
      "....hhhhhhhhh...",
      "...hhhhhsssss...",
      "...hhhhssses....",
      "...hhhhssssss...",
      "....hhhsssm.....",
      ".....SsssS......",
      ".....tttttt.....",
      ".....tttttts....",
      ".....tTtTTts....",
      ".....pppppp.....",
      ".....ppp.pp.....",
      ".....pp..pp.....",
      ".....bb..bbb...."
    ]
  };
  var WALK = {
    down: ["....ppp..ppp....", "...ppp....ppp...", "...bbb....bbb..."],
    up: ["....ppp..ppp....", "...ppp....ppp...", "...bbb....bbb..."],
    side: ["....pp...pp.....", "...pp.....pp....", "..bbb.....bbb..."]
  };

  function setPx(rows, x, y, ch, onlyIfFilled) {
    if (y < 0 || y > 15 || x < 0 || x > 15) return;
    var r = rows[y];
    if (onlyIfFilled && r[x] === ".") return;
    rows[y] = r.slice(0, x) + ch + r.slice(x + 1);
  }
  function fillRow(rows, y, x0, x1, ch, onlyIfFilled) {
    for (var x = x0; x <= x1; x++) setPx(rows, x, y, ch, onlyIfFilled);
  }

  function spriteRows(look, dir, frame) {
    var base = dir === "left" || dir === "right" ? "side" : dir;
    var rows = BASE[base].slice();
    if (frame === 1) { rows[13] = WALK[base][0]; rows[14] = WALK[base][1]; rows[15] = WALK[base][2]; }
    var style = look.style || "short", acc = look.acc || [];
    var side = base === "side", front = base === "down";

    if (style === "long") {
      for (var y = 6; y <= 11; y++) {
        if (side) { setPx(rows, 4, y, "h"); setPx(rows, 5, y, "h"); }
        else { setPx(rows, 3, y, "h"); setPx(rows, 12, y, "h"); if (base === "up") fillRow(rows, y, 4, 11, "h", true); }
      }
    } else if (style === "bun") {
      rows[0] = ".......hh.......";
      setPx(rows, 6, 0, "h"); setPx(rows, 9, 0, "h");
    } else if (style === "puff") {
      rows[0] = ".....hhhhhh.....";
      rows[1] = "....hhhhhhhh....";
      rows[2] = "...hhhhhhhhhh...";
      rows[3] = "..hhhhhhhhhhhh..";
      setPx(rows, 2, 4, "h"); setPx(rows, 13, 4, "h");
    } else if (style === "bald") {
      for (var by = 1; by <= 3; by++) for (var bx = 0; bx < 16; bx++) if (rows[by][bx] === "h") setPx(rows, bx, by, "s");
      if (base === "up") for (var uy = 4; uy <= 5; uy++) fillRow(rows, uy, 4, 11, "s", true);
    } else if (style === "cap") {
      for (var cy = 1; cy <= 3; cy++) for (var cx = 0; cx < 16; cx++) if (rows[cy][cx] === "h") setPx(rows, cx, cy, "c");
      if (front) fillRow(rows, 4, 3, 12, "C");
      if (side) { fillRow(rows, 4, 8, 13, "C"); }
    } else if (style === "hat") {
      rows[0] = "................";
      rows[1] = ".....cccccc.....";
      rows[2] = ".....cCCCCc.....";
      rows[3] = "..cccccccccccc..";
      if (side) rows[3] = "..ccccccccccccc.";
    }

    if (acc.indexOf("glasses") >= 0) {
      if (front) { setPx(rows, 5, 5, "g"); setPx(rows, 7, 5, "g"); setPx(rows, 8, 5, "g"); setPx(rows, 10, 5, "g"); }
      if (side) { setPx(rows, 9, 5, "g"); setPx(rows, 11, 5, "g"); }
    }
    if (acc.indexOf("mustache") >= 0) {
      if (front) fillRow(rows, 7, 6, 9, "H");
      if (side) { setPx(rows, 9, 7, "H"); setPx(rows, 10, 7, "H"); }
    }
    if (acc.indexOf("apron") >= 0 && base !== "up") {
      var a0 = side ? 7 : 6, a1 = side ? 10 : 9;
      for (var ay = 9; ay <= 13; ay++) fillRow(rows, ay, a0, a1, ay === 9 ? "A" : "a", true);
    }
    if (acc.indexOf("scarf") >= 0) fillRow(rows, 8, 4, 11, "a", true);
    if (acc.indexOf("ruana") >= 0) {
      for (var ry = 9; ry <= 12; ry++) {
        if (side) fillRow(rows, ry, 4, 11, ry === 10 ? "A" : "a");
        else fillRow(rows, ry, 2, 13, ry === 10 ? "A" : "a");
      }
      if (!side) { setPx(rows, 2, 12, "."); setPx(rows, 13, 12, "."); }
    }
    return rows;
  }

  var spriteCache = {};
  function sprite(look, dir, frame) {
    var key = JSON.stringify(look) + dir + frame;
    if (spriteCache[key]) return spriteCache[key];
    var rows = spriteRows(look, dir, frame);
    var hair = look.hair || "#222222", skin = look.skin || "#c68642";
    var shirt = look.shirt || "#1565c0", pants = look.pants || "#263238";
    var acc = look.accColor || "#8d6e63", cap = look.capColor || "#c62828";
    var pal = {
      h: hair, H: shade(hair, 0.6), s: skin, S: shade(skin, 0.8), e: "#1b1b1b", m: shade(skin, 0.62),
      t: shirt, T: shade(shirt, 0.72), p: pants, b: "#2b1b10", a: acc, A: shade(acc, 0.7),
      c: cap, C: shade(cap, 0.7), g: "#1b1b1b", w: "#ffffff"
    };
    var c = canvas(16, 16), x = c.getContext("2d");
    for (var y = 0; y < 16; y++) {
      for (var i = 0; i < 16; i++) {
        var ch = rows[y][i];
        if (ch !== ".") rect(x, i, y, 1, 1, pal[ch] || "#ff00ff");
      }
    }
    if (dir === "left") {
      var f = canvas(16, 16), fx = f.getContext("2d");
      fx.translate(16, 0); fx.scale(-1, 1); fx.drawImage(c, 0, 0);
      c = f;
    }
    spriteCache[key] = c;
    return c;
  }

  // ------------------------------------------------------------ tiles
  var SOLID = "#wMSRGKFBLNDTXPEAnVY f";

  function brick(c, x, y, base, mortar) {
    rect(c, x, y, 16, 16, base);
    for (var r = 0; r < 4; r++) {
      rect(c, x, y + r * 4 + 3, 16, 1, mortar);
      var off = (r % 2) * 4;
      rect(c, x + off, y + r * 4, 1, 3, mortar);
      rect(c, x + off + 8, y + r * 4, 1, 3, mortar);
    }
  }
  function wallFace(c, x, y, scene) {
    rect(c, x, y, 16, 16, scene.wall);
    rect(c, x, y, 16, 2, shade(scene.wall, 0.75));
    rect(c, x, y + 13, 16, 3, "#6e4420");
    rect(c, x, y + 13, 16, 1, "#8b5a2b");
  }
  function miniMonserrate(c, x, y, w, h) {
    // sky, the eastern hills and the white sanctuary on the summit
    rect(c, x, y, w, h, "#8fd0f2");
    rect(c, x, y + Math.floor(h * 0.25), w, 1, "#b3e0f7");
    for (var i = 0; i < w; i++) {
      var top = Math.round(h * 0.45 + Math.abs(i - w * 0.4) * 0.45 - (hash(i, 7) > 0.7 ? 1 : 0));
      rect(c, x + i, y + top, 1, h - top, i % 3 ? "#3f7d3a" : "#356b31");
    }
    var px = x + Math.round(w * 0.4);
    rect(c, px - 1, y + Math.round(h * 0.45) - 3, 3, 3, "#ffffff");
    rect(c, px, y + Math.round(h * 0.45) - 4, 1, 1, "#ffffff");
  }

  var TILES = {
    ".": function (c, x, y, tx, ty) {
      rect(c, x, y, 16, 16, "#a8743f");
      for (var r = 0; r < 4; r++) {
        rect(c, x, y + r * 4 + 3, 16, 1, "#86592f");
        var seam = Math.floor(hash(tx * 4 + r, ty) * 14) + 1;
        rect(c, x + seam, y + r * 4, 1, 3, "#8e6034");
        if (hash(tx, ty * 4 + r) > 0.85) rect(c, x + ((seam + 6) % 15), y + r * 4 + 1, 1, 1, "#7a4f28");
      }
    },
    ",": function (c, x, y, tx, ty) {
      rect(c, x, y, 16, 16, "#a3a09a");
      rect(c, x, y + 15, 16, 1, "#8c8983");
      rect(c, x + 15, y, 1, 16, "#8c8983");
      if (hash(tx, ty) > 0.7) rect(c, x + 4 + Math.floor(hash(ty, tx) * 7), y + 6, 2, 1, "#939089");
    },
    "#": function (c, x, y) { brick(c, x, y, "#5d3a2c", "#45291f"); },
    "w": function (c, x, y, tx, ty, s) { wallFace(c, x, y, s); },
    "M": function (c, x, y, tx, ty, s) {
      wallFace(c, x, y, s);
      rect(c, x + 2, y + 2, 12, 10, "#f5f5f5");
      miniMonserrate(c, x + 3, y + 3, 10, 8);
      rect(c, x + 7, y + 3, 1, 8, "#f5f5f5");
    },
    "S": function (c, x, y, tx, ty, s) {
      wallFace(c, x, y, s);
      var cols = ["#8e2430", "#1b1b1b", "#c68642", "#6d4c41", "#d32f2f", "#fcd116"];
      for (var r = 0; r < 2; r++) {
        rect(c, x + 1, y + 5 + r * 5, 14, 1, "#6e4420");
        for (var k = 0; k < 3; k++) {
          var col = cols[Math.floor(hash(tx * 3 + k, ty + r) * cols.length)];
          rect(c, x + 2 + k * 5, y + 2 + r * 5, 4, 3, col);
          rect(c, x + 2 + k * 5, y + 4 + r * 5, 4, 1, shade(col, 0.6));
        }
      }
    },
    "R": function (c, x, y, tx, ty, s) {
      wallFace(c, x, y, s);
      rect(c, x, y + 2, 16, 11, "#fafafa");
      rect(c, x, y + 2, 16, 1, "#9e9e9e");
      var notes = ["#fff176", "#80deea", "#ef9a9a", "#a5d6a7"];
      for (var k = 0; k < 6; k++) {
        if (hash(tx * 6 + k, 3) > 0.25) rect(c, x + 1 + (k % 3) * 5, y + 4 + Math.floor(k / 3) * 4, 3, 3, notes[(k + tx) % 4]);
      }
      rect(c, x + 15, y + 3, 1, 10, "#bdbdbd");
    },
    "G": function (c, x, y, tx, ty, s) {
      wallFace(c, x, y, s);
      rect(c, x + 1, y + 2, 14, 11, "#fafafa");
      rect(c, x + 2, y + 3, 1, 9, "#424242");
      rect(c, x + 2, y + 11, 12, 1, "#424242");
      for (var i = 0; i < 11; i++) {
        rect(c, x + 3 + i, y + 3 + Math.floor(i * 0.75), 1, 1, "#90caf9");
        var real = i < 4 ? 3 + i : i < 7 ? 6 : 6 + (i - 6);
        rect(c, x + 3 + i, y + Math.min(10, 1 + real), 1, 1, "#e53935");
      }
    },
    "K": function (c, x, y, tx, ty, s) {
      wallFace(c, x, y, s);
      rect(c, x, y + 2, 16, 11, "#263238");
      var head = ["#fcd116", "#003893", "#ce1126"][tx % 3];
      rect(c, x + 1, y + 3, 14, 2, head);
      var n = [4, 2, 3][tx % 3];
      for (var k = 0; k < n; k++) rect(c, x + 2 + (k % 2) * 6, y + 6 + Math.floor(k / 2) * 3, 5, 2, "#fff8e1");
    },
    "F": function (c, x, y, tx, ty, s) {
      wallFace(c, x, y, s);
      rect(c, x, y + 3, 16, 1, "#5d4037");
      var cols = ["#fcd116", "#003893", "#ce1126"];
      for (var k = 0; k < 4; k++) {
        var col = cols[(k + tx) % 3];
        rect(c, x + k * 4, y + 4, 3, 1, col);
        rect(c, x + k * 4 + 1, y + 5, 1, 2, col);
      }
      // a small Colombian flag
      if (tx % 2 === 0) {
        rect(c, x + 4, y + 8, 8, 2, "#fcd116"); rect(c, x + 4, y + 10, 8, 1, "#003893"); rect(c, x + 4, y + 11, 8, 1, "#ce1126");
      }
    },
    "B": function (c, x, y, tx, ty) {
      floorUnder(c, x, y, tx, ty);
      rect(c, x, y + 2, 16, 10, "#6d4c41");
      rect(c, x, y + 2, 16, 2, "#8d6e63");
      rect(c, x + 1, y + 12, 2, 4, "#4e342e"); rect(c, x + 13, y + 12, 2, 4, "#4e342e");
      rect(c, x + 3, y + 5, 7, 5, "#c68642");
      rect(c, x + 4, y + 6, 5, 3, "#b07136");
      rect(c, x + 11, y + 5, 1, 5, "#cfd8dc"); rect(c, x + 12, y + 6, 2, 1, "#212121");
    },
    "L": function (c, x, y, tx, ty) {
      floorUnder(c, x, y, tx, ty);
      var cols = ["#5d4037", "#1b1b1b", "#8e2430"];
      for (var k = 0; k < 3; k++) {
        var col = cols[(k + tx) % 3];
        rect(c, x + 1 + k * 5, y + 3, 4, 12, col);
        rect(c, x + 1 + k * 5, y + 3, 4, 2, shade(col, 1.4));
        rect(c, x + 2 + k * 5, y + 3, 2, 1, shade(col, 0.6));
      }
    },
    "N": function (c, x, y, tx, ty) {
      floorUnder(c, x, y, tx, ty);
      rect(c, x, y + 4, 16, 8, "#78909c");
      rect(c, x, y + 4, 16, 1, "#b0bec5");
      rect(c, x + 1, y + 12, 2, 4, "#455a64"); rect(c, x + 13, y + 12, 2, 4, "#455a64");
      rect(c, x + 3, y + 0, 9, 3, "#212121"); rect(c, x + 10, y + 0, 2, 6, "#212121");
      rect(c, x + 3, y + 3, 2, 3, "#212121"); rect(c, x + 4, y + 1, 4, 1, "#c9a227");
    },
    "D": function (c, x, y, tx, ty) {
      floorUnder(c, x, y, tx, ty);
      rect(c, x, y + 6, 16, 6, "#8d6e63");
      rect(c, x, y + 6, 16, 1, "#a1887f");
      rect(c, x + 1, y + 12, 2, 4, "#5d4037"); rect(c, x + 13, y + 12, 2, 4, "#5d4037");
      if (tx % 2 === 0) {
        rect(c, x + 4, y, 10, 6, "#263238");
        rect(c, x + 5, y + 1, 8, 4, "#4fc3f7");
        rect(c, x + 6, y + 2, 4, 1, "#e1f5fe");
        rect(c, x + 8, y + 6, 2, 1, "#263238");
      } else {
        rect(c, x + 2, y + 4, 4, 2, "#fafafa");
        rect(c, x + 9, y + 3, 3, 3, "#efebe9"); rect(c, x + 10, y + 4, 1, 1, "#4e342e");
      }
    },
    "T": function (c, x, y, tx, ty) {
      floorUnder(c, x, y, tx, ty);
      rect(c, x, y, 16, 16, "#a1887f");
      rect(c, x, y, 16, 1, "#bcaaa4");
      if (hash(tx, ty) > 0.5) { rect(c, x + 5, y + 5, 3, 3, "#efebe9"); rect(c, x + 6, y + 6, 1, 1, "#4e342e"); }
      else rect(c, x + 3, y + 7, 9, 4, "#fff9c4");
    },
    "X": function (c, x, y, tx, ty) {
      floorUnder(c, x, y, tx, ty);
      for (var k = 0; k < 3; k++) {
        var col = k % 2 ? "#e67e22" : "#d35400";
        rect(c, x + 1, y + 2 + k * 4, 14, 4, col);
        rect(c, x + 1, y + 2 + k * 4, 14, 1, shade(col, 1.25));
        rect(c, x + 6, y + 3 + k * 4, 4, 2, "#fff3e0");
      }
    },
    "P": function (c, x, y, tx, ty, s) {
      if (s.id === "calle") TILES.s(c, x, y, tx, ty); else floorUnder(c, x, y, tx, ty);
      rect(c, x + 4, y + 10, 8, 6, "#bf5b2c");
      rect(c, x + 4, y + 10, 8, 1, "#d77a48");
      rect(c, x + 3, y + 2, 10, 8, "#2e7d32");
      rect(c, x + 5, y + 0, 6, 4, "#43a047");
      rect(c, x + 2, y + 5, 3, 3, "#43a047"); rect(c, x + 11, y + 4, 3, 3, "#388e3c");
    },
    "E": function (c, x, y) {
      brick(c, x, y, "#5d3a2c", "#45291f");
      rect(c, x, y, 16, 12, "#3e2723");
      rect(c, x + 1, y + 1, 14, 11, "#8d5a2b");
      rect(c, x + 2, y + 13, 12, 3, "#795548");
    },
    // ---- outdoors
    "s": function (c, x, y, tx, ty) {
      rect(c, x, y, 16, 16, "#b8b4ab");
      rect(c, x, y + 7, 16, 1, "#a19c92"); rect(c, x, y + 15, 16, 1, "#a19c92");
      rect(c, x + (ty % 2 ? 3 : 11), y, 1, 7, "#a19c92"); rect(c, x + (ty % 2 ? 11 : 3), y + 8, 1, 7, "#a19c92");
      if (hash(tx, ty) > 0.88) rect(c, x + 6, y + 10, 1, 1, "#7d796f");
    },
    "r": function (c, x, y, tx, ty) {
      rect(c, x, y, 16, 16, "#454545");
      if (hash(tx, ty) > 0.6) rect(c, x + Math.floor(hash(ty, tx) * 14), y + 5, 2, 1, "#3c3c3c");
    },
    "=": function (c, x, y) {
      rect(c, x, y, 16, 16, "#454545");
      rect(c, x + 2, y + 7, 8, 2, "#f5f5f5");
    },
    "z": function (c, x, y) {
      rect(c, x, y, 16, 16, "#454545");
      for (var k = 0; k < 4; k++) rect(c, x + 1, y + k * 4, 14, 2, "#f5f5f5");
    },
    "n": function (c, x, y, tx, ty, s) {
      brick(c, x, y, "#b5563b", "#8f3f2a");
      var awn = tx % 4 < 2 ? "#ce1126" : "#003893";
      rect(c, x, y + 4, 16, 9, "#2b2b2b");
      rect(c, x, y + 13, 16, 3, awn);
      for (var k = 0; k < 4; k++) rect(c, x + k * 4, y + 13, 2, 3, "#fafafa");
    },
    "A": function (c, x, y, tx) {
      rect(c, x, y, 16, 16, "#d9c7a8");
      if (tx % 3 === 1) {
        rect(c, x + 3, y + 2, 10, 14, "#5d4037");
        rect(c, x + 4, y + 3, 8, 13, "#3e2723");
        rect(c, x + 10, y + 9, 1, 2, "#c9a227");
      } else {
        rect(c, x + 1, y + 2, 14, 11, "#90caf9");
        rect(c, x + 1, y + 2, 14, 1, "#e3f2fd");
        var cols = ["#8e2430", "#1b1b1b", "#c68642", "#fcd116"];
        for (var k = 0; k < 3; k++) {
          rect(c, x + 2 + k * 4, y + 9, 3, 2, cols[(k + tx) % 4]);
          rect(c, x + 2 + k * 4, y + 6, 3, 2, cols[(k + tx + 2) % 4]);
        }
        rect(c, x, y + 13, 16, 3, "#8d6e63");
      }
    },
    "V": function (c, x, y, tx) {
      rect(c, x, y, 16, 16, "#b8b4ab");
      rect(c, x, y + 1, 16, 12, "#cfd8dc");
      rect(c, x, y + 1, 16, 2, "#c62828");
      rect(c, x + 1, y + 4, 6, 8, "#81d4fa"); rect(c, x + 9, y + 4, 6, 8, "#81d4fa");
      rect(c, x, y + 13, 16, 3, "#78909c");
      if (tx === 0) rect(c, x, y + 1, 1, 12, "#607d8b");
    },
    "g": function (c, x, y, tx, ty) {
      rect(c, x, y, 16, 16, "#5e8c3a");
      for (var k = 0; k < 5; k++) rect(c, x + Math.floor(hash(tx * 5 + k, ty) * 15), y + Math.floor(hash(ty * 5 + k, tx) * 15), 1, 1, k % 2 ? "#6fa046" : "#4f7a30");
    },
    "p": function (c, x, y, tx, ty) {
      rect(c, x, y, 16, 16, "#b0a796");
      rect(c, x, y + 7, 16, 1, "#978d7b"); rect(c, x, y + 15, 16, 1, "#978d7b");
      rect(c, x + (ty % 2 ? 5 : 12), y, 1, 7, "#978d7b"); rect(c, x + (ty % 2 ? 12 : 5), y + 8, 1, 7, "#978d7b");
    },
    "Y": function (c, x, y, tx, ty) {
      TILES.g(c, x, y, tx, ty);
      // frailejón: furry trunk and a rosette of silver-green leaves
      rect(c, x + 7, y + 7, 3, 9, "#6d5a3f");
      rect(c, x + 7, y + 8, 1, 7, "#7e6b4c");
      rect(c, x + 3, y + 2, 10, 5, "#9fb38f");
      rect(c, x + 5, y + 1, 6, 1, "#b8c9a8"); rect(c, x + 2, y + 4, 12, 2, "#8aa078");
      rect(c, x + 7, y + 3, 2, 1, "#fcd116");
    },
    "f": function (c, x, y, tx) {
      // railing over the city view
      rect(c, x, y, 16, 16, "#2f3e55");
      for (var k = 0; k < 4; k++) {
        var h = 2 + Math.floor(hash(tx * 4 + k, 1) * 6);
        rect(c, x + k * 4, y + 16 - h - 4, 3, h, "#566a85");
        if (hash(tx, k) > 0.4) rect(c, x + k * 4 + 1, y + 16 - h - 3, 1, 1, "#fcd116");
      }
      rect(c, x, y + 1, 16, 2, "#8d6e63"); rect(c, x, y + 1, 16, 1, "#a1887f");
      rect(c, x + 3, y + 3, 1, 4, "#6d4c41"); rect(c, x + 11, y + 3, 1, 4, "#6d4c41");
    }
  };
  var floorOf = { taller: ".", oficina: ".", planta: "," };
  var currentScene = null;
  function floorUnder(c, x, y, tx, ty) {
    var f = currentScene && floorOf[currentScene.id] || ".";
    TILES[f](c, x, y, tx, ty, currentScene);
  }

  // ------------------------------------------------------------ backdrops
  function cerros(c, horizon, baseY) {
    // Bogotá's eastern hills: Monserrate (left, with the white sanctuary)
    // and Guadalupe (right, with its statue).
    for (var x = 0; x < W; x++) {
      var d1 = Math.abs(x - 96), d2 = Math.abs(x - 236);
      var top = Math.min(horizon + d1 * 0.32, horizon + 4 + d2 * 0.3, horizon + 14);
      top = Math.round(top + (hash(x, 3) > 0.75 ? 1 : 0));
      rect(c, x, top, 1, baseY - top, x % 4 ? "#3f7d3a" : "#386f34");
      if (hash(x, 9) > 0.8) rect(c, x, top + 2 + Math.floor(hash(9, x) * 6), 1, 1, "#2f5f2b");
    }
    // sanctuary
    rect(c, 92, horizon - 5, 9, 5, "#ffffff");
    rect(c, 93, horizon - 8, 2, 3, "#ffffff"); rect(c, 98, horizon - 8, 2, 3, "#ffffff");
    rect(c, 95, horizon - 3, 3, 3, "#c62828");
    // Guadalupe statue
    rect(c, 235, horizon - 1, 2, 5, "#eeeeee"); rect(c, 234, horizon, 4, 1, "#eeeeee");
    // cable car line
    for (var i = 0; i < 17; i++) rect(c, 100 + i * 2, horizon + 2 + i, 1, 1, "#333333");
  }

  function sky(c, h) {
    var bands = ["#6ec1ee", "#7fc9f0", "#93d2f2", "#a8dbf5", "#bde4f7"];
    for (var i = 0; i < bands.length; i++) rect(c, 0, Math.floor(i * h / bands.length), W, Math.ceil(h / bands.length), bands[i]);
    var clouds = [[30, 6], [150, 3], [262, 9]];
    clouds.forEach(function (p) {
      rect(c, p[0], p[1] + 2, 22, 3, "#ffffff"); rect(c, p[0] + 5, p[1], 10, 3, "#ffffff");
    });
  }

  var BACKDROPS = {
    calle: function (c) {
      sky(c, 32);
      cerros(c, 9, 32);
    },
    monserrate: function (c) {
      sky(c, 48);
      // far hills behind the sanctuary
      for (var x = 0; x < W; x++) {
        var top = Math.round(30 + Math.sin(x / 23) * 3 + hash(x, 5) * 2);
        rect(c, x, top, 1, 48 - top, "#4a7f45");
      }
      // Santuario de Monserrate: white façade with two towers
      var cx = 160;
      rect(c, cx - 30, 14, 60, 34, "#fafafa");
      rect(c, cx - 30, 14, 60, 1, "#e0e0e0");
      rect(c, cx - 36, 4, 12, 44, "#ffffff"); rect(c, cx + 24, 4, 12, 44, "#ffffff");
      rect(c, cx - 36, 4, 12, 2, "#c62828"); rect(c, cx + 24, 4, 12, 2, "#c62828");
      rect(c, cx - 33, 0, 6, 4, "#ffffff"); rect(c, cx + 27, 0, 6, 4, "#ffffff");
      rect(c, cx - 32, 10, 4, 6, "#5d4037"); rect(c, cx + 28, 10, 4, 6, "#5d4037");
      rect(c, cx - 8, 6, 16, 8, "#ffffff");
      rect(c, cx - 1, 1, 2, 6, "#c9a227"); rect(c, cx - 3, 3, 6, 1, "#c9a227");
      rect(c, cx - 6, 30, 12, 18, "#6d4c41"); rect(c, cx - 5, 31, 10, 17, "#4e342e");
      rect(c, cx - 4, 18, 8, 8, "#90caf9"); rect(c, cx - 4, 21, 8, 1, "#fafafa"); rect(c, cx - 1, 18, 1, 8, "#fafafa");
      rect(c, cx - 22, 24, 6, 9, "#90caf9"); rect(c, cx + 16, 24, 6, 9, "#90caf9");
      // teleférico station on the left
      rect(c, 12, 26, 40, 22, "#eceff1"); rect(c, 12, 26, 40, 3, "#c62828"); rect(c, 18, 33, 28, 10, "#81d4fa");
      text(c, "TELEFERICO", 13, 20, "#ffffff");
    }
  };

  var sceneCache = {};
  function sceneCanvas(scene, id) {
    if (sceneCache[id]) return sceneCache[id];
    scene.id = id;
    currentScene = scene;
    var cv = canvas(W, H), c = cv.getContext("2d");
    if (BACKDROPS[id]) BACKDROPS[id](c);
    for (var ty = 0; ty < scene.map.length; ty++) {
      for (var tx = 0; tx < 20; tx++) {
        var ch = scene.map[ty][tx];
        if (ch === " ") continue;
        var fn = TILES[ch];
        if (fn) fn(c, tx * T, ty * T, tx, ty, scene);
      }
    }
    (scene.signs || []).forEach(function (s) {
      var w = textWidth(s.text);
      rect(c, s.x - 2, s.y - 2, w + 4, 9, "rgba(0,0,0,0.55)");
      text(c, s.text, s.x, s.y, s.color);
    });
    sceneCache[id] = cv;
    return cv;
  }

  function isSolid(ch) { return SOLID.indexOf(ch) >= 0; }

  // ------------------------------------------------------------ extras
  function drawBus(c, x, y) {
    // articulated TransMilenio bus, red with a white band
    for (var seg = 0; seg < 2; seg++) {
      var sx = x + seg * 46;
      rect(c, sx, y, 42, 22, "#d71920");
      rect(c, sx, y, 42, 2, "#ef5350");
      for (var k = 0; k < 5; k++) rect(c, sx + 3 + k * 8, y + 4, 6, 7, "#1a237e");
      for (var j = 0; j < 5; j++) rect(c, sx + 4 + j * 8, y + 5, 2, 2, "#5c6bc0");
      rect(c, sx, y + 13, 42, 2, "#fafafa");
      rect(c, sx + 6, y + 19, 7, 6, "#1b1b1b"); rect(c, sx + 29, y + 19, 7, 6, "#1b1b1b");
      rect(c, sx + 8, y + 21, 3, 2, "#9e9e9e"); rect(c, sx + 31, y + 21, 3, 2, "#9e9e9e");
    }
    rect(c, x + 42, y + 3, 4, 16, "#424242");
    for (var a = 0; a < 4; a++) rect(c, x + 42, y + 4 + a * 4, 4, 1, "#616161");
    rect(c, x + 88, y + 4, 2, 9, "#90caf9");
    rect(c, x + 87, y + 16, 3, 2, "#fff59d");
    text(c, "TM", x + 50, y + 16, "#d71920");
  }

  function drawCart(c, x, y) {
    // mazamorra cart: steaming pot on top, yellow sign, two wheels
    rect(c, x + 3, y - 1, 10, 5, "#9e9e9e"); rect(c, x + 3, y - 1, 10, 1, "#cfd8dc");
    rect(c, x + 4, y, 8, 1, "#fff8e1");
    rect(c, x + 6, y - 4, 1, 2, "rgba(255,255,255,0.7)"); rect(c, x + 9, y - 5, 1, 3, "rgba(255,255,255,0.7)");
    rect(c, x, y + 4, 16, 8, "#fcd116");
    rect(c, x, y + 4, 16, 1, "#fff176");
    text(c, "MAZA", x + 1, y + 6, "#8e2430");
    rect(c, x + 2, y + 12, 4, 4, "#212121"); rect(c, x + 10, y + 12, 4, 4, "#212121");
    rect(c, x + 3, y + 13, 2, 2, "#757575"); rect(c, x + 11, y + 13, 2, 2, "#757575");
  }

  function drawScreen(c, x, y, look, t) {
    // laptop on a desk with Carmen on a video call
    rect(c, x + 2, y - 3, 12, 9, "#263238");
    rect(c, x + 3, y - 2, 10, 7, "#b3e5fc");
    rect(c, x + 6, y - 2, 4, 2, look.hair);
    rect(c, x + 6, y, 4, 3, look.skin);
    rect(c, x + 7, y + 1, 1, 1, "#1b1b1b"); rect(c, x + 8, y + 1, 1, 1, "#1b1b1b");
    rect(c, x + 5, y + 3, 6, 2, look.shirt);
    rect(c, x + 6, y + 3, 4, 1, look.accColor || "#c62828");
    if (Math.floor(t / 500) % 2) rect(c, x + 12, y - 2, 1, 1, "#e53935");
    rect(c, x + 1, y + 6, 14, 1, "#455a64");
  }

  function drawCableCar(c, t) {
    var k = (t / 9000) % 1;
    var x = 100 + k * 30, y = 11 + k * 15;
    rect(c, x, y, 1, 3, "#333333");
    rect(c, x - 3, y + 3, 7, 5, "#c62828");
    rect(c, x - 2, y + 4, 5, 2, "#bbdefb");
  }

  function drawMarker(c, x, y, t, kind) {
    var bob = Math.round(Math.sin(t / 180) * 1.5);
    var col = kind === "hint" ? "#39a900" : "#fcd116";
    rect(c, x + 5, y - 11 + bob, 7, 9, "#1b1b1b");
    rect(c, x + 6, y - 10 + bob, 5, 7, col);
    rect(c, x + 7, y - 4 + bob, 3, 2, "#1b1b1b");
    if (kind === "hint") { rect(c, x + 7, y - 9 + bob, 3, 1, "#ffffff"); rect(c, x + 8, y - 8 + bob, 1, 2, "#ffffff"); }
    else { rect(c, x + 8, y - 9 + bob, 1, 3, "#1b1b1b"); rect(c, x + 8, y - 5 + bob, 1, 1, "#1b1b1b"); }
  }

  window.Pixel = {
    T: T, W: W, H: H,
    rect: rect, shade: shade, hash: hash, canvas: canvas,
    text: text, textWidth: textWidth,
    sprite: sprite, sceneCanvas: sceneCanvas, isSolid: isSolid,
    drawBus: drawBus, drawCart: drawCart, drawScreen: drawScreen,
    drawCableCar: drawCableCar, drawMarker: drawMarker, cerros: cerros, sky: sky,
    tile: function (c, ch, x, y, tx, ty, scene) { currentScene = scene; if (TILES[ch]) TILES[ch](c, x, y, tx, ty, scene); }
  };
})();
