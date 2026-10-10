# Course profiles (optional)

The game is course-neutral: `content/story.json` follows **The Scrum Guide 2020** and never names a
course or institution. A **course profile** is an optional, local layer for a teacher or institution
that uses the game inside their own course. It adds:

- `kicker`: the line on the title screen;
- `evidence`: one label per chapter group (`backlog`, `roles`, `sprint`, `flujo`), shown on chapter cards;
- `refs`: one extra reference per decision id, shown after the Scrum Guide reference in "Para estudiar".

Profile files (`content/profiles/*.json`) are **not tracked by git**: they usually point to a course's
own material, which belongs to that course. `python3 scripts/build.py` validates every profile it finds
(all 4 groups and all 17 decisions must be covered) and writes one extra SCORM zip per profile,
`Juego_Scrum_Master_Restrepo_<zipSuffix>_SCORM.zip`. Preview one with
`python3 scripts/build.py --no-zip --profile <id>`.

Example (`content/profiles/mi-curso.json`; the `refs` must list all 17 decision ids, `c1d1` … `c5d2`):

```json
{
  "id": "mi-curso",
  "zipSuffix": "MICURSO",
  "kicker": "Reto Scrum · Curso de Gestión Ágil de Proyectos",
  "label": "Curso de Gestión Ágil de Proyectos · Universidad Ejemplo",
  "evidence": {
    "backlog": "Taller 1 · Product Backlog",
    "roles": "Taller 2 · Scrum Team",
    "sprint": "Taller 3 · El Sprint",
    "flujo": "Taller 4 · Kanban y mejora continua"
  },
  "refs": {
    "c1d1": "Unidad 1, lectura 2",
    "c1d2": "Unidad 1, lectura 3",
    "…": "…"
  }
}
```
