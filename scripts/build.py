"""Build the game: story data, SCORM manifest and zip package.

    python3 scripts/build.py            # full build -> dist/Juego_Scrum_Master_Restrepo_SCORM.zip (generic)
                                        #   + one zip per local course profile (..._<SUFFIX>_SCORM.zip)
    python3 scripts/build.py --no-zip   # refresh the package folder only (fast preview)
    python3 scripts/build.py --no-zip --profile <id>   # preview a course profile
    python3 scripts/build.py --check    # validate the story, write nothing
    python3 scripts/build.py --sim      # validate + print the game-balance simulation

Inputs
    content/story.json         chapters, scenes, characters, decisions (Spanish, course-neutral)
    content/profiles/*.json    optional, local (not tracked) course profiles: kicker, evidence per
                               group, extra reference per decision — see content/profiles/README.md
Outputs (inside juego_scrum_restrepo/, the SCORM package root)
    js/story-data.js           generated from story.json
    imsmanifest.xml            SCORM 1.2 manifest listing every packaged file
Outputs (full build only)
    dist/*_SCORM.zip           generic edition + one per course profile
    dist/reto-scrum/           public landing site for campus.opensai.org/reto-scrum/:
                               challenge page, one page per ending (own Open Graph image),
                               jugar/ (open edition, playable without login), descargas/ (zip)
    The Open Graph images come from assets/og/ (see scripts/og_server.py).
No third-party Python packages needed.
"""

import argparse
import hashlib
import itertools
import json
import os
import random
import re
import sys
import zipfile
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG = os.path.join(ROOT, "juego_scrum_restrepo")
SHELL = "juego.html"
CONTENT = os.path.join(ROOT, "content", "story.json")
PROFILES = os.path.join(ROOT, "content", "profiles")
DIST = os.path.join(ROOT, "dist")
OG = os.path.join(ROOT, "assets", "og")
ZIP_BASE = "Juego_Scrum_Master_Restrepo"
EXCLUDE = re.compile(r"(^|/)(\.|.*\.py$)")

# Must match js/pixel.js (SOLID) and js/game.js (walkable): road tiles are solid too.
SOLID = set("#wMSRGKFBLNDTXPEAnVY f") | set("r=")
KNOWN_TILES = SOLID | set(".,szpg")
INDICATORS = ("caja", "cliente", "equipo")


def fail(errors):
    for e in errors:
        print(f"  ✗ {e}")
    sys.exit(f"\nBuild failed with {len(errors)} error(s).")


