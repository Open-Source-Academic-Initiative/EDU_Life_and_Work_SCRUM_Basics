# El Scrum más Master del Restrepo · Reto Scrum

A short (~20 min) pixel-art **serious game** for anyone who wants to learn Scrum by solving
situations, not by reciting definitions. It follows **The Scrum Guide 2020** (Schwaber & Sutherland,
[scrumguides.org](https://scrumguides.org), CC BY-SA 4.0), and every piece of feedback points to it.
It is open: MIT for the code, CC BY-SA 4.0 for the content.

- **Play it in the browser:** <https://campus.opensai.org/reto-scrum/jugar/> (no login, works on phones).
- **Use it in your LMS:** it ships as a **SCORM 1.2** package (about 40 KB, offline, no CDN).

The player is a software-development student in Bogotá's **barrio Restrepo**. Doña Marleny's family shoe
workshop is three months behind with the bank, and a Madrid distributor offers to buy 6,000 pairs
of salsa shoes for Europe. The catch is that the distributor needs a web system for lot traceability.
The player walks around, talks to people and makes 17 Scrum decisions. The game tracks three
indicators (💰 Caja, 🤝 Cliente, 💪 Equipo). If cash or team morale reaches zero, the workshop goes
bankrupt. If the client is not convinced at the final demo on **Monserrate**, the contract is lost.

The ending is never a bare score. The game gives:
- a viral line:
  - *"¡Buen trabajo! En Europa ahora bailan salsa con zapatos del Restrepo."*
  - *"No aprovechaste el papayazo del negocio de exportación y se quebró el taller."*
- a profile (e.g. *Crack del Sprint*);
- "lo que hiciste bien" and "para estudiar", each pointing to the Scrum Guide 2020 section to review;
- a share box (copy text, 1200×630 PNG card, LinkedIn/Facebook/WhatsApp/X);
- extra congratulations when the player wins after several attempts.

Learner-facing text is Spanish (Colombia). Code and docs are in English.

## Chapters

| Chapter | Scene (pixel art) | Scrum topics |
|---|---|---|
| 1 · El papayazo | Workshop interior | User stories, story quality, Product Backlog ordering, epics |
| 2 · Armando el parche | Av. Primero de Mayo, TransMilenio station | Product Owner, Scrum Master, Developers, Sprints and Increments |
| 3 · Sprint 1 | Team office (Scrum board, burndown) | Sprint Planning and Sprint Goal, Daily Scrum, changes during the Sprint, burndown, Definition of Done |
| 4 · El cuello de botella | Production floor (Kanban board) | WIP limits, Scrum vs Kanban |
| 5 · La demo en Monserrate | Monserrate summit | Sprint Review, Sprint Retrospective |

User stories, burndown charts and Kanban are not part of the Scrum Guide. The feedback presents them
as complementary practices.

Bogotá elements:
- Monserrate and Guadalupe on the eastern hills, plus the cable car;
- red articulated TransMilenio buses (they brake for pedestrians on the zebra crossing);
- Don Abelardo, the *vendedor ambulante de mazamorra*, who sells a hint for 1 point of cash;
- frailejones, a tricolour bunting, and *sumercé* / *parce* / *camellar* in the dialogue.

Each attempt shuffles the answer order, so players can't win by remembering positions.

## Structure

```
content/story.json            single source of truth: chapters, scenes, characters, decisions, landing texts
content/profiles/             optional local course profiles (format in its README; *.json not tracked)
juego_scrum_restrepo/         SCORM package root
  juego.html                  launch page (SCO)
  css/game.css
  js/scorm.js                 SCORM 1.2 wrapper with a localStorage fallback
  js/story-data.js            GENERATED from story.json — do not edit
  js/pixel.js                 all pixel art drawn in code (tiles, sprites, bus, cart, 3x5 font)
  js/cards.js                 1200x630 share cards (results screen and landing previews)
  js/game.js                  game loop, dialogues, decisions, results, sharing, SCORM reporting
  imsmanifest.xml             GENERATED
scripts/build.py              validate + simulate + generate + zip + landing site
scripts/og_server.py          saves the landing preview images rendered by tests/og_render.html
tests/lms_harness.html        mock SCORM 1.2 LMS (not shipped)
assets/og/                    Open Graph images for the landing pages
assets/brand/                 OpenSAI logo
moodle/                       Moodle CLI helpers (create, back up without users, restore fix-up, verify)
```

`dist/` (build output) and `doc/` (local reference material) are not tracked.

## Build

Python 3 only, no extra packages.

```bash
python3 scripts/build.py            # -> dist/Juego_Scrum_Master_Restrepo_SCORM.zip + dist/reto-scrum/ (landing site)
python3 scripts/build.py --no-zip   # refresh the package folder only
python3 scripts/build.py --check    # validate story.json only
python3 scripts/build.py --sim      # validate + game-balance simulation
```

The validator checks the following:
- map sizes and tiles;
- that every NPC stands on a free tile and can be reached from the player start;
- that each decision has exactly one `good` option, three options, a reply, a hint and a reference;
- the landing texts, and every course profile it finds.

**Balance** (`--sim`, 10,000 random runs). Correct answer rate → win rate:

| Correct answers | 50 % | 60 % | 70 % | 80 % | 90 % |
|---|---|---|---|---|---|
| Win rate | 12 % | 35 % | 66 % | 91 % | 99 % |

At least 9 of the 17 decisions must be correct to win. Tune `start`, `win`, `drain` and the
`fx` of each option in `story.json`, then run `--sim` again.

## Test locally

```bash
python3 -m http.server 8765        # from the repository root
# open http://127.0.0.1:8765/tests/lms_harness.html   (?db=name for an isolated record)
```

The harness shows status, location and interactions, and offers "Reload course" (to test resume)
and "Wipe". The game exposes `window.Juego.state()` for inspection.

## SCORM reporting (completion only)

- `cmi.core.lesson_status`: `incomplete` on the first launch, then `completed` when the player
  reaches **any** ending (win or bankruptcy). There is no score and no `masteryscore`.
- `cmi.interactions.n.*`: one per decision.
  - `id` is `c1d1` … `c5d2`.
  - `student_response` is a/b/c, the option's position in `story.json` (not the shuffled screen order).
  - `result` is `correct`, `neutral` (partial) or `wrong`.
  - Teachers can see in their LMS reports which concepts learners miss.
- `cmi.suspend_data`: about 600 characters. It holds the attempt count, wins, the last 6 results
  and the current run, so a run can be resumed.
- `cmi.core.lesson_location`: the pending decision id, or `fin`.
- `cmi.core.exit`: always `suspend`, so attempts and history survive between sessions.

## Using it in Moodle

Recommended SCORM activity settings (in a single-activity course, or as one activity among others):
- Display: *Current window*. Course structure on entry page: *No*. Table of contents: *Disabled*.
- **Grading method: Learning objects** (one SCO completed = full grade).
- Attempts: unlimited. Force new attempt: *No* (keeps the saved progress and history).
- Completion: automatic, **Require status → Completed**. Do not set a mastery score.

The helpers in `moodle/` do this from Moodle's CLI (run them as the web server user):
- `create_course.php <zip> <image>`: creates the course [SCRUMRESTREPO] with the settings above,
  self-enrolment on, guest access off;
- `backup_course.php <shortname> <dest.mbz>`: a course backup **without user data** (it refuses otherwise),
  to move the course from a staging site to production;
- `post_restore.php <shortname>`: re-applies the enrolment methods after restoring such a backup;
- `verify_course.php <shortname>`: read-only checks of the result.

To update the package later without losing learners' attempts, replace the file inside the same
activity and keep the manifest identifiers (`ScrumMasterRestrepo`, `res_juego`) unchanged.

## Course profiles

A teacher or institution can add its own references (a title-screen line, labels per chapter, an extra
reference per decision) without touching the story. See [content/profiles/README.md](content/profiles/README.md).
Profiles stay local and produce an extra SCORM zip each.

## Landing site

The full build also writes `dist/reto-scrum/` (and `dist/reto-scrum.tar.gz`): a static site with no PHP
and no database, published by OpenSAI at <https://campus.opensai.org/reto-scrum/>.

| Path | What it is |
|---|---|
| `/reto-scrum/` | the challenge page |
| `/reto-scrum/salve-el-taller/` | shared by players who win; preview card "¡Buen trabajo!…" |
| `/reto-scrum/se-quebro/` | shared by players who lose; preview card "¡Se quebró el taller!…" |
| `/reto-scrum/jugar/` | the game, playable by anyone, no login (SCORM falls back to localStorage) |
| `/reto-scrum/descargas/…_SCORM.zip` | the SCORM package, for teachers and other LMSs |

Texts live in `story.json` → `landing`, including the public base URL. The game shares the page that
matches the ending, so LinkedIn and Facebook show the right preview card. Image and CSS URLs carry a
content hash (`?v=…`), so caches and social networks fetch new versions after a change.

**Preview images** are rendered with the game's own `js/cards.js` and committed in `assets/og/`.
Re-render them only when the card art or the landing texts change:

```bash
python3 scripts/og_server.py     # then open http://127.0.0.1:8767/tests/og_render.html
```

OpenSAI's own deployment of the landing site and the course is documented in its operations repository.

## License

- **Code** (HTML, CSS, JavaScript, PHP, Python): [MIT](LICENSE).
- **Content** (story, dialogue, feedback, characters, scene designs, share cards):
  [CC BY-SA 4.0](LICENSE-CONTENT.md).
- **Reference framework:** *The Scrum Guide 2020* (Schwaber & Sutherland, scrumguides.org, CC BY-SA 4.0).
  The game paraphrases its concepts and does not reproduce its text.

Maintained by the Open Source Academic Initiative (OpenSAI) · #EDU_Life_and_Work
