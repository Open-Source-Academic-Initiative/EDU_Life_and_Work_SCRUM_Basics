<?php
// Creates the open course "El Scrum más Master del Restrepo" on a Moodle 4.5 site: a single-activity SCORM course
// with self-enrolment, grading by learning objects and completion = status "completed" (the game reports
// completion only). See README "Using it in Moodle".
//   php create_course.php <scorm.zip> <course-image.png>
// Run as the web server user (e.g. sudo -u www-data php …). Refuses to run twice.
define('CLI_SCRIPT', true);
require('/var/www/html/config.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/course/modlib.php');
require_once($CFG->dirroot . '/mod/scorm/lib.php');
require_once($CFG->dirroot . '/mod/scorm/locallib.php');
require_once($CFG->libdir . '/clilib.php');
require_once($CFG->libdir . '/completionlib.php');

[$zip, $img] = array_slice($argv, 1, 2) + [null, null];
if (!$zip || !is_readable($zip) || !$img || !is_readable($img)) {
    cli_error("usage: php create_course.php <scorm.zip> <course-image.png>");
}
global $DB, $CFG;
$admin = get_admin();
\core\session\manager::set_user($admin);

$SHORT = 'SCRUMRESTREPO';
$NAME = 'El Scrum más Master del Restrepo';
if ($DB->record_exists('course', ['shortname' => $SHORT])) {
    cli_error("A course with shortname $SHORT already exists — nothing done.");
}
$summary = '<p><strong>El Scrum más Master del Restrepo</strong> es un juego serio de unos 20 minutos en pixel art. '
    . 'Recorre un taller de calzado del barrio Restrepo (Bogotá), toma 17 decisiones con Scrum y ayuda a que la empresa '
    . 'no se quiebre aprovechando el papayazo de un contrato de exportación.</p>'
    . '<p>Vas a practicar: historias de usuario y Product Backlog; las responsabilidades del Product Owner, el Scrum Master '
    . 'y los Developers; Sprint Planning, Daily Scrum, burndown y Definición de Terminado; Kanban; Sprint Review y '
    . 'Sprint Retrospective. Al final recibes qué hiciste bien, qué estudiar y un reto para compartir.</p>'
    . '<p>Basado en la <a href="https://scrumguides.org/" target="_blank" rel="noopener">Guía Scrum 2020</a> '
    . '(CC BY-SA 4.0). Código MIT · Contenido CC BY-SA 4.0 · '
    . '<a href="https://campus.opensai.org/reto-scrum/" target="_blank" rel="noopener">Reto público</a></p>';

echo "== course\n";
$course = create_course((object) [
    'category' => $DB->get_field_sql('SELECT MIN(id) FROM {course_categories}'),
    'fullname' => $NAME,
    'shortname' => $SHORT,
    'summary' => $summary,
    'summaryformat' => FORMAT_HTML,
    'format' => 'singleactivity',
    'activitytype' => 'scorm',
    'enablecompletion' => 1,
    'showgrades' => 1,
    'visible' => 1,
    'lang' => '',
]);
echo "   id={$course->id} [{$course->shortname}] format={$course->format}\n";

$fs = get_file_storage();
$ctx = context_course::instance($course->id);
$fs->create_file_from_pathname(['contextid' => $ctx->id, 'component' => 'course', 'filearea' => 'overviewfiles',
    'itemid' => 0, 'filepath' => '/', 'filename' => 'el-scrum-mas-master-del-restrepo.png'], $img);
echo "   course image stored\n";

echo "== enrolment (manual + self enabled, guest disabled)\n";
$self = enrol_get_plugin('self');
$inst = $DB->get_record('enrol', ['courseid' => $course->id, 'enrol' => 'self']);
if (!$inst) {
    $inst = $DB->get_record('enrol', ['id' => $self->add_default_instance($course)]);
}
$self->update_status($inst, ENROL_INSTANCE_ENABLED);
$DB->set_field('enrol', 'customint6', 1, ['id' => $inst->id]);   // allow new self-enrolments
if ($g = $DB->get_record('enrol', ['courseid' => $course->id, 'enrol' => 'guest'])) {
    enrol_get_plugin('guest')->update_status($g, ENROL_INSTANCE_DISABLED);
}
foreach ($DB->get_records('enrol', ['courseid' => $course->id], 'sortorder') as $e) {
    echo "   {$e->enrol} status={$e->status} customint6={$e->customint6}\n";
}

echo "== SCORM activity\n";
$draft = file_get_unused_draft_itemid();
$fs->create_file_from_pathname(['contextid' => context_user::instance($admin->id)->id, 'component' => 'user',
    'filearea' => 'draft', 'itemid' => $draft, 'filepath' => '/', 'filename' => basename($zip)], $zip);
$mi = (object) [
    'modulename' => 'scorm',
    'module' => $DB->get_field('modules', 'id', ['name' => 'scorm'], MUST_EXIST),  // add_moduleinfo() won't look it up
    'course' => $course->id, 'section' => 0, 'visible' => 1, 'visibleoncoursepage' => 1,
    'name' => $NAME,
    'introeditor' => ['text' => '<p>Salva el taller con Scrum. Necesitas unos 20 minutos; puedes pausar y continuar.</p>',
        'format' => FORMAT_HTML, 'itemid' => 0],
    'showdescription' => 0, 'cmidnumber' => '', 'groupmode' => 0, 'groupingid' => 0,
    'scormtype' => SCORM_TYPE_LOCAL, 'packagefile' => $draft, 'updatefreq' => 0,
    // display: current window, enter the content directly, no TOC, no course structure
    'popup' => 0, 'width' => 0, 'height' => 0, 'skipview' => SCORM_SKIPVIEW_FIRST, 'hidebrowse' => 0,
    'displaycoursestructure' => 0, 'hidetoc' => SCORM_TOC_DISABLED, 'nav' => 1,
    'navpositionleft' => -100, 'navpositiontop' => -100, 'displayattemptstatus' => 1,
    // attempts and grading: unlimited, never force a new attempt (keeps suspend_data), learning objects
    'maxattempt' => 0, 'forcenewattempt' => 0, 'lastattemptlock' => 0, 'forcecompleted' => 0,
    'grademethod' => GRADESCOES, 'whatgrade' => 0, 'maxgrade' => 100, 'masteryoverride' => 0,
    'autocommit' => 0, 'auto' => 0, 'timeopen' => 0, 'timeclose' => 0,
    // completion: automatic, when the SCO reports "completed" (4; "passed" would be 2)
    'completion' => COMPLETION_TRACKING_AUTOMATIC, 'completionstatusrequired' => 4,
    'completionscorerequired' => null, 'completionstatusallscos' => 0, 'completionexpected' => 0,
];
$mi = add_moduleinfo($mi, $course);
$s = $DB->get_record('scorm', ['id' => $mi->instance], '*', MUST_EXIST);
$sco = $DB->get_record_select('scorm_scoes', "scorm = ? AND scormtype = 'sco'", [$s->id], 'identifier,launch', MUST_EXIST);
echo "   cmid={$mi->coursemodule} scorm={$s->id} version={$s->version} reference={$s->reference} sco={$sco->identifier} launch={$sco->launch}\n";
echo "   grademethod={$s->grademethod} completionstatusrequired={$s->completionstatusrequired} hidetoc={$s->hidetoc} skipview={$s->skipview}\n";
rebuild_course_cache($course->id, true);
echo "Done: {$CFG->wwwroot}/course/view.php?id={$course->id}\n";