# --------------------------------------------------------------- validation
def validate(story):
    errors = []
    chars = story["chars"]
    for sid, scene in story["scenes"].items():
        m = scene["map"]
        if len(m) != 11:
            errors.append(f"scene {sid}: map has {len(m)} rows (expected 11)")
        for y, row in enumerate(m):
            if len(row) != 20:
                errors.append(f"scene {sid}: row {y} has {len(row)} columns (expected 20)")
            bad = set(row) - KNOWN_TILES
            if bad:
                errors.append(f"scene {sid}: row {y} has unknown tiles {sorted(bad)}")

    L = story.get("landing", {})
    for key in ("reto", "win", "lose"):
        page = L.get("pages", {}).get(key)
        if not page:
            errors.append(f"landing: missing page {key}")
            continue
        if "path" not in page:
            errors.append(f"landing.{key}: missing path")
        for field in ("image", "title", "headline", "description"):
            if not page.get(field):
                errors.append(f"landing.{key}: missing {field}")
        if page.get("image") and not re.fullmatch(r"og-[a-z0-9-]+\.png", page["image"]):
            errors.append(f"landing.{key}: image must look like og-name.png")
    if not str(L.get("base", "")).startswith("https://") or not str(L.get("base", "")).endswith("/"):
        errors.append("landing.base must be an https:// URL ending in /")

    ids = set()
    for ch in story["chapters"]:
        where = ch["id"]
        if ch["group"] not in story["groups"]:
            errors.append(f"{where}: unknown group {ch['group']}")
        scene = story["scenes"].get(ch["scene"])
        if not scene:
            errors.append(f"{where}: unknown scene {ch['scene']}")
            continue
        m = scene["map"]

        def tile(x, y):
            return m[y][x] if 0 <= y < len(m) and 0 <= x < len(m[y]) else "#"

        occupied = set()
        for n in ch["npcs"]:
            if n["id"] not in chars:
                errors.append(f"{where}: npc {n['id']} not in chars")
            pos = (n["x"], n["y"])
            occupied.add(pos)
            if n.get("screen"):
                if tile(*pos) != "D":
                    errors.append(f"{where}: screen npc {n['id']} must sit on a desk tile 'D'")
            elif tile(*pos) in SOLID:
                errors.append(f"{where}: npc {n['id']} stands on solid tile {tile(*pos)!r} at {pos}")
            if n.get("vendor"):
                cart = (n["x"] + 1, n["y"])
                occupied.add(cart)
                if tile(*cart) in SOLID:
                    errors.append(f"{where}: cart of {n['id']} on solid tile at {cart}")
        px, py = ch["player"]
        if tile(px, py) in SOLID or (px, py) in occupied:
            errors.append(f"{where}: player start {ch['player']} is not free")

        # every npc must be reachable from the player start
        free = {(x, y) for y in range(11) for x in range(20) if tile(x, y) not in SOLID and (x, y) not in occupied}
        seen, stack = {(px, py)}, [(px, py)]
        while stack:
            x, y = stack.pop()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = (x + dx, y + dy)
                if q in free and q not in seen:
                    seen.add(q)
                    stack.append(q)
        for n in ch["npcs"]:
            spots = [(n["x"], n["y"])] + ([(n["x"] + 1, n["y"])] if n.get("vendor") else [])
            if not any((sx + dx, sy + dy) in seen for sx, sy in spots for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                errors.append(f"{where}: npc {n['id']} cannot be reached from the player start")

        npc_ids = {n["id"] for n in ch["npcs"]}
        if ch.get("opening") and ch["opening"]["who"] not in chars:
            errors.append(f"{where}: opening speaker {ch['opening']['who']} not in chars")
        for d in ch["decisions"]:
            w = d["id"]
            if w in ids:
                errors.append(f"{w}: duplicate decision id")
            ids.add(w)
            if not re.fullmatch(r"c\dd\d", w):
                errors.append(f"{w}: id must look like c1d2 (used for the option shuffle seed)")
            if d["npc"] not in npc_ids:
                errors.append(f"{w}: npc {d['npc']} is not in chapter {where}")
            for key in ("concept", "ref", "prompt", "hint", "lines", "learn"):
                if not d.get(key):
                    errors.append(f"{w}: missing {key}")
            qs = [o["q"] for o in d["options"]]
            if qs.count("good") != 1:
                errors.append(f"{w}: needs exactly one 'good' option (has {qs.count('good')})")
            if len(d["options"]) != 3:
                errors.append(f"{w}: needs 3 options")
            for o in d["options"]:
                if o["q"] not in ("good", "partial", "bad"):
                    errors.append(f"{w}: option quality {o['q']!r}")
                if set(o["fx"]) - set(INDICATORS):
                    errors.append(f"{w}: unknown indicator in {o['fx']}")
                if not o.get("reply"):
                    errors.append(f"{w}: option without reply")
    return errors


# --------------------------------------------------------------- landing site
LANDING_CSS = """:root { --bg: #17131f; --panel: #fff8e7; --ink: #2b2335; --muted: #6b5f73; --line: #2b2335;
  --yellow: #fcd116; --blue: #003893; --red: #ce1126; --green: #39a900;
  --mono: ui-monospace, "Cascadia Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, sans-serif; }
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.5 var(--sans); }
.flag { height: 12px; background: linear-gradient(var(--yellow) 0 50%, var(--blue) 50% 75%, var(--red) 75%); }
main { max-width: 860px; margin: 0 auto; padding: 24px 16px 40px; }
.card { background: var(--panel); border: 4px solid var(--line); box-shadow: 6px 6px 0 #0f0c15; padding: 20px; margin-bottom: 20px; }
.kicker { font: bold 13px var(--mono); text-transform: uppercase; letter-spacing: .08em; color: var(--green); margin: 0 0 6px; }
h1 { font: bold clamp(28px, 6vw, 44px)/1.1 var(--mono); color: var(--red); text-shadow: 3px 3px 0 var(--yellow); margin: 0 0 12px; }
h2 { font: bold 20px var(--mono); color: var(--blue); margin: 0 0 10px; }
.lead { font-size: 19px; font-weight: 600; }
.hero img { display: block; width: 100%; height: auto; border: 3px solid var(--line); image-rendering: pixelated; margin: 14px 0; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0 4px; }
.btn { display: inline-flex; align-items: center; gap: 6px; font: bold 16px var(--mono); color: var(--ink); background: #fff;
  border: 3px solid var(--line); padding: 10px 16px; text-decoration: none; box-shadow: 3px 3px 0 var(--line); }
.btn:hover, .btn:focus-visible { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 var(--line); background: #fff3c4; outline: none; }
.btn.primary { background: var(--yellow); font-size: 18px; }
ul, ol { padding-left: 22px; margin: 0; }
li { margin: 6px 0; }
.steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.steps div { background: #fff; border: 3px solid var(--line); padding: 12px; }
.steps b { display: block; font-family: var(--mono); color: var(--blue); }
footer { color: #cfc6dc; font-size: 14px; text-align: center; padding: 0 16px 32px; }
footer a { color: var(--yellow); }
.small { font-size: 14px; color: var(--muted); }
"""


def write_landing(story, generic_zip):
    """Static site for campus.opensai.org/reto-scrum/ (no PHP, no database)."""
    import shutil
    from urllib.parse import urlparse
    L = story["landing"]
    base = L["base"]
    root_path = urlparse(base).path              # "/reto-scrum/"
    out = os.path.join(DIST, root_path.strip("/"))
    missing = [p["image"] for p in L["pages"].values() if not os.path.exists(os.path.join(OG, p["image"]))]
    if missing:
        fail([f"assets/og/{m} is missing: run scripts/og_server.py and open tests/og_render.html" for m in missing])
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(os.path.join(out, "img"))
    os.makedirs(os.path.join(out, "descargas"))
    for p in L["pages"].values():
        shutil.copyfile(os.path.join(OG, p["image"]), os.path.join(out, "img", p["image"]))
    with open(os.path.join(out, "estilo.css"), "w", encoding="utf-8") as f:
        f.write(LANDING_CSS)
    # jugar/: the open edition, playable by anyone (SCORM calls fall back to localStorage)
    shutil.copytree(PKG, os.path.join(out, "jugar"), ignore=shutil.ignore_patterns("imsmanifest.xml", ".*"))
    os.replace(os.path.join(out, "jugar", SHELL), os.path.join(out, "jugar", "index.html"))
    shutil.copyfile(generic_zip, os.path.join(out, L["download"]))

    # ?v=<hash> on images: Cloudflare caches PNGs at the edge and LinkedIn/Facebook cache previews,
    # so a changed card must get a new URL to be fetched again
    import hashlib
    ver = {p["image"]: hashlib.sha1(open(os.path.join(OG, p["image"]), "rb").read()).hexdigest()[:10]
           for p in L["pages"].values()}
    css_ver = hashlib.sha1(LANDING_CSS.encode()).hexdigest()[:10]
    learn = "".join(f"<li>{escape(x)}</li>" for x in L["learn"])
    for key, page in L["pages"].items():
        url = base + page["path"]
        image = base + "img/" + page["image"] + "?v=" + ver[page["image"]]
        dare = "" if key == "reto" else '<p class="kicker">Alguien te retó 👀</p>'
        html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{escape(page['title'])}</title>
<meta name="description" content="{escape(page['description'])}">
<link rel="canonical" href="{escape(url)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_CO">
<meta property="og:site_name" content="OpenSAI · Reto Scrum">
<meta property="og:url" content="{escape(url)}">
<meta property="og:title" content="{escape(page['title'])}">
<meta property="og:description" content="{escape(page['description'])}">
<meta property="og:image" content="{escape(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{escape(story['title'])}: tarjeta en pixel art">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{escape(page['title'])}">
<meta name="twitter:description" content="{escape(page['description'])}">
<meta name="twitter:image" content="{escape(image)}">
<link rel="stylesheet" href="{root_path}estilo.css?v={css_ver}">
</head>
<body>
<div class="flag"></div>
<main>
  <section class="card hero">
    {dare}<p class="kicker">{escape(story['kicker'])} · #{escape(story['hashtag'])}</p>
    <h1>{escape(page['headline'])}</h1>
    <p class="lead">{escape(page['description'])}</p>
    <img src="{root_path}img/{escape(page['image'])}?v={ver[page['image']]}" width="1200" height="630" alt="{escape(story['title'])}: tarjeta en pixel art">
    <div class="actions">
      <a class="btn primary" href="{root_path}{L['play']}">▶ Jugar ahora · gratis, sin registro</a>
      <a class="btn" href="{root_path}{L['download']}" download>🎓 Paquete SCORM para docentes</a>
    </div>
    <p class="small">≈ 20 minutos · funciona en el celular y en el computador · sin instalar nada</p>
  </section>
  <section class="card">
    <h2>La historia</h2>
    <p>{escape(" ".join(story['intro']))} La distribuidora quiere 6.000 pares de zapatos de salsa… si el taller logra, con Scrum, un sistema para seguir cada lote en seis semanas.</p>
    <div class="steps">
      <div><b>1 · Camina</b>Recorre el taller, la Avenida Primero de Mayo y hasta la cima de Monserrate.</div>
      <div><b>2 · Decide con Scrum</b>17 decisiones: cuida la caja, la confianza del cliente y el ánimo del equipo.</div>
      <div><b>3 · Aprende y reta</b>Recibe qué hiciste bien y qué estudiar, y reta a tus amigos.</div>
    </div>
  </section>
  <section class="card">
    <h2>Lo que vas a practicar</h2>
    <ul>{learn}</ul>
    <p class="small">{escape(story['refsNote'])} <a href="https://scrumguides.org/">scrumguides.org</a></p>
  </section>
</main>
<footer>
  <p>{escape(story['title'])} · Open Source Academic Initiative (OpenSAI) · #{escape(story['campaign'])}</p>
  <p>Código <a href="{root_path}jugar/LICENSE.txt">MIT</a> · Contenido <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.es">CC BY-SA 4.0</a> · Basado en la Guía Scrum 2020</p>
</footer>
</body>
</html>
"""
        d = os.path.join(out, page["path"])
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
            f.write(html)
    n = sum(len(fs) for _, _, fs in os.walk(out))
    print(f"\n🌐 Landing site: {os.path.relpath(out, ROOT)}/ ({n} files) -> {base}")
    # a single archive of the site, handy for uploading it to a web server
    tarball = shutil.make_archive(out, "gztar", DIST, os.path.basename(out))
    print(f"   + {os.path.relpath(tarball, ROOT)}")


# --------------------------------------------------------------- profiles
def load_profiles():
    out = {}
    if os.path.isdir(PROFILES):
        for name in sorted(os.listdir(PROFILES)):
            if name.endswith(".json"):
                with open(os.path.join(PROFILES, name), encoding="utf-8") as f:
                    prof = json.load(f)
                out[prof["id"]] = prof
    return out


def validate_profile(story, prof):
    errors = []
    ids = {d["id"] for ch in story["chapters"] for d in ch["decisions"]}
    for key in ("id", "zipSuffix", "kicker", "label", "evidence", "refs"):
        if key not in prof:
            errors.append(f"profile {prof.get('id')}: missing {key}")
    for g in story["groups"]:
        if g not in prof.get("evidence", {}):
            errors.append(f"profile {prof.get('id')}: no evidence for group {g}")
    for i in sorted(set(prof.get("refs", {})) ^ ids):
        errors.append(f"profile {prof.get('id')}: refs and decisions differ on {i}")
    return errors


def apply_profile(story, prof):
    """Course-neutral story + a course layer (kicker, evidence, extra references)."""
    s = json.loads(json.dumps(story))
    s["course"] = {"id": prof["id"], "kicker": prof["kicker"], "label": prof["label"], "evidence": prof["evidence"]}
    for ch in s["chapters"]:
        for d in ch["decisions"]:
            d["courseRef"] = prof["refs"][d["id"]]
    return s


# --------------------------------------------------------------- balance
def play(story, pick):
    """Mirror of js/game.js: apply effects, chapter drain, fail/win rules."""
    st = dict(story["start"])
    goods = 0
    chapters = story["chapters"]
    for ci, ch in enumerate(chapters):
        for d in ch["decisions"]:
            o = pick(d)
            goods += o["q"] == "good"
            for k, v in o["fx"].items():
                st[k] = max(0, min(100, st[k] + v))
            if st["caja"] <= 0 or st["equipo"] <= 0:
                return False, goods, st
        if ci < len(chapters) - 1:
            st["caja"] = max(0, st["caja"] - story["drain"])
            if st["caja"] <= 0:
                return False, goods, st
    win = st["cliente"] >= story["win"]["cliente"] and st["equipo"] >= story["win"]["equipo"] and st["caja"] > 0
    return win, goods, st


def simulate(story):
    best = play(story, lambda d: next(o for o in d["options"] if o["q"] == "good"))
    worst = play(story, lambda d: min(d["options"], key=lambda o: sum(o["fx"].values())))
    print(f"  all good: win={best[0]} final={best[2]}")
    print(f"  worst:    win={worst[0]} final={worst[2]}")
    rng = random.Random(1)
    print("  P(good) -> win rate (10,000 runs each)")
    for p in (0.33, 0.5, 0.6, 0.7, 0.8, 0.9):
        wins = 0
        for _ in range(10000):
            def pick(d):
                if rng.random() < p:
                    return next(o for o in d["options"] if o["q"] == "good")
                return rng.choice([o for o in d["options"] if o["q"] != "good"])
            wins += play(story, pick)[0]
        print(f"    {p:.2f} -> {wins / 100:.1f} %")
    # minimum number of good decisions that can still win
    decisions = [d for ch in story["chapters"] for d in ch["decisions"]]
    total = len(decisions)
    for k in range(total + 1):
        found = False
        for combo in itertools.combinations(range(total), k):
            chosen = set(combo)
            order = iter(range(total))

            def pick(d):
                i = next(order)
                if i in chosen:
                    return next(o for o in d["options"] if o["q"] == "good")
                return max((o for o in d["options"] if o["q"] != "good"), key=lambda o: sum(o["fx"].values()))
            if play(story, pick)[0]:
                found = True
                break
        if found:
            print(f"  fewest good decisions that can still win (others least harmful): {k} of {total}")
            break


# --------------------------------------------------------------- outputs
def write_story_data(story):
    path = os.path.join(PKG, "js", "story-data.js")
    data = json.dumps(story, ensure_ascii=False, separators=(",", ":"))
    with open(path, "w", encoding="utf-8") as f:
        f.write("/* GENERATED by scripts/build.py from content/story.json — do not edit. */\n")
        f.write(f"window.STORY = {data};\n")
    print(f"  wrote js/story-data.js ({len(data) // 1024} KB)")


def copy_licenses():
    """Ship the licenses inside the package, so the zip carries its own terms."""
    import shutil
    shutil.copyfile(os.path.join(ROOT, "LICENSE"), os.path.join(PKG, "LICENSE.txt"))
    shutil.copyfile(os.path.join(ROOT, "LICENSE-CONTENT.md"), os.path.join(PKG, "LICENSE-CONTENT.md"))


def package_files():
    out = []
    for base, dirs, files in os.walk(PKG):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))
        for name in sorted(files):
            rel = os.path.relpath(os.path.join(base, name), PKG).replace(os.sep, "/")
            if rel == "imsmanifest.xml" or EXCLUDE.search(rel):
                continue
            out.append(rel)
    return out


def write_manifest(story):
    # No adlcp:masteryscore: the game reports completion only ("completed" at
    # any ending). In Moodle use grading method "Learning objects".
    files = package_files()
    title = escape(story["title"])
    file_tags = "\n".join(f'      <file href="{escape(f)}"/>' for f in files)
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<!-- GENERATED by scripts/build.py — do not edit. SCORM 1.2 (best supported by Moodle). -->
<manifest identifier="ScrumMasterRestrepo" version="{escape(story['version'])}"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="org_scrum_restrepo">
    <organization identifier="org_scrum_restrepo">
      <title>{title}</title>
      <item identifier="item_juego" identifierref="res_juego" isvisible="true">
        <title>{title}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res_juego" type="webcontent" adlcp:scormtype="sco" href="{SHELL}">
{file_tags}
    </resource>
  </resources>
</manifest>
"""
    with open(os.path.join(PKG, "imsmanifest.xml"), "w", encoding="utf-8") as f:
        f.write(xml)
    print(f"  wrote imsmanifest.xml ({len(files)} files)")
    return files


def zip_path(suffix=""):
    return os.path.join(DIST, f"{ZIP_BASE}{'_' + suffix if suffix else ''}_SCORM.zip")


def write_zip(files, suffix=""):
    os.makedirs(DIST, exist_ok=True)
    out = zip_path(suffix)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(os.path.join(PKG, "imsmanifest.xml"), "imsmanifest.xml")
        for rel in files:
            z.write(os.path.join(PKG, rel), rel)
    size = os.path.getsize(out) / 1024
    print(f"\n✅ SCORM package: {os.path.relpath(out, ROOT)} ({size:.0f} KB, {len(files) + 1} files)")


def bust_cache():
    """Append ?v=<content hash> to the CSS/JS links of the game shell, so a
    browser that cached an older package never mixes old and new files."""
    shell = os.path.join(PKG, SHELL)
    html = open(shell, encoding="utf-8").read()

    def repl(m):
        path = m.group(2)
        with open(os.path.join(PKG, path), "rb") as f:
            digest = hashlib.sha1(f.read()).hexdigest()[:10]
        return f'{m.group(1)}{path}?v={digest}"'

    new = re.sub(r'((?:href|src)=")((?:css|js)/[\w./-]+\.(?:css|js))(?:\?v=\w+)?"', repl, html)
    if new != html:
        with open(shell, "w", encoding="utf-8") as f:
            f.write(new)
        print(f"  updated asset versions in {SHELL}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="validate only")
    ap.add_argument("--sim", action="store_true", help="validate and simulate game balance")
    ap.add_argument("--no-zip", action="store_true", help="skip the zips")
    ap.add_argument("--profile", help="course profile to leave in the package folder (default: generic)")
    args = ap.parse_args()

    with open(CONTENT, encoding="utf-8") as f:
        story = json.load(f)
    profiles = load_profiles()
    print("Validating story…")
    errors = validate(story)
    for prof in profiles.values():
        errors += validate_profile(story, prof)
    if args.profile and args.profile not in profiles:
        errors.append(f"unknown profile {args.profile!r} (have: {', '.join(profiles) or 'none'})")
    if errors:
        fail(errors)
    total = sum(len(c["decisions"]) for c in story["chapters"])
    print(f"  ok: {len(story['chapters'])} chapters, {total} decisions, {len(story['scenes'])} scenes, "
          f"profiles: {', '.join(profiles) or 'none'}")
    if args.sim:
        simulate(story)
    if args.check or args.sim:
        return

    def package(data, suffix=""):
        write_story_data(data)
        copy_licenses()
        bust_cache()
        files = write_manifest(data)
        if not args.no_zip:
            write_zip(files, suffix)

    # zip every course profile first, then leave the requested edition
    # (generic by default) in the package folder for previews
    if not args.no_zip:
        for prof in profiles.values():
            print(f"\nProfile {prof['id']}:")
            package(apply_profile(story, prof), prof["zipSuffix"])
        print("\nGeneric (open) edition:")
    prof = profiles.get(args.profile)
    package(apply_profile(story, prof) if prof else story, prof["zipSuffix"] if prof else "")
    if not args.no_zip and not prof:
        write_landing(story, zip_path())


if __name__ == "__main__":
    main()
