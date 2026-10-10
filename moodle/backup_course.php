<?php
// Course backup WITHOUT user data (no users, enrolments, attempts, logs), e.g. to move a course from a staging
// site to production.
//   php backup_course.php <shortname> <destination.mbz>
define('CLI_SCRIPT', true);
require('/var/www/html/config.php');
require_once($CFG->dirroot . '/backup/util/includes/backup_includes.php');
require_once($CFG->libdir . '/clilib.php');
[$short, $dest] = array_slice($argv, 1, 2) + [null, null];
if (!$short || !$dest) {
    cli_error('usage: php backup_course.php <shortname> <destination.mbz>');
}
global $DB;
$course = $DB->get_record('course', ['shortname' => $short], 'id,shortname,fullname', MUST_EXIST);
$admin = get_admin();
\core\session\manager::set_user($admin);
$bc = new backup_controller(backup::TYPE_1COURSE, $course->id, backup::FORMAT_MOODLE, backup::INTERACTIVE_NO,
    backup::MODE_GENERAL, $admin->id);
$off = ['users', 'role_assignments', 'comments', 'badges', 'userscompletion', 'logs', 'grade_histories', 'groups',
    'competencies', 'anonymize'];
foreach ($bc->get_plan()->get_settings() as $s) {
    $n = $s->get_name();
    if (in_array($n, $off, true) && $s->get_value()) {
        $s->set_value($n === 'anonymize' ? 0 : 0);
    }
}
$users = $bc->get_plan()->get_setting('users')->get_value();
if ($users) {
    cli_error('!! the users setting is still ON — refusing to write a backup with user data');
}
$bc->execute_plan();
$file = $bc->get_results()['backup_destination'];
$ok = $file->copy_content_to($dest);
$bc->destroy();
clearstatcache();
if (!$ok || !is_file($dest) || filesize($dest) < 1000) {
    cli_error("!! could not write $dest (is the folder writable by the web user?)");
}
echo "backup of [{$course->shortname}] (id {$course->id}) without users -> $dest (" . filesize($dest) . " bytes)\n";
