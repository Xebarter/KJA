import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../state/teacher_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class NoticesPage extends StatefulWidget {
  const NoticesPage({super.key, required this.controller});

  final TeacherController controller;

  @override
  State<NoticesPage> createState() => _NoticesPageState();
}

class _NoticesPageState extends State<NoticesPage> {
  String? _classKey;
  final _title = TextEditingController();
  final _body = TextEditingController();
  var _busy = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _send(ClassPost post) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await widget.controller.sendNotice(
      classCode: post.classCode,
      stream: post.stream,
      title: _title.text,
      body: _body.text,
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (error != null) {
      setState(() => _error = error);
      return;
    }
    _title.clear();
    _body.clear();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Notice sent to the class and their parents.'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final portal = widget.controller.snapshot!;
    if (!portal.classTeacher) {
      return const DeskScroll(
        children: [
          EmptyNote(
            icon: Icons.campaign_rounded,
            title: 'Class teachers only',
            message: 'Notices go to a class you lead.',
          ),
        ],
      );
    }
    final post = portal.classes.firstWhere(
      (row) => classKey(row.classCode, row.stream) == _classKey,
      orElse: () => portal.classes.first,
    );
    _classKey = classKey(post.classCode, post.stream);
    final history = portal.notices
        .where(
          (row) => row.classCode == post.classCode && row.stream == post.stream,
        )
        .toList();
    return DeskScroll(
      children: [
        if (portal.classes.length > 1)
          ChoiceChips(
            labels: [for (final row in portal.classes) row.label],
            selected: post.label,
            onSelect: (label) {
              final next = portal.classes.firstWhere(
                (row) => row.label == label,
              );
              setState(() => _classKey = classKey(next.classCode, next.stream));
            },
          ),
        SoftCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                post.label,
                style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _title,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Title',
                  hintText: 'Sports day reminder',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _body,
                minLines: 3,
                maxLines: 6,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Message',
                  hintText: 'Keep it short and clear…',
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(
                  _error!,
                  style: const TextStyle(
                    color: KjaColors.rose,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: _busy ? null : () => _send(post),
                icon: _busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.send_rounded, size: 18),
                label: Text(_busy ? 'Sending…' : 'Send to class'),
              ),
            ],
          ),
        ),
        const SectionTitle(title: 'Recent notices'),
        if (history.isEmpty)
          const EmptyNote(
            icon: Icons.campaign_rounded,
            title: 'Nothing sent yet',
            message: 'Notices you send this term show up here.',
          )
        else
          for (final notice in history)
            SoftCard(
              child: DeskRow(
                leading: ToneIcon(
                  icon: Icons.campaign_rounded,
                  tone: Tone.coral,
                  size: 42,
                  iconSize: 20,
                ),
                title: notice.title,
                subtitle: (notice.body ?? '').isEmpty
                    ? shortDate(notice.createdAt, withYear: true)
                    : notice.body,
                trailing: StatusChip(
                  label: shortDate(notice.createdAt),
                  tone: Tone.coral,
                ),
              ),
            ),
      ],
    );
  }
}
