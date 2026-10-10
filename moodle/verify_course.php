<?php
// Read-only check of the course after create/restore: format, enrolment, SCORM settings, package files, grade item.
//   php verify_course.php <shortname>
define('CLI_SCRIPT', true);
require(getenv('MOODLE_CONFIG') ?: '/var/www/html/config.php');
require_once($CFG->libdir . '/gradelib.php');
global $DB, $CFG;
$short = $argv[1] ?? 'SCRUMRESTREPO';
$c = $DB->get_record('course', ['shortname' => $short], '*', MUST_EXIST);
echo "site={$CFG->wwwroot}\ncourse id={$c->id} [{$c->shortname}] '{$c->fullname}' format={$c->format} visible={$c->visible} completion={$c->enablecompletion} category={$c->category}\n";
foreach ($DB->get_records('enrol', ['courseid' => $c->id], 'sortorder') as $e) {
    echo "enrol {$e->enrol} status={$e->status} customint6={$e->customint6}\n";
}
echo "enrolled users: " . $DB->count_records_sql('SELECT COUNT(1) FROM {user_enrolments} ue JOIN {enrol} e ON e.id = ue.enrolid WHERE e.courseid = ?', [$c->id]) . "\n";
$s = $DB->get_record('scorm', ['course' => $c->id], '*', MUST_EXIST);
$cm = get_coursemodule_from_instance('scorm', $s->id, $c->id, false, MUST_EXIST);
echo "scorm cmid={$cm->id} '{$s->name}' version={$s->version} grademethod={$s->grademethod} maxattempt={$s->maxattempt} forcenewattempt={$s->forcenewattempt} masteryoverride={$s->masteryoverride} hidetoc={$s->hidetoc} skipview={$s->skipview} popup={$s->popup}\n";
echo "cm completion={$cm->completion} completionstatusrequired={$s->completionstatusrequired} visible={$cm->visible}\n";
$sco = $DB->get_records_select('scorm_scoes', "scorm = ? AND scormtype = 'sco'", [$s->id], '', 'id,identifier,launch');
foreach ($sco as $x) echo "sco {$x->identifier} launch={$x->launch}\n";
$fs = get_file_storage();
$ctx = context_module::instance($cm->id);
$files = $fs->get_area_files($ctx->id, 'mod_scorm', 'content', 0, 'filepath,filename', false);
echo "content files: " . count($files) . " (" . implode(' ', array_map(fn($f) => ltrim($f->get_filepath(), '/') . $f->get_filename(), $files)) . ")\n";
$gi = grade_item::fetch(['itemtype' => 'mod', 'itemmodule' => 'scorm', 'iteminstance' => $s->id, 'courseid' => $c->id]);
echo "grade item grademax=" . ($gi ? $gi->grademax : 'none') . "\n";
$img = $fs->get_area_files(context_course::instance($c->id)->id, 'course', 'overviewfiles', false, 'filename', false);
echo "course image: " . ($img ? reset($img)->get_filename() : 'none') . "\n";
echo "attempts: " . $DB->count_records("scorm_attempt", ["scormid" => $s->id]) . "\n";
