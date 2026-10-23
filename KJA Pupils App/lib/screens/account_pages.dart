import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../navigation.dart';
import '../state/portal_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class NotificationsPage extends StatefulWidget {
  const NotificationsPage({super.key, required this.portal, required this.controller, required this.open});

  final PortalSnapshot portal;
  final PortalController controller;
  final ValueChanged<AppDestination> open;

  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  String? _openId;

  @override
  Widget build(BuildContext context) {
    final notices = widget.portal.notices;
    final unread = widget.portal.unreadNotices;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        PageHero(
          kicker: 'Inbox',
          title: 'Notifications',
          lead: unread == 0 ? 'You are up to date.' : 'You have ${plural(unread, 'new notice')}.',
          icon: Icons.notifications_rounded,
          colors: const [Color(0xFF78350F), KjaColors.sun, Color(0xFFFDE68A)],
          footer: unread == 0
              ? null
              : Align(
                  alignment: Alignment.centerLeft,
                  child: FilledButton.tonal(
                    onPressed: () => widget.controller.markNoticesRead([
                      for (final notice in notices)
                        if (!notice.read) notice.id,
                    ]),
                    child: const Text('Mark all read'),
                  ),
                ),
        ),
        const SizedBox(height: 12),
        if (notices.isEmpty)
          const EmptyNote(icon: Icons.notifications_none_rounded, message: 'Homework, messages and school news will show up here.')
        else
          for (final notice in notices)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: SoftCard(
                color: notice.read ? Colors.white : const Color(0xFFFFFBEB),
                child: InkWell(
                  onTap: () {
                    setState(() => _openId = _openId == notice.id ? null : notice.id);
                    if (!notice.read) widget.controller.markNoticesRead([notice.id]);
                  },
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(notice.read ? Icons.drafts_rounded : Icons.mail_rounded, color: notice.read ? KjaColors.soft : KjaColors.sun),
                          const SizedBox(width: 8),
                          Expanded(child: Text(notice.title, style: const TextStyle(fontWeight: FontWeight.w800))),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(shortDate(notice.createdAt, withYear: true), style: const TextStyle(color: KjaColors.soft, fontSize: 12)),
                      if (_openId == notice.id && (notice.body ?? '').isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(notice.body!, style: const TextStyle(height: 1.35)),
                      ],
                      if (_openId == notice.id && destinationForHref(notice.href) != null)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton(
                            onPressed: () => widget.open(destinationForHref(notice.href)!),
                            child: const Text('Open'),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
      ],
    );
  }
}

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key, required this.portal, required this.controller});

  final PortalSnapshot portal;
  final PortalController controller;

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  var _busy = false;
  var _obscure = true;
  String? _message;
  var _ok = false;

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _message = null;
    });
    final error = await widget.controller.changePassword(_password.text, _confirm.text);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _ok = error == null;
      _message = error ?? 'Password updated. Well done!';
    });
    if (error == null) {
      _password.clear();
      _confirm.clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    final pupil = widget.portal.pupil;
    final tone = houseColor(pupil?.house);
    final first = firstNameOf(widget.portal.displayName);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
      children: [
        _CardHero(firstName: first, houseTone: tone, mustReset: widget.portal.mustResetPassword),
        const SizedBox(height: 16),
        if (pupil == null)
          const EmptyNote(
            icon: Icons.badge_rounded,
            message: 'The office still needs to link this login to your pupil record.',
          )
        else
          _StudentIdCard(
            pupil: pupil,
            tone: tone,
            photoUrl: widget.portal.photoUrl ?? widget.portal.faceUrl(pupil.id),
            studentId: pupil.id,
          ),
        const SizedBox(height: 18),
        _CardSectionLabel('Login & password', Icons.lock_rounded, KjaColors.coral),
        const SizedBox(height: 8),
        SoftCard(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: KjaColors.skyWash,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.mail_rounded, color: KjaColors.skyDeep, size: 20),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Your school email',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: KjaColors.soft),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          widget.portal.email.isEmpty ? 'No email on this login' : widget.portal.email,
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5, color: KjaColors.ink),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (widget.portal.mustResetPassword) ...[
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: KjaColors.roseWash,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: KjaColors.rose.withValues(alpha: 0.25)),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.key_rounded, color: KjaColors.rose, size: 18),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Please choose a new password before you continue.',
                          style: TextStyle(color: KjaColors.rose, fontWeight: FontWeight.w700, fontSize: 13, height: 1.3),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 14),
              const Text(
                'Change password',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: KjaColors.ink),
              ),
              const SizedBox(height: 4),
              const Text(
                'Use at least 6 characters. Keep it secret!',
                style: TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w600, fontSize: 12.5),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _password,
                obscureText: _obscure,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(
                  labelText: 'New password',
                  prefixIcon: const Icon(Icons.lock_outline_rounded),
                  suffixIcon: IconButton(
                    onPressed: () => setState(() => _obscure = !_obscure),
                    icon: Icon(_obscure ? Icons.visibility_rounded : Icons.visibility_off_rounded),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _confirm,
                obscureText: _obscure,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) {
                  if (!_busy) _save();
                },
                decoration: const InputDecoration(
                  labelText: 'Type it again',
                  prefixIcon: Icon(Icons.lock_rounded),
                ),
              ),
              if (_message != null) ...[
                const SizedBox(height: 10),
                Text(
                  _message!,
                  style: TextStyle(
                    color: _ok ? KjaColors.mintDeep : KjaColors.rose,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _busy ? null : _save,
                  style: FilledButton.styleFrom(
                    backgroundColor: KjaColors.coral,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  icon: Icon(_busy ? Icons.hourglass_top_rounded : Icons.check_circle_rounded, size: 20),
                  label: Text(
                    _busy ? 'Saving…' : 'Save new password',
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CardHero extends StatelessWidget {
  const _CardHero({
    required this.firstName,
    required this.houseTone,
    required this.mustReset,
  });

  final String firstName;
  final Color houseTone;
  final bool mustReset;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            houseTone,
            Color.lerp(houseTone, KjaColors.coral, 0.45) ?? KjaColors.coral,
            const Color(0xFFFDA31B),
          ],
        ),
        borderRadius: BorderRadius.circular(26),
        boxShadow: [
          BoxShadow(
            color: houseTone.withValues(alpha: 0.3),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Stack(
        children: [
          Positioned(
            right: -18,
            top: -24,
            child: Container(
              width: 100,
              height: 100,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.16),
              ),
            ),
          ),
          Positioned(
            left: 40,
            bottom: -36,
            child: Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.1),
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.badge_rounded, color: Colors.white.withValues(alpha: 0.95), size: 16),
                  const SizedBox(width: 6),
                  Text(
                    'About me',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.92),
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                    ),
                  ),
                  if (mustReset) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.22),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Text(
                        'SET PASSWORD',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.4,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 8),
              const Text(
                'My card',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  height: 1.05,
                  letterSpacing: -0.4,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Hi $firstName! This is your school card. Keep your login safe.',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.92),
                  fontSize: 13.5,
                  height: 1.35,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CardSectionLabel extends StatelessWidget {
  const _CardSectionLabel(this.title, this.icon, this.color);

  final String title;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, size: 17, color: color),
        ),
        const SizedBox(width: 8),
        Text(
          title,
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: KjaColors.ink),
        ),
      ],
    );
  }
}

