import 'package:flutter_test/flutter_test.dart';
import 'package:kja_pupils/chat_filter.dart';
import 'package:kja_pupils/format.dart';
import 'package:kja_pupils/models.dart';
import 'package:kja_pupils/navigation.dart';

void main() {
  test('chat filter blocks severe words and flags unkind ones', () {
    expect(filterStudentChat('hello class').blocked, isFalse);
    expect(filterStudentChat('hello class').flagged, isFalse);
    expect(filterStudentChat('you are stupid').blocked, isFalse);
    expect(filterStudentChat('you are stupid').flagged, isTrue);
    expect(filterStudentChat('kys').blocked, isTrue);
    expect(filterStudentChat('   ').blocked, isTrue);
  });

  test('greeting follows the Kampala school day', () {
    expect(greetingForHour(8), 'Good morning');
    expect(greetingForHour(13), 'Good afternoon');
    expect(greetingForHour(19), 'Good evening');
  });

  test('class labels keep the stream', () {
    expect(classLabelOf('P4', 'A'), 'P4 A');
    expect(classLabelOf('P4', ''), 'P4');
    expect(classLabelOf(null, 'A'), 'No class');
  });

  test('notice links open the matching page', () {
    expect(destinationForHref('/student/homework'), AppDestination.homework);
    expect(destinationForHref('/student/messages?c=1'), AppDestination.messages);
    expect(destinationForHref('/event/sports-day'), AppDestination.calendar);
    expect(destinationForHref(null), isNull);
  });

  test('attendance percent counts present and late', () {
    final summary = AttendanceSummary.fromDays(const [
      AttendanceDay(attendedOn: '2026-10-01', status: 'present'),
      AttendanceDay(attendedOn: '2026-10-02', status: 'late'),
      AttendanceDay(attendedOn: '2026-10-03', status: 'absent'),
      AttendanceDay(attendedOn: '2026-10-04', status: 'excused'),
    ]);
    expect(summary.percent, 50);
    expect(summary.recent.first.attendedOn, '2026-10-04');
  });
}
