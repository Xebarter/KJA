import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/portal_repository.dart';
import '../data/sample_portal.dart';
import '../format.dart';
import '../models.dart';
import '../state/portal_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

/// Matches Home: sky accents, soft mint for “my” bubbles.
class _ChatColors {
  static const mine = Color(0xFFBBF7D0);
  static const mineInk = Color(0xFF064E3B);
  static const them = Colors.white;
  static const groupA = Color(0xFF38BDF8);
  static const groupB = KjaColors.sky;
  static const groupC = Color(0xFF0284C7);
}

String _clockLabel(DateTime when) {
  final local = when.toUtc().add(const Duration(hours: 3));
  final h = local.hour.toString().padLeft(2, '0');
  final m = local.minute.toString().padLeft(2, '0');
  return '$h:$m';
}

String _dayKey(DateTime when) {
  final local = when.toUtc().add(const Duration(hours: 3));
  final month = local.month.toString().padLeft(2, '0');
  final day = local.day.toString().padLeft(2, '0');
  return '${local.year}-$month-$day';
}

String _dayLabel(DateTime when) {
  final key = _dayKey(when);
  final today = todayYmd();
  final yesterday = addDaysYmd(today, -1);
  if (key == today) return 'Today';
  if (key == yesterday) return 'Yesterday';
  final local = when.toUtc().add(const Duration(hours: 3));
  return '${weekdayShort(local.weekday)} ${local.day} ${monthShort(local.month)}';
}

class MessagesPage extends StatelessWidget {
  const MessagesPage({
    super.key,
    required this.portal,
    required this.controller,
    this.initialPeerId,
  });

  final PortalSnapshot portal;
  final PortalController controller;
  final String? initialPeerId;

  @override
  Widget build(BuildContext context) {
    if (portal.pupil == null) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: EmptyNote(
          icon: Icons.chat_bubble_rounded,
          message: 'Your pupil record is not linked yet, so messaging is unavailable.',
        ),
      );
    }
    return _Inbox(
      portal: portal,
      controller: controller,
      initialPeerId: initialPeerId,
    );
  }
}

class _Inbox extends StatefulWidget {
  const _Inbox({
    required this.portal,
    required this.controller,
    this.initialPeerId,
  });

  final PortalSnapshot portal;
  final PortalController controller;
  final String? initialPeerId;

  @override
  State<_Inbox> createState() => _InboxState();
}

class _InboxState extends State<_Inbox> {
  Conversation? _open;
  String? _error;
  String? _busyPeerId;
  final _search = TextEditingController();
  String? _consumedPeerId;

  List<Conversation> get _conversations => widget.portal.conversations;

  Conversation? get _classGroup {
    for (final row in _conversations) {
      if (row.isGroup) return row;
    }
    return null;
  }