class _StudentIdCard extends StatelessWidget {
  const _StudentIdCard({
    required this.pupil,
    required this.tone,
    this.photoUrl,
    this.studentId,
  });

  final Pupil pupil;
  final Color tone;
  final String? photoUrl;
  final String? studentId;

  @override
  Widget build(BuildContext context) {
    final facts = <({IconData icon, String label, String value, Color color})>[
      if (pupil.studentNumber.isNotEmpty)
        (icon: Icons.tag_rounded, label: 'Number', value: pupil.studentNumber, color: KjaColors.sky),
      if ((pupil.house ?? '').trim().isNotEmpty)
        (icon: Icons.home_rounded, label: 'House', value: pupil.house!.trim(), color: tone),
      if ((pupil.campus ?? '').trim().isNotEmpty)
        (icon: Icons.location_on_rounded, label: 'Campus', value: pupil.campus!.trim(), color: KjaColors.mint),
      if ((pupil.sex ?? '').trim().isNotEmpty)
        (icon: Icons.person_rounded, label: 'Sex', value: pupil.sex!.trim(), color: KjaColors.sun),
    ];

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(26),
        boxShadow: [
          BoxShadow(
            color: tone.withValues(alpha: 0.18),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(26),
        child: Column(
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    tone.withValues(alpha: 0.95),
                    Color.lerp(tone, KjaColors.navy, 0.35) ?? KjaColors.navy,
                  ],
                ),
              ),
              child: const Row(
                children: [
                  SchoolMark(size: 40),
                  SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Kampala Junior Academy',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 14.5,
                            height: 1.2,
                          ),
                        ),
                        SizedBox(height: 2),
                        Text(
                          'Official student card',
                          style: TextStyle(
                            color: Color(0xFFFFE7B0),
                            fontWeight: FontWeight.w700,
                            fontSize: 11.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Container(
              width: double.infinity,
              color: Colors.white,
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
              child: Column(
                children: [
                  PupilFace(
                    name: pupil.displayName,
                    color: tone,
                    radius: 40,
                    photoUrl: photoUrl,
                    studentId: studentId ?? pupil.id,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    pupil.displayName,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: KjaColors.ink,
                      letterSpacing: -0.3,
                      height: 1.15,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                    decoration: BoxDecoration(
                      color: tone.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: tone.withValues(alpha: 0.22)),
                    ),
                    child: Text(
                      pupil.classLabel,
                      style: TextStyle(color: tone, fontWeight: FontWeight.w800, fontSize: 13),
                    ),
                  ),
                  if (facts.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    LayoutBuilder(
                      builder: (context, constraints) {
                        final columns = constraints.maxWidth >= 360 ? 2 : 1;
                        const gap = 8.0;
                        final tileW = (constraints.maxWidth - gap * (columns - 1)) / columns;
                        return Wrap(
                          spacing: gap,
                          runSpacing: gap,
                          children: [
                            for (final fact in facts)
                              SizedBox(
                                width: tileW,
                                child: _FactTile(
                                  icon: fact.icon,
                                  label: fact.label,
                                  value: fact.value,
                                  color: fact.color,
                                ),
                              ),
                          ],
                        );
                      },
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FactTile extends StatelessWidget {
  const _FactTile({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.16)),
      ),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 16, color: color),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: KjaColors.soft),
                ),
                const SizedBox(height: 1),
                Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: KjaColors.ink),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
