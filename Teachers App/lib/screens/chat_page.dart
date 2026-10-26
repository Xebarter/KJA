import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../state/teacher_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class ChatPage extends StatefulWidget {
  const ChatPage({super.key, required this.controller});

  final TeacherController controller;

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  String? _classKey;
  var _filter = 'All';

  @override
  Widget build(BuildContext context) {
    final portal = widget.controller.snapshot!;
    if (!portal.classTeacher) {
      return const DeskScroll(
        children: [
          EmptyNote(
            icon: Icons.forum_rounded,
            title: 'Class teachers only',
            message: 'You can read and hide pupil messages once the academics office makes you a class teacher.',
          ),
        ],
      );
    }

    ClassPost selected = portal.classes.first;
    for (final row in portal.classes) {
      if (classKey(row.classCode, row.stream) == _classKey) selected = row;
    }
    _classKey = classKey(selected.classCode, selected.stream);
    final threads = portal.threads.where((thread) {
      if (thread.classCode != selected.classCode ||
          thread.stream != selected.stream) {
        return false;
      }
      if (_filter == 'Flagged') return thread.flagged;
      if (_filter == 'Hidden') return thread.hasHidden;
      return true;
    }).toList();

    return DeskScroll(
      children: [
        if (portal.classes.length > 1)
          ChoiceChips(
            labels: [for (final post in portal.classes) post.label],
            selected: selected.label,
            onSelect: (label) {
              final post = portal.classes.firstWhere(
                (row) => row.label == label,
              );
              setState(() => _classKey = classKey(post.classCode, post.stream));
            },
          ),
        ChoiceChips(
          labels: const ['All', 'Flagged', 'Hidden'],
          selected: _filter,
          onSelect: (value) => setState(() => _filter = value),
        ),
        if (threads.isEmpty)
          const EmptyNote(
            icon: Icons.forum_rounded,
            title: 'No conversations',
            message: 'Pupil chats for this class will show up here.',
          )
        else
          for (final thread in threads)
            SoftCard(
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => ChatThreadPage(
                      controller: widget.controller,
                      thread: thread,
                    ),
                  ),
                );
              },
              child: DeskRow(
                leading: ToneIcon(
                  icon: Icons.forum_rounded,
                  tone: thread.flagged
                      ? Tone.rose
                      : thread.hasHidden
                          ? Tone.sun
                          : Tone.mint,
                  size: 42,
                  iconSize: 20,
                ),
                title: thread.title,
                subtitle: (thread.preview ?? '').isEmpty
                    ? 'Open conversation'
                    : thread.preview,
                trailing: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    if (thread.flagged)
                      const StatusChip(label: 'Flagged', tone: Tone.rose),
                    if (thread.hasHidden) ...[
                      if (thread.flagged) const SizedBox(height: 6),
                      const StatusChip(label: 'Hidden', tone: Tone.sun),
                    ],
                    if (!thread.flagged && !thread.hasHidden)
                      const Icon(Icons.chevron_right_rounded, color: KjaColors.mute),
                  ],
                ),
              ),
            ),
      ],
    );
  }
}

class ChatThreadPage extends StatefulWidget {
  const ChatThreadPage({
    super.key,
    required this.controller,
    required this.thread,
  });

  final TeacherController controller;
  final ChatThread thread;

  @override
  State<ChatThreadPage> createState() => _ChatThreadPageState();
}

class _ChatThreadPageState extends State<ChatThreadPage> {
  var _filter = 'All';

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onChange);
    widget.controller.openThread(widget.thread.id);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onChange);
    super.dispose();
  }

  void _onChange() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final messages = widget.controller.thread.where((message) {
      if (widget.controller.threadId != widget.thread.id) return false;
      if (_filter == 'Flagged') return message.flagged && !message.hidden;
      if (_filter == 'Hidden') return message.hidden;
      return true;
    }).toList();
    return Scaffold(
      appBar: AppBar(title: Text(widget.thread.title)),
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [KjaColors.pageTop, KjaColors.pageBottom],
          ),
        ),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: ChoiceChips(
                labels: const ['All', 'Flagged', 'Hidden'],
                selected: _filter,
                onSelect: (value) => setState(() => _filter = value),
              ),
            ),
            Expanded(
              child: widget.controller.threadLoading
                  ? const Center(child: CircularProgressIndicator())
                  : messages.isEmpty
                  ? const Center(child: Text('No messages in this view.'))
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                      itemCount: messages.length,
                      itemBuilder: (context, index) {
                        final message = messages[index];
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: SoftCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        message.senderName ?? 'Pupil',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                    ),
                                    if (message.flagged)
                                      const _Tag('Flagged', KjaColors.rose),
                                    if (message.hidden)
                                      const _Tag('Hidden', KjaColors.soft),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  message.body,
                                  style: TextStyle(
                                    height: 1.35,
                                    color: message.hidden
                                        ? KjaColors.mute
                                        : KjaColors.ink,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  shortDate(message.createdAt, withYear: true),
                                  style: const TextStyle(
                                    color: KjaColors.mute,
                                    fontSize: 12,
                                  ),
                                ),
                                if (!message.hidden) ...[
                                  const SizedBox(height: 8),
                                  OutlinedButton(
                                    onPressed: () async {
                                      final error = await widget.controller
                                          .hideMessage(message.id);
                                      if (!context.mounted) return;
                                      if (error != null) {
                                        ScaffoldMessenger.of(context)
                                            .showSnackBar(
                                              SnackBar(content: Text(error)),
                                            );
                                      }
                                    },
                                    child: const Text('Hide from pupils'),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.label, this.color);
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(left: 6),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}
