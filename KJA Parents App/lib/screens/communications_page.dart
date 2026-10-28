import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../state/portal_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class CommunicationsPage extends StatefulWidget {
  const CommunicationsPage({super.key, required this.portal, required this.controller});

  final PortalSnapshot portal;
  final PortalController controller;

  @override
  State<CommunicationsPage> createState() => _CommunicationsPageState();
}

class _CommunicationsPageState extends State<CommunicationsPage> {
  CommThread? _open;
  String _topic = commTopics.first;
  final _body = TextEditingController();
  var _busy = false;

  PortalSnapshot get portal => widget.controller.snapshot ?? widget.portal;

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  Future<void> _openThread(CommThread thread) async {
    setState(() => _open = thread);
    final unread = thread.items.where((m) => m.direction == 'in' && !m.read).map((m) => m.id).toList();
    if (unread.isNotEmpty) await widget.controller.markMessagesRead(unread);
  }

  Future<void> _send({String? threadId, String? subject}) async {
    final text = _body.text.trim();
    if (text.isEmpty) return;
    setState(() => _busy = true);
    final error = await widget.controller.sendMessage(
      subject: subject ?? _topic,
      body: text,
      threadId: threadId,
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
      return;
    }
    _body.clear();
    final threads = widget.controller.snapshot?.threads ?? [];
    if (threadId != null) {
      final match = threads.cast<CommThread?>().firstWhere(
        (t) => t?.threadId == threadId || t?.key == threadId,
        orElse: () => null,
      );
      setState(() => _open = match ?? (threads.isNotEmpty ? threads.first : null));
    } else {
      setState(() => _open = threads.isNotEmpty ? threads.first : null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final threads = portal.threads;
    if (_open != null) {
      final live = threads.cast<CommThread?>().firstWhere(
        (t) => t?.key == _open!.key || (t?.threadId != null && t?.threadId == _open!.threadId),
        orElse: () => _open,
      )!;
      return _ThreadView(
        thread: live,
        body: _body,
        busy: _busy,
        onBack: () => setState(() => _open = null),
        onSend: () => _send(threadId: live.threadId ?? live.key, subject: live.subject),
      );
    }

    return PortalScroll(
      children: [
        const PageIntro(
          tone: Tone.mint,
          eyebrow: 'INBOX',
          title: 'Communications',
          detail: 'Message the school office and follow open threads.',
        ),
        const SizedBox(height: 12),
        SoftCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('New message', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, letterSpacing: -0.15)),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final topic in commTopics)
                    ChoiceChip(
                      label: Text(topic),
                      selected: _topic == topic,
                      onSelected: (_) => setState(() => _topic = topic),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _body,
                minLines: 3,
                maxLines: 5,
                decoration: const InputDecoration(hintText: 'Write your message…'),
              ),
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(backgroundColor: KjaColors.mintDeep),
                  onPressed: _busy ? null : () => _send(),
                  icon: const Icon(Icons.send_rounded, size: 18),
                  label: Text(_busy ? 'Sending…' : 'Send'),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        const SectionTitle(title: 'Threads'),
        const SizedBox(height: 10),
        if (threads.isEmpty)
          const EmptyNote(icon: Icons.forum_rounded, title: 'No conversations yet', message: 'Start one above to reach the school office.')
        else
          ...threads.map((thread) {
            final hasUnread = thread.unread > 0;
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SoftCard(
                accent: hasUnread ? KjaColors.mintDeep : null,
                onTap: () => _openThread(thread),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ToneIcon(
                      icon: thread.fromSchool ? Icons.school_rounded : Icons.person_rounded,
                      tone: hasUnread ? Tone.mint : Tone.sky,
                      size: 42,
                      iconSize: 20,
                      active: hasUnread,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  thread.subject,
                                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                                ),
                              ),
                              if (hasUnread)
                                StatusPill(label: '${thread.unread}', tone: Tone.rose, filled: true),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            thread.last.body,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: KjaColors.soft, height: 1.4, fontWeight: FontWeight.w600, fontSize: 13.5),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            thread.awaitingSchool ? 'Awaiting school reply' : _ago(thread.last.createdAt),
                            style: const TextStyle(color: KjaColors.mute, fontSize: 12, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
      ],
    );
  }

  String _ago(String iso) {
    final parsed = DateTime.tryParse(iso);
    if (parsed == null) return '';
    return timeAgo(parsed);
  }
}

class _ThreadView extends StatelessWidget {
  const _ThreadView({
    required this.thread,
    required this.body,
    required this.busy,
    required this.onBack,
    required this.onSend,
  });

  final CommThread thread;
  final TextEditingController body;
  final bool busy;
  final VoidCallback onBack;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Material(
          color: Colors.white,
          elevation: 0,
          child: Container(
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: KjaColors.line)),
            ),
            child: ListTile(
              leading: IconButton(icon: const Icon(Icons.arrow_back_rounded), onPressed: onBack),
              title: Text(thread.subject, style: const TextStyle(fontWeight: FontWeight.w800)),
              subtitle: Text('${thread.items.length} messages', style: const TextStyle(fontWeight: FontWeight.w600)),
            ),
          ),
        ),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
            itemCount: thread.items.length,
            itemBuilder: (context, index) {
              final message = thread.items[index];
              final mine = message.direction == 'out';
              return Align(
                alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
                  padding: const EdgeInsets.fromLTRB(14, 11, 14, 11),
                  decoration: BoxDecoration(
                    color: mine ? KjaColors.skyWash : Colors.white,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(16),
                      topRight: const Radius.circular(16),
                      bottomLeft: Radius.circular(mine ? 16 : 5),
                      bottomRight: Radius.circular(mine ? 5 : 16),
                    ),
                    border: Border.all(color: mine ? KjaColors.sky.withValues(alpha: 0.18) : KjaColors.line),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        mine ? 'You' : 'School',
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 12,
                          color: mine ? KjaColors.skyDeep : KjaColors.navy,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(message.body, style: const TextStyle(height: 1.45, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        SafeArea(
          top: false,
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            decoration: const BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: KjaColors.line)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: body,
                    minLines: 1,
                    maxLines: 4,
                    decoration: const InputDecoration(hintText: 'Reply…'),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  style: IconButton.styleFrom(
                    backgroundColor: KjaColors.mintDeep,
                    minimumSize: const Size(48, 48),
                  ),
                  onPressed: busy ? null : onSend,
                  icon: busy
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.send_rounded),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
