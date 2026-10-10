<?php
// After restoring the course from a backup WITHOUT users: enrolment methods are not part of such a backup, so
// re-apply them (manual + self enabled with new enrolments allowed, guest disabled) and make the course visible.
//   MOODLE_CONFIG=/path/to/config.php php post_restore.php <shortname>
define('CLI_SCRIPT', true);
require(getenv('MOODLE_CONFIG') ?: '/var/www/html/config.php');
require_once($CFG->libdir . '/clilib.php');
require_once($CFG->dirroot . '/course/lib.php');
global $DB;
$short = $argv[1] ?? 'SCRUMRESTREPO';
$course = $DB->get_record('course', ['shortname' => $short], '*', MUST_EXIST);
\core\session\manager::set_user(get_admin());
foreach (['manual', 'self'] as $name) {
    $plugin = enrol_get_plugin($name);
    $inst = $DB->get_record('enrol', ['courseid' => $course->id, 'enrol' => $name]);
    if (!$inst) {
        $inst = $DB->get_record('enrol', ['id' => $plugin->add_default_instance($course)]);
    }
    $plugin->update_status($inst, ENROL_INSTANCE_ENABLED);
}
$DB->set_field('enrol', 'customint6', 1, ['courseid' => $course->id, 'enrol' => 'self']);
if ($g = $DB->get_record('enrol', ['courseid' => $course->id, 'enrol' => 'guest'])) {
    enrol_get_plugin('guest')->update_status($g, ENROL_INSTANCE_DISABLED);
}
if (!$course->visible) {
    course_change_visibility($course->id, true);
}
rebuild_course_cache($course->id, true);
echo "post-restore OK: course {$course->id} [{$course->shortname}]\n";