  List<({Classmate peer, Conversation? conversation})> get _peerRows {
    final dms = {
      for (final row in _conversations.where((c) => !c.isGroup))
        if (row.peerId != null) row.peerId!: row,
    };
    final rows = widget.portal.classmates
        .map((peer) => (peer: peer, conversation: dms[peer.id]))
        .toList();
    rows.sort((a, b) {
      final aAt = a.conversation?.lastAt;
      final bAt = b.conversation?.lastAt;
      if (aAt != null || bAt != null) {
        if (aAt == null) return 1;
        if (bAt == null) return -1;
        return bAt.compareTo(aAt);
      }
      return a.peer.displayName.toLowerCase().compareTo(b.peer.displayName.toLowerCase());
    });
    final q = _search.text.trim().toLowerCase();
    if (q.isEmpty) return rows;
    return rows.where((row) => row.peer.displayName.toLowerCase().contains(q)).toList();
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _consumeInitialPeer());
  }

  @override
  void didUpdateWidget(covariant _Inbox oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initialPeerId != null && widget.initialPeerId != oldWidget.initialPeerId) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _consumeInitialPeer());
    }
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _consumeInitialPeer() async {
    final id = widget.initialPeerId?.trim() ?? '';
    if (id.isEmpty || id == _consumedPeerId) return;
    _consumedPeerId = id;

    Classmate? peer;
    for (final mate in widget.portal.classmates) {
      if (mate.id == id) {
        peer = mate;
        break;
      }
    }
    if (peer == null || !mounted) return;

    Conversation? existing;
    for (final row in _conversations) {
      if (!row.isGroup && row.peerId == id) {
        existing = row;
        break;
      }
    }
    await _openPeer(peer, existing);
  }

  Future<void> _openPeer(Classmate peer, Conversation? existing) async {
    if (existing != null) {
      setState(() {
        _open = existing;
        _error = null;
      });
      return;
    }
    final pupil = widget.portal.pupil!;
    setState(() {
      _busyPeerId = peer.id;
      _error = null;
    });
    if (widget.portal.preview) {
      final conversation = Conversation(
        id: 'local-${peer.id}',
        kind: 'dm',
        title: firstNameOf(peer.displayName),
        peerId: peer.id,
        house: peer.house,
      );
      sampleThreads.putIfAbsent(conversation.id, () => []);
      await widget.controller.replaceConversations([conversation, ..._conversations]);
      if (!mounted) return;
      setState(() {
        _open = conversation;
        _busyPeerId = null;
      });
      return;
    }
    try {
      final conversation = await widget.controller.repository.startChat(pupil, peer);
      if (conversation == null) {
        if (mounted) setState(() => _busyPeerId = null);
        return;
      }
      await widget.controller.replaceConversations([
        conversation,
        ..._conversations.where((row) => row.id != conversation.id),
      ]);
      if (!mounted) return;
      setState(() {
        _open = conversation;
        _busyPeerId = null;
      });
    } on PortalException catch (error) {
      if (mounted) {
        setState(() {
          _error = error.message;
          _busyPeerId = null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Could not start that chat.';
          _busyPeerId = null;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final open = _open;
    if (open != null) {
      return ChatThread(
        portal: widget.portal,
        controller: widget.controller,
        conversation: open,
        onBack: () => setState(() => _open = null),
      );
    }

    final group = _classGroup;
    final peers = _peerRows;
    final query = _search.text.trim();
    final className = widget.portal.classLabel;

    final quickFriends = widget.portal.classmates.take(12).toList();

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
      children: [
        _MessagesHero(
          classLabel: className,
          chats: _conversations.length,
          friends: widget.portal.classmates.length,
        ),
        if (_error != null) ...[
          const SizedBox(height: 10),
          Text(_error!, style: const TextStyle(color: KjaColors.rose, fontWeight: FontWeight.w700)),
        ],
        if (group != null && query.isEmpty) ...[
          const SizedBox(height: 18),
          const _ChatSectionLabel('Class group'),
          const SizedBox(height: 8),
          _GroupTile(
            conversation: group,
            classmateCount: group.memberCount > 0
                ? group.memberCount
                : widget.portal.classmates.length + 1,
            onTap: () => setState(() {
              _open = group;
              _error = null;
            }),
          ),
        ],
        if (quickFriends.isNotEmpty && query.isEmpty) ...[
          const SizedBox(height: 18),
          const _ChatSectionLabel('Say hello'),
          const SizedBox(height: 10),
          SizedBox(
            height: 92,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: quickFriends.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (context, index) {
                final mate = quickFriends[index];
                Conversation? existing;
                for (final row in _conversations) {
                  if (!row.isGroup && row.peerId == mate.id) {
                    existing = row;
                    break;
                  }
                }
                return _QuickFriendChip(
                  name: mate.displayName,
                  photoUrl: mate.photoUrl ?? widget.portal.faceUrl(mate.id),
                  color: houseColor(mate.house),
                  busy: _busyPeerId == mate.id,
                  onTap: () => _openPeer(mate, existing),
                );
              },
            ),
          ),
        ],
        const SizedBox(height: 18),
        Row(
          children: [
            const Expanded(child: _ChatSectionLabel('Friends')),
            if (widget.portal.classmates.isNotEmpty)
              Text(
                '${widget.portal.classmates.length}',
                style: const TextStyle(color: KjaColors.sky, fontWeight: FontWeight.w900, fontSize: 15),
              ),
          ],
        ),
        const SizedBox(height: 8),
        if (widget.portal.classmates.isNotEmpty) ...[
          _PeerSearch(controller: _search, onChanged: () => setState(() {})),
          const SizedBox(height: 12),
        ],
        if (peers.isEmpty)
          EmptyNote(
            icon: query.isEmpty ? Icons.groups_rounded : Icons.search_rounded,
            message: query.isEmpty
                ? 'No classmates listed yet. They will appear here when the office is ready.'
                : 'No classmates match “$query”.',
          )
        else
          for (final row in peers) ...[
            _PeerTile(
              peer: row.peer,
              conversation: row.conversation,
              photoUrl: row.peer.photoUrl ?? widget.portal.faceUrl(row.peer.id),
              busy: _busyPeerId == row.peer.id,
              onTap: () => _openPeer(row.peer, row.conversation),
            ),
            const SizedBox(height: 8),
          ],
      ],
    );
  }
}

class _ChatSectionLabel extends StatelessWidget {
  const _ChatSectionLabel(this.title);

  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: KjaColors.ink),
    );
  }
}

