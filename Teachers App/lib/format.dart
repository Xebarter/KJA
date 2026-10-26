const shortMonths = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const _longMonths = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const _weekdays = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const schoolClasses = <({String code, String name, String section})>[
  (code: 'RC', name: 'Reception Class', section: 'nursery'),
  (code: 'C2', name: 'Baby Class', section: 'nursery'),
  (code: 'C3', name: 'Middle Class', section: 'nursery'),
  (code: 'C4', name: 'Top Class', section: 'nursery'),
  (code: 'P1', name: 'Primary One', section: 'primary'),
  (code: 'P2', name: 'Primary Two', section: 'primary'),
  (code: 'P3', name: 'Primary Three', section: 'primary'),
  (code: 'P4', name: 'Primary Four', section: 'primary'),
  (code: 'P5', name: 'Primary Five', section: 'primary'),
  (code: 'P6', name: 'Primary Six', section: 'primary'),
  (code: 'P7', name: 'Primary Seven', section: 'primary'),
];

DateTime kampalaNow() => DateTime.now().toUtc().add(const Duration(hours: 3));

String ymd(DateTime date) {
  final month = date.month.toString().padLeft(2, '0');
  final day = date.day.toString().padLeft(2, '0');
  return '${date.year}-$month-$day';
}

String kampalaToday() => ymd(kampalaNow());

String addDaysIso(String iso, int days) {
  final date = parseDate(iso);
  if (date == null) return iso;
  return ymd(date.add(Duration(days: days)));
}

String greetingForHour(int hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

String greeting() => greetingForHour(kampalaNow().hour);

String longToday() {
  final now = kampalaNow();
  return '${_weekdays[now.weekday - 1]}, ${now.day} ${_longMonths[now.month - 1]}';
}

DateTime? parseDate(String? value) {
  if (value == null || value.length < 10) return null;
  final year = int.tryParse(value.substring(0, 4));
  final month = int.tryParse(value.substring(5, 7));
  final day = int.tryParse(value.substring(8, 10));
  if (year == null || month == null || day == null) return null;
  return DateTime(year, month, day);
}

String shortDate(String? value, {bool withYear = false}) {
  final date = parseDate(value);
  if (date == null) return value ?? '';
  final base = '${date.day} ${shortMonths[date.month - 1]}';
  return withYear ? '$base ${date.year}' : base;
}

String firstNameOf(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  return parts.isEmpty || parts.first.isEmpty ? 'Teacher' : parts.first;
}

String initialsOf(String name) {
  final words = name
      .replaceAll(RegExp(r'@.*'), '')
      .split(RegExp(r'[\s._-]+'))
      .where((w) => w.isNotEmpty)
      .toList();
  if (words.isEmpty) return 'T';
  final first = words.first[0];
  final last = words.length > 1 ? words.last[0] : '';
  return ('$first$last').toUpperCase();
}

String classNameOf(String? code) {
  final wanted = code?.trim() ?? '';
  if (wanted.isEmpty) return 'No class';
  for (final entry in schoolClasses) {
    if (entry.code == wanted) return entry.name;
  }
  return wanted;
}

String classSectionOf(String? code) {
  final wanted = code?.trim() ?? '';
  for (final entry in schoolClasses) {
    if (entry.code == wanted) return entry.section;
  }
  return 'primary';
}

String classLabelOf(String? classCode, String? stream) {
  final name = classNameOf(classCode);
  final extra = (stream ?? '').trim();
  return extra.isEmpty ? name : '$name $extra';
}

String postKey(String classCode, String stream, String subjectId) =>
    '$classCode|$stream|$subjectId';

String classKey(String classCode, String stream) => '$classCode|$stream';

String kindLabel(String kind) {
  switch (kind) {
    case 'bot':
      return 'Beginning';
    case 'midterm':
      return 'Mid-term';
    case 'endterm':
      return 'End of term';
    case 'test':
      return 'Test';
    case 'exam':
      return 'Exam';
    case 'deadline':
      return 'Deadline';
    case 'meeting':
      return 'Meeting';
    case 'reporting':
      return 'Reporting';
    case 'note':
      return 'Note';
    case 'file':
      return 'File';
    case 'image':
      return 'Picture';
    case 'link':
      return 'Link';
    default:
      return kind;
  }
}

String statusLabel(String status) {
  switch (status) {
    case 'open':
      return 'Open';
    case 'submitted':
      return 'Submitted';
    case 'approved':
      return 'Locked';
    case 'present':
      return 'Present';
    case 'late':
      return 'Late';
    case 'absent':
      return 'Absent';
    case 'excused':
      return 'Excused';
    default:
      return status;
  }
}

double? asDouble(dynamic value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  return double.tryParse(value.toString());
}

int? asInt(dynamic value) {
  if (value == null) return null;
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse(value.toString());
}

String asText(dynamic value, [String fallback = '']) {
  final text = value?.toString().trim() ?? '';
  return text.isEmpty ? fallback : text;
}

String embedName(dynamic value, [String fallback = 'Subject']) {
  if (value is Map && value['name'] != null) {
    return asText(value['name'], fallback);
  }
  if (value is List && value.isNotEmpty) {
    return embedName(value.first, fallback);
  }
  return fallback;
}
