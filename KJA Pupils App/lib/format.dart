const _shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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
const _weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

DateTime kampalaNow() => DateTime.now().toUtc().add(const Duration(hours: 3));

String ymd(DateTime date) {
  final month = date.month.toString().padLeft(2, '0');
  final day = date.day.toString().padLeft(2, '0');
  return '${date.year}-$month-$day';
}

String todayYmd() => ymd(kampalaNow());

String addDaysYmd(String start, int days) {
  final date = DateTime.parse('${start}T12:00:00').add(Duration(days: days));
  return ymd(date);
}

int kampalaWeekday() => kampalaNow().weekday;

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

String weekdayName(int weekday) {
  if (weekday < 1 || weekday > 7) return '';
  return _weekdays[weekday - 1];
}

String weekdayShort(int weekday) {
  const shorts = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  if (weekday < 1 || weekday > 7) return '';
  return shorts[weekday - 1];
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
  final base = '${date.day} ${_shortMonths[date.month - 1]}';
  return withYear ? '$base ${date.year}' : base;
}

String monthShort(int month) {
  if (month < 1 || month > 12) return '';
  return _shortMonths[month - 1];
}

String monthLong(int month) {
  if (month < 1 || month > 12) return '';
  return _longMonths[month - 1];
}

String clock(String? value) {
  if (value == null || value.isEmpty) return '';
  return value.length >= 5 ? value.substring(0, 5) : value;
}

String plural(int count, String word) => '$count $word${count == 1 ? '' : 's'}';

String academicKindLabel(String kind) {
  switch (kind) {
    case 'exam':
      return 'Test day';
    case 'reporting':
      return 'Reports go home';
    case 'deadline':
      return 'Deadline';
    case 'meeting':
      return 'School meeting';
    default:
      return 'School event';
  }
}

String firstNameOf(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  return parts.isEmpty || parts.first.isEmpty ? 'friend' : parts.first;
}

String initialsOf(String name) {
  final words = name.replaceAll(RegExp(r'@.*'), '').split(RegExp(r'[\s._-]+')).where((w) => w.isNotEmpty).toList();
  if (words.isEmpty) return 'S';
  final first = words.first[0];
  final last = words.length > 1 ? words.last[0] : '';
  return ('$first$last').toUpperCase();
}

String classLabelOf(String? classCode, String? stream) {
  final code = classCode?.trim() ?? '';
  if (code.isEmpty) return 'No class';
  final bit = stream?.trim() ?? '';
  return bit.isEmpty ? code : '$code $bit';
}

String timeAgo(DateTime when) {
  final delta = kampalaNow().difference(when.toUtc().add(const Duration(hours: 3)));
  if (delta.inMinutes < 1) return 'Just now';
  if (delta.inMinutes < 60) return '${delta.inMinutes}m';
  if (delta.inHours < 24) return '${delta.inHours}h';
  if (delta.inDays < 7) return '${delta.inDays}d';
  return shortDate(ymd(when.toUtc().add(const Duration(hours: 3))));
}