class _QuickFriendChip extends StatelessWidget {
  const _QuickFriendChip({
    required this.name,
    required this.color,
    required this.busy,
    required this.onTap,
    this.photoUrl,
  });

  final String name;
  final Color color;
  final String? photoUrl;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: busy ? null : onTap,
        borderRadius: BorderRadius.circular(18),
        child: SizedBox(
          width: 76,
          child: Column(
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Opacity(
                    opacity: busy ? 0.55 : 1,
                    child: PupilFace(name: name, color: color, radius: 28, photoUrl: photoUrl),
                  ),
                  Positioned(
                    right: -2,
                    bottom: -2,
                    child: Container(
                      width: 22,
                      height: 22,
                      decoration: BoxDecoration(
                        color: busy ? KjaColors.mute : KjaColors.mint,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                      ),
                      child: Icon(
                        busy ? Icons.hourglass_top_rounded : Icons.chat_rounded,
                        size: 11,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                firstNameOf(name),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: KjaColors.ink),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MessagesHero extends StatelessWidget {
  const _MessagesHero({
    required this.classLabel,
    required this.chats,
    required this.friends,
  });

  final String classLabel;
  final int chats;
  final int friends;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF38BDF8), KjaColors.sky, Color(0xFF0284C7)],
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(color: KjaColors.sky.withValues(alpha: 0.28), blurRadius: 16, offset: const Offset(0, 6)),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.22),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: Colors.white.withValues(alpha: 0.35)),
            ),
            child: const Icon(Icons.chat_rounded, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Chat',
                  style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900, height: 1.1),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (classLabel.isNotEmpty) _HeroChip(label: classLabel),
                    _HeroChip(label: '$friends friends'),
                    _HeroChip(label: '$chats chats'),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroChip extends StatelessWidget {
  const _HeroChip({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
    );
  }
}

class _PeerSearch extends StatelessWidget {
  const _PeerSearch({required this.controller, required this.onChanged});

  final TextEditingController controller;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: KjaColors.sky.withValues(alpha: 0.28)),
        boxShadow: [
          BoxShadow(color: KjaColors.sky.withValues(alpha: 0.06), blurRadius: 10, offset: const Offset(0, 3)),
        ],
      ),
      child: Row(
        children: [
          Icon(Icons.search_rounded, size: 20, color: KjaColors.soft.withValues(alpha: 0.9)),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: controller,
              onChanged: (_) => onChanged(),
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
              decoration: const InputDecoration(
                hintText: 'Find a friend…',
                hintStyle: TextStyle(color: KjaColors.mute, fontWeight: FontWeight.w500),
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                filled: false,
                contentPadding: EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
          if (controller.text.isNotEmpty)
            IconButton(
              visualDensity: VisualDensity.compact,
              onPressed: () {
                controller.clear();
                onChanged();
              },
              icon: const Icon(Icons.close_rounded, size: 18, color: KjaColors.soft),
            ),
        ],
      ),
    );
  }
}

class _GroupTile extends StatelessWidget {
  const _GroupTile({
    required this.conversation,
    required this.classmateCount,
    required this.onTap,
  });

  final Conversation conversation;
  final int classmateCount;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final preview = conversation.lastBody?.trim();
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: Ink(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: KjaColors.sky.withValues(alpha: 0.18)),
            boxShadow: [
              BoxShadow(color: KjaColors.sky.withValues(alpha: 0.12), blurRadius: 14, offset: const Offset(0, 5)),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: KjaColors.sky.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(Icons.groups_rounded, color: KjaColors.sky, size: 26),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      conversation.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: KjaColors.ink),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      preview == null || preview.isEmpty
                          ? '$classmateCount friends · tap to chat together'
                          : preview,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: KjaColors.soft, fontSize: 13, height: 1.25, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(Icons.chevron_right_rounded, color: KjaColors.sky.withValues(alpha: 0.7)),
            ],
          ),
        ),
      ),
    );
  }
}

class _PeerTile extends StatelessWidget {
  const _PeerTile({
    required this.peer,
    required this.conversation,
    required this.busy,
    required this.onTap,
    this.photoUrl,
  });

