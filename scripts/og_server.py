"""Render the landing pages' Open Graph images (1200x630 PNG) with the game's own card code.

    python3 scripts/og_server.py
    # open http://127.0.0.1:8767/tests/og_render.html in a browser: it draws the three cards with
    # js/cards.js and POSTs them here, which saves them to assets/og/. Ctrl+C when it says done.

Run it again only when the card art or the landing texts change. assets/og/ is committed, and
scripts/build.py copies it into the landing page. Serves on localhost only.
"""

import http.server
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "og")
NAME = re.compile(r"^/save/(og-[a-z0-9-]+\.png)$")
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_POST(self):
        m = NAME.match(self.path)
        size = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(size) if 0 < size < 5_000_000 else b""
        if not m or not body.startswith(PNG_MAGIC):
            self.send_error(400, "expected POST /save/og-<name>.png with a PNG body")
            return
        os.makedirs(OUT, exist_ok=True)
        with open(os.path.join(OUT, m.group(1)), "wb") as f:
            f.write(body)
        print(f"  saved assets/og/{m.group(1)} ({len(body) // 1024} KB)")
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    print("Open http://127.0.0.1:8767/tests/og_render.html  (Ctrl+C to stop)")
    http.server.ThreadingHTTPServer(("127.0.0.1", 8767), Handler).serve_forever()
