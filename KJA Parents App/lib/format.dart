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
  final base = '${date.day} ${_shortMonths[date.month - 1]}';
  return withYear ? '$base ${date.year}' : base;
}

String plural(int count, String word) => '$count $word${count == 1 ? '' : 's'}';

String firstNameOf(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  return parts.isEmpty || parts.first.isEmpty ? 'there' : parts.first;
}

String initialsOf(String name) {
  final words = name.replaceAll(RegExp(r'@.*'), '').split(RegExp(r'[\s._-]+')).where((w) => w.isNotEmpty).toList();
  if (words.isEmpty) return 'P';
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

String moneyUgx(num amount) {
  final n = amount.round();
  final s = n.abs().toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write(',');
    buf.write(s[i]);
  }
  final body = buf.toString();
  return n < 0 ? '−UGX $body' : 'UGX $body';
}

String timeAgo(DateTime when) {
  final local = when.toUtc().add(const Duration(hours: 3));
  final delta = kampalaNow().difference(local);
  if (delta.inMinutes < 1) return 'Just now';
  if (delta.inMinutes < 60) return '${delta.inMinutes}m';
  if (delta.inHours < 24) return '${delta.inHours}h';
  if (delta.inDays < 7) return '${delta.inDays}d';
  return shortDate(ymd(local));
}

String cleanSubject(String? subject) {
  final raw = (subject ?? '').trim();
  if (raw.isEmpty) return 'Message';
  return raw.replaceFirst(RegExp(r'^(re|fw|fwd)\s*:\s*', caseSensitive: false), '').trim();
}

String threadKey(String? subject) => cleanSubject(subject).toLowerCase();

String stripHtml(String? raw) {
  final value = (raw ?? '').trim();
  if (value.isEmpty) return '';
  return value
      .replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), '\n')
      .replaceAll(RegExp(r'</p>', caseSensitive: false), '\n')
      .replaceAll(RegExp(r'<[^>]+>'), ' ')
      .replaceAll(RegExp(r'&nbsp;', caseSensitive: false), ' ')
      .replaceAll(RegExp(r'&amp;', caseSensitive: false), '&')
      .replaceAll(RegExp(r'&lt;', caseSensitive: false), '<')
      .replaceAll(RegExp(r'&gt;', caseSensitive: false), '>')
      .replaceAll(RegExp(r'&quot;', caseSensitive: false), '"')
      .replaceAll(RegExp(r'\s+\n'), '\n')
      .replaceAll(RegExp(r'[ \t]{2,}'), ' ')
      .trim();
}

const commTopics = <String>[
  'School fees',
  'Reports & learning',
  'Clubs & activities',
  'Absence or health',
  'Admissions',
  'General enquiry',
];