  final Classmate peer;
  final Conversation? conversation;
  final String? photoUrl;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tone = houseColor(peer.house);
    final preview = conversation?.lastBody?.trim();
    final subtitle = busy
        ? 'Opening chat…'
        : preview == null || preview.isEmpty
            ? (conversation == null ? 'Tap to say hello' : 'Say hello again')
            : preview;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: busy ? null : onTap,
        borderRadius: BorderRadius.circular(24),
        child: Ink(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: tone.withValues(alpha: 0.18)),
            boxShadow: [
              BoxShadow(color: tone.withValues(alpha: 0.12), blurRadius: 14, offset: const Offset(0, 5)),
            ],
          ),
          child: Row(
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  PupilFace(name: peer.displayName, color: tone, radius: 24, photoUrl: photoUrl),
                  Positioned(
                    right: -2,
                    bottom: -2,
                    child: Container(
                      width: 22,
                      height: 22,
                      decoration: BoxDecoration(
                        color: busy ? KjaColors.mute : KjaColors.mint,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                      ),
                      child: Icon(
                        busy ? Icons.hourglass_top_rounded : Icons.chat_rounded,
                        size: 11,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      peer.displayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15.5, color: KjaColors.ink),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: busy ? KjaColors.mintDeep : KjaColors.soft,
                        fontSize: 13,
                        fontWeight: busy ? FontWeight.w700 : FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              if (conversation?.lastAt != null)
                Text(
                  _clockLabel(conversation!.lastAt!),
                  style: const TextStyle(color: KjaColors.mute, fontSize: 11, fontWeight: FontWeight.w700),
                )
              else
                Icon(Icons.chevron_right_rounded, color: tone.withValues(alpha: 0.7)),
            ],
          ),
        ),
      ),
    );
  }
}

class _GroupAvatar extends StatelessWidget {
  const _GroupAvatar({this.size = 48});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [_ChatColors.groupA, _ChatColors.groupB, _ChatColors.groupC],
        ),
        boxShadow: [
          BoxShadow(color: Colors.white, spreadRadius: 2),
          BoxShadow(color: KjaColors.sky.withValues(alpha: 0.28), spreadRadius: 4),
        ],
      ),
      child: Icon(Icons.groups_rounded, color: Colors.white, size: size * 0.48),
    );
  }
}

class ChatThread extends StatefulWidget {
  const ChatThread({
    super.key,
    required this.portal,
    required this.controller,
    required this.conversation,
    required this.onBack,
  });

  final PortalSnapshot portal;
  final PortalController controller;
  final Conversation conversation;
  final VoidCallback onBack;

  @override
  State<ChatThread> createState() => _ChatThreadState();
}

