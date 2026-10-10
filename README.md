# El Scrum más Master del Restrepo · Reto Scrum

A short (~20 min) pixel-art **serious game** for anyone who wants to learn Scrum by solving
situations, not by reciting definitions. It will be released under an open license.
Feedback points to the **Scrum Guide 2020** (scrumguides.org, CC BY-SA 4.0), so the game
does not depend on any particular course.

It is packaged as **SCORM 1.2**, the same way as `../EDU_Life_and_Work_LibreOffice_Calc`.
An optional **course profile** layers a course's own references on top. The first profile
supports the SENA program *Aplicación del marco de trabajo Scrum para proyectos de desarrollo
de software* (22810043). See [Course profiles](#course-profiles).

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
- "lo que hiciste bien" and "para estudiar", each with a reference to the CF1/CF2 section;
- a share box (copy text, 1200×630 PNG card, LinkedIn/Facebook/WhatsApp/X);
- extra congratulations when the player wins after several attempts.

Learner-facing text is Spanish (Colombia). Code and docs are in English.

## Chapters

| Chapter | Scene (pixel art) | Scrum topics | 
|---|---|---|---|
| 1 · El papayazo | Workshop interior | User stories, story quality, backlog ordering, epics |
| 2 · Armando el parche | Av. Primero de Mayo, TransMilenio station | Product Owner, Scrum Master, dev team, life cycle |
| 3 · Sprint 1 | Team office (Scrum board, burndown) | Sprint planning/velocity, daily, mid-sprint change, burndown, Definition of Done |
| 4 · El cuello de botella | Production floor (Kanban board) | WIP limits, Scrum vs Kanban |
| 5 · La demo en Monserrate | Monserrate summit | Sprint Review, Retrospective |

Bogotá elements:
- Monserrate and Guadalupe on the eastern hills, plus the cable car;
- red articulated TransMilenio buses (they brake for pedestrians on the zebra crossing);
- Don Abelardo, the *vendedor ambulante de mazamorra*, who sells a hint for 1 point of cash;
- frailejones, a tricolour bunting, and *sumercé* / *parce* / *camellar* in the dialogue.

Each attempt shuffles the answer order, so players can't win by remembering positions.

## Structure

```
content/story.json            single source of truth (course-neutral): chapters, scenes, characters, decisions
content/profiles/sena.json    optional SENA layer: kicker, evidence per chapter group, CF1/CF2 reference per decision
juego_scrum_restrepo/         SCORM package root
  juego.html                  launch page (SCO)
  css/game.css
  js/scorm.js                 SCORM 1.2 wrapper (from the Calc course) + localStorage fallback
  js/story-data.js            GENERATED from story.json — do not edit
  js/pixel.js                 all pixel art drawn in code (tiles, sprites, bus, cart, 3x5 font)
  js/cards.js                 1200x630 share cards (results screen and landing previews)
  js/game.js                  game loop, dialogues, decisions, results, share card, SCORM reporting
  imsmanifest.xml             GENERATED
scripts/build.py              validate + simulate + generate + zip
tests/lms_harness.html        mock SCORM 1.2 LMS (not shipped)
tests/og_render.html          renders assets/og/*.png with scripts/og_server.py
assets/og/                    Open Graph images for the landing pages (committed)
assets/brand/                 OpenSAI logo (not used in the package yet)
doc/                          SENA course material (guide, templates, CF1/CF2 modules, videos)
```

There are no images, fonts or CDN files: the whole package is about 40 KB and works offline.

## Build

```bash
python3 scripts/build.py            # -> dist/Juego_Scrum_Master_Restrepo_SCORM.zip       (generic, open edition)
                                    #    dist/Juego_Scrum_Master_Restrepo_SENA_SCORM.zip  (SENA profile)
python3 scripts/build.py --no-zip   # refresh the package folder only (generic)
python3 scripts/build.py --no-zip --profile sena   # preview the SENA edition
python3 scripts/build.py --check    # validate story.json only
python3 scripts/build.py --sim      # validate + game-balance simulation
```

The validator checks the following:
- map sizes and tiles;
- that every NPC stands on a free tile and can be reached from the player start;
- that each decision has exactly one `good` option, three options, a reply, a hint and a reference.

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
  - Instructors can see in the activity *Reports* which concepts trainees miss.
- `cmi.suspend_data`: about 600 characters. It holds the attempt count, wins, the last 6 results
  and the current run, so a run can be resumed.
- `cmi.core.lesson_location`: the pending decision id, or `fin`.
- `cmi.core.exit`: always `suspend`, so attempts and history survive between sessions.

## Deploy to Moodle (campus.opensai.org)

Moodle SCORM activity settings:
- Display: *Current window*, width 100 %, height 800.
- Course structure on entry page: *No*. Show Navigation: *No*.
- **Grading method: Learning objects** (one SCO completed = 100 %), maximum grade 100.
- Attempts: unlimited. Force new attempt: *No*.
- Completion: **Require status → Completed**.

Since 2026-10-02 the workflow is **stage → production**, per
`../OpenSAIOrgPlatformDeploy/campus.opensai.org/README.md`:

Helpers in `moodle/` (run inside Moodle's PHP as the web user):
- `create_course.php <zip> <image>`: creates [SCRUMRESTREPO] with the settings above;
- `backup_course.php <shortname> <dest.mbz>`: backup **without users**, refuses otherwise;
- `post_restore.php <shortname>`: re-applies enrolment methods after a no-users restore;
- `verify_course.php <shortname>`: read-only checks.

The course has been on campust since 2026-10-09 (course 9, cmid 52). Production:
`../OpenSAIOrgPlatformDeploy/campus.opensai.org/restore-scrum-course-production-V1.sh`.

1. **Build the course on campust** (stage: nabusimaque, Podman, behind CF Access, email off).
   - Create the course and the SCORM activity there. Upload server-side through Moodle's CLI or API, not through
     the browser and tunnel, as in the Calc project (`add_moduleinfo()`; set `$moduleinfo->module` yourself, see
     `../OpenSAICampus/README.md`).
   - Use the SENA zip for the SENA course, or the generic zip for an open course.
2. **Promote it to campus** (production, Linode, public): take a course backup **without users** on campust,
   then run `admin/cli/restore_backup.php` on campus.
3. **Later package updates:** replace the package inside the same activity with
   `../OpenSAIOrgPlatformDeploy/campus.opensai.org/update-scorm-package.php <cmid> <zip>`.
   - It checks that the SCO identifiers are unchanged and keeps learners' attempts.
   - Keep `ScrumMasterRestrepo` / `res_juego` stable.
   - Then purge caches, reload php-fpm, and run `check-cms-integrity.sh --rebase-moodle` only if code changed.

## Course profiles

`content/story.json` never names a course. A profile in `content/profiles/<id>.json` adds:
- `kicker`: the title-screen line, e.g. "Reto Scrum · apoyo al programa SENA 22810043";
- `evidence`: one label per chapter group (`backlog`, `roles`, `sprint`, `flujo`), shown on chapter cards;
- `refs`: one reference per decision id, shown after the Scrum Guide reference in "Para estudiar".

The build validates each profile (all groups and all 17 decisions must be covered) and writes
one extra zip per profile. To support another course or institution, copy `sena.json`, give it a
new `id` and `zipSuffix`, and rewrite the labels.

## Landing site: campus.opensai.org/reto-scrum

The full build also writes `dist/reto-scrum/` and `dist/reto-scrum.tar.gz`: a static site
with no PHP and no database.

| URL | What it is |
|---|---|
| `/reto-scrum/` | the challenge page |
| `/reto-scrum/salve-el-taller/` | shared by players who win; preview card "¡Buen trabajo!…" |
| `/reto-scrum/se-quebro/` | shared by players who lose; preview card "¡Se quebró el taller!…" |
| `/reto-scrum/jugar/` | the open edition, playable by anyone, no login (SCORM falls back to localStorage) |
| `/reto-scrum/descargas/…_SCORM.zip` | the open SCORM package, for teachers and other LMSs |

Texts live in `story.json` → `landing`. The game shares the page that matches the ending, so
LinkedIn and Facebook show the right preview card. Each page has its own `og:image`.

**Preview images** are rendered with the game's own `js/cards.js` and committed in `assets/og/`.
Re-render them only when the card art or the landing texts change:

```bash
python3 scripts/og_server.py     # then open http://127.0.0.1:8767/tests/og_render.html
```

**Deploy to production** (campus.opensai.org runs on the Linode since 2026-10-02 and is public):
- `../OpenSAIOrgPlatformDeploy/campus.opensai.org/deploy-reto-scrum-production-V1.sh`; its header has the exact
  `scp`/`ssh` commands.
- You run it with `sudo` on the Linode. It needs the sudo password, so a person runs it from their own terminal.
- It publishes the static files outside the Moodle code dir, adds an `Alias` inside the campus vhost only, and
  verifies every URL against the origin.
- It is logged in that folder's README (2026-10-09 entry). No Cloudflare change is needed.

After deploying, re-scrape the three URLs with the
[LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) and the
[Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/).

## License

- **Code** (HTML, CSS, JavaScript, Python): [MIT](LICENSE).
- **Content** (story, dialogue, feedback, course profiles, characters, scene designs, share cards):
  [CC BY-SA 4.0](LICENSE-CONTENT.md).
- **Reference framework:** the game follows *The Scrum Guide 2020* (Schwaber & Sutherland,
  scrumguides.org, CC BY-SA 4.0). It paraphrases the guide and does not reproduce it.
- **`doc/` is local only and ignored by git.** It holds the SENA guide, templates, CF1/CF2 exports
  and videos, under SENA's own terms. Nothing from it is copied into the game.

Maintained by the Open Source Academic Initiative (OpenSAI) · #EDU_Life_and_Work
