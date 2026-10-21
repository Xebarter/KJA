class ChatCheck {
  const ChatCheck({required this.blocked, required this.flagged});

  final bool blocked;
  final bool flagged;
}

final _block = [
  RegExp(r'\b(kill\s+yourself|kys)\b', caseSensitive: false),
  RegExp(r'\b(rape|molest)\b', caseSensitive: false),
  RegExp(r'\b(nigger|faggot)\b', caseSensitive: false),
];

final _flag = [
  RegExp(r'\b(stupid|idiot|shut\s*up|hate\s+you)\b', caseSensitive: false),
  RegExp(r'\b(sex|nude|naked)\b', caseSensitive: false),
  RegExp(r'\b(drug|weed|alcohol)\b', caseSensitive: false),
  RegExp(r'\b(password|passcode)\b', caseSensitive: false),
];

/// Same classmate-chat filter as the website: block severe words, flag unkind ones.
ChatCheck filterStudentChat(String body) {
  final text = body.trim();
  if (text.isEmpty) return const ChatCheck(blocked: true, flagged: false);
  if (_block.any((pattern) => pattern.hasMatch(text))) {
    return const ChatCheck(blocked: true, flagged: true);
  }
  if (_flag.any((pattern) => pattern.hasMatch(text))) {
    return const ChatCheck(blocked: false, flagged: true);
  }
  return const ChatCheck(blocked: false, flagged: false);
}