class _ChatThreadState extends State<ChatThread> {
  final _text = TextEditingController();
  final _scroll = ScrollController();
  var _messages = <ChatMessage>[];
  var _sending = false;
  String? _error;
  RealtimeChannel? _channel;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _text.dispose();
    _scroll.dispose();
    final channel = _channel;
    if (channel != null) widget.controller.repository.stopWatching(channel);
    super.dispose();
  }

  Future<void> _load() async {
    if (widget.portal.preview) {
      setState(() => _messages = List.of(sampleThreads[widget.conversation.id] ?? const []));
      _jump();
      return;
    }
    try {
      final rows = await widget.controller.repository.messages(widget.conversation.id);
      if (!mounted) return;
      setState(() => _messages = rows);
      _jump();
      _channel = widget.controller.repository.watchMessages(widget.conversation.id, (message) {
        if (!mounted || _messages.any((row) => row.id == message.id)) return;
        setState(() => _messages = [..._messages, message]);
        _jump();
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not open this chat.');
    }
  }

  void _jump() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  String _name(String senderId) {
    final pupil = widget.portal.pupil;
    if (pupil != null && senderId == pupil.id) return 'You';
    for (final mate in widget.portal.classmates) {
      if (mate.id == senderId) return firstNameOf(mate.displayName);
    }
    return 'Classmate';
  }

  Future<void> _send() async {
    final pupil = widget.portal.pupil;
    final text = _text.text;
    if (pupil == null || text.trim().isEmpty) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    if (widget.portal.preview) {
      final message = ChatMessage(
        id: 'local-${DateTime.now().microsecondsSinceEpoch}',
        conversationId: widget.conversation.id,
        senderStudentId: pupil.id,
        body: text.trim(),
        flagged: false,
        createdAt: DateTime.now().toUtc(),
      );
      final thread = sampleThreads.putIfAbsent(widget.conversation.id, () => []);
      thread.add(message);
      _text.clear();
      setState(() {
        _messages = List.of(thread);
        _sending = false;
      });
      _jump();
      return;
    }
    try {
      final message = await widget.controller.repository.sendMessage(
        pupil: pupil,
        conversation: widget.conversation,
        body: text,
        classmates: widget.portal.classmates,
      );
      _text.clear();
      if (!mounted) return;
      setState(() {
        if (_messages.every((row) => row.id != message.id)) _messages = [..._messages, message];
        _sending = false;
      });
      _jump();
    } on PortalException catch (error) {
      if (mounted) {
        setState(() {
          _error = error.message;
          _sending = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Could not send that message.';
          _sending = false;
        });
      }
    }
  }

  List<Widget> _timeline(String? pupilId) {
    final widgets = <Widget>[];
    String? lastDay;
    for (final message in _messages) {
      final day = _dayKey(message.createdAt);
      if (day != lastDay) {
        widgets.add(_DayChip(label: _dayLabel(message.createdAt)));
        lastDay = day;
      }
      final mine = message.senderStudentId == pupilId;
      widgets.add(
        _Bubble(
          mine: mine,
          group: widget.conversation.isGroup,
          sender: (!mine && widget.conversation.isGroup) ? _name(message.senderStudentId) : null,
          body: message.body,
          time: _clockLabel(message.createdAt),
        ),
      );
    }
    return widgets;
  }

  @override
  Widget build(BuildContext context) {
    final pupilId = widget.portal.pupil?.id;
    final isGroup = widget.conversation.isGroup;
    final peerFirst = isGroup ? 'class' : firstNameOf(widget.conversation.title);
    final canSend = _text.text.trim().isNotEmpty && !_sending;

    final headerTone = isGroup
        ? KjaColors.sky
        : houseColor(
            widget.portal.classmates
                .cast<Classmate?>()
                .firstWhere(
                  (mate) => mate?.id == widget.conversation.peerId,
                  orElse: () => null,
                )
                ?.house,
          );

    return Column(
      children: [
        Material(
          color: Colors.white,
          child: Container(
            padding: const EdgeInsets.fromLTRB(6, 6, 14, 12),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(bottom: BorderSide(color: KjaColors.sky.withValues(alpha: 0.14))),
              boxShadow: [
                BoxShadow(color: KjaColors.sky.withValues(alpha: 0.06), blurRadius: 10, offset: const Offset(0, 3)),
              ],
            ),
            child: SafeArea(
              bottom: false,
              child: Row(
                children: [
                  IconButton(
                    onPressed: widget.onBack,
                    style: IconButton.styleFrom(
                      backgroundColor: KjaColors.sky.withValues(alpha: 0.1),
                      foregroundColor: KjaColors.ink,
                    ),
                    icon: const Icon(Icons.arrow_back_rounded),
                  ),
                  if (isGroup)
                    const _GroupAvatar(size: 44)
                  else
                    PupilFace(
                      name: widget.conversation.title,
                      color: headerTone,
                      radius: 22,
                      photoUrl: widget.portal.faceUrl(widget.conversation.peerId),
                    ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.conversation.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16.5, color: KjaColors.ink),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          isGroup
                              ? '${widget.conversation.memberCount > 0 ? widget.conversation.memberCount : widget.portal.classmates.length + 1} friends · keep it kind'
                              : 'Chat · keep it kind',
                          style: const TextStyle(color: KjaColors.sky, fontSize: 12, fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        Expanded(
          child: _messages.isEmpty
              ? _ChatEmpty(
                  isGroup: isGroup,
                  peerFirst: peerFirst,
                  conversation: widget.conversation,
                  photoUrl: widget.portal.faceUrl(widget.conversation.peerId),
                  color: headerTone,
                )
              : ListView(
                  controller: _scroll,
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 16),
                  children: _timeline(pupilId),
                ),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
            child: Text(_error!, style: const TextStyle(color: KjaColors.rose, fontWeight: FontWeight.w700)),
          ),
        SafeArea(
          top: false,
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: KjaColors.sky.withValues(alpha: 0.14))),
              boxShadow: [
                BoxShadow(
                  color: KjaColors.sky.withValues(alpha: 0.08),
                  blurRadius: 14,
                  offset: const Offset(0, -4),
                ),
              ],
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: TextField(
                    controller: _text,
                    minLines: 1,
                    maxLines: 4,
                    maxLength: 2000,
                    textInputAction: TextInputAction.send,
                    onChanged: (_) => setState(() {}),
                    onSubmitted: (_) {
                      if (canSend) _send();
                    },
                    style: const TextStyle(fontWeight: FontWeight.w600, height: 1.3),
                    decoration: InputDecoration(
                      counterText: '',
                      hintText: isGroup ? 'Message your class…' : 'Say something kind…',
                      filled: true,
                      fillColor: const Color(0xFFEEF7FF),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(22),
                        borderSide: BorderSide(color: KjaColors.sky.withValues(alpha: 0.2)),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(22),
                        borderSide: BorderSide(color: KjaColors.sky.withValues(alpha: 0.2)),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(22),
                        borderSide: const BorderSide(color: KjaColors.sky, width: 1.6),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: canSend
                        ? const LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [Color(0xFF38BDF8), KjaColors.sky, Color(0xFF0284C7)],
                          )
                        : null,
                    color: canSend ? null : KjaColors.line,
                    boxShadow: canSend
                        ? [BoxShadow(color: KjaColors.sky.withValues(alpha: 0.35), blurRadius: 10, offset: const Offset(0, 4))]
                        : null,
                  ),
                  child: IconButton(
                    onPressed: canSend ? _send : null,
                    icon: Icon(
                      Icons.send_rounded,
                      color: canSend ? Colors.white : KjaColors.mute,
                      size: 22,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ChatEmpty extends StatelessWidget {
  const _ChatEmpty({
    required this.isGroup,
    required this.peerFirst,
    required this.conversation,
    required this.color,
    this.photoUrl,
  });

  final bool isGroup;
  final String peerFirst;
  final Conversation conversation;
  final Color color;
  final String? photoUrl;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (isGroup)
              const _GroupAvatar(size: 76)
            else
              PupilFace(name: conversation.title, color: color, radius: 38, photoUrl: photoUrl),
            const SizedBox(height: 16),
            Text(
              isGroup ? 'Say hello to your class!' : 'Say hello to $peerFirst!',
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: KjaColors.ink),
            ),
            const SizedBox(height: 6),
            const Text(
              'Be kind and helpful.',
              style: TextStyle(color: KjaColors.sky, fontWeight: FontWeight.w700, fontSize: 13.5),
            ),
          ],
        ),
      ),
    );
  }
}

class _DayChip extends StatelessWidget {
  const _DayChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.88),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: KjaColors.line),
            boxShadow: [
              BoxShadow(color: KjaColors.sky.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2)),
            ],
          ),
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: KjaColors.soft,
              letterSpacing: 0.2,
            ),
          ),
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({
    required this.mine,
    required this.group,
    required this.body,
    required this.time,
    this.sender,
  });

  final bool mine;
  final bool group;
  final String body;
  final String time;
  final String? sender;

  @override
  Widget build(BuildContext context) {
    final radius = mine
        ? const BorderRadius.only(
            topLeft: Radius.circular(16),
            topRight: Radius.circular(16),
            bottomLeft: Radius.circular(16),
            bottomRight: Radius.circular(5),
          )
        : BorderRadius.only(
            topLeft: Radius.circular(group ? 5 : 16),
            topRight: const Radius.circular(16),
            bottomLeft: const Radius.circular(16),
            bottomRight: const Radius.circular(16),
          );

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
        child: Container(
          margin: const EdgeInsets.only(bottom: 7),
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
          decoration: BoxDecoration(
            color: mine ? _ChatColors.mine : _ChatColors.them,
            borderRadius: radius,
            border: mine ? null : Border.all(color: KjaColors.line.withValues(alpha: 0.95)),
            boxShadow: [
              BoxShadow(
                color: (mine ? KjaColors.mint : KjaColors.sky).withValues(alpha: 0.08),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (sender != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Text(
                    sender!,
                    style: const TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w800,
                      color: KjaColors.sky,
                    ),
                  ),
                ),
              Text(
                body,
                style: TextStyle(
                  color: mine ? _ChatColors.mineInk : KjaColors.ink,
                  height: 1.35,
                  fontWeight: FontWeight.w600,
                  fontSize: 14.5,
                ),
              ),
              const SizedBox(height: 3),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    time,
                    style: TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700,
                      color: mine ? KjaColors.mintDeep.withValues(alpha: 0.7) : KjaColors.mute,
                    ),
                  ),
                  if (mine) ...[
                    const SizedBox(width: 4),
                    Icon(Icons.done_all_rounded, size: 14, color: KjaColors.mintDeep.withValues(alpha: 0.75)),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
