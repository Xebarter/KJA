import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../format.dart';
import '../pupil_photos.dart';
import '../state/teacher_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key, required this.controller});

  final TeacherController controller;

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  var _busy = false;
  var _photoBusy = false;
  String? _error;

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _savePassword() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await widget.controller.changePassword(
      _password.text,
      _confirm.text,
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (error != null) {
      setState(() => _error = error);
      return;
    }
    _password.clear();
    _confirm.clear();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Password updated. You can open your desk.'),
      ),
    );
  }

  Future<void> _pickPhoto() async {
    final file = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 1200,
      imageQuality: 80,
    );
    if (file == null) return;
    final bytes = await file.readAsBytes();
    final name = file.name.toLowerCase();
    final mime = name.endsWith('.png')
        ? 'image/png'
        : name.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';
    final extension = mime == 'image/png'
        ? 'png'
        : mime == 'image/webp'
        ? 'webp'
        : 'jpg';
    setState(() => _photoBusy = true);
    final error = await widget.controller.setPhoto(bytes, extension, mime);
    if (!mounted) return;
    setState(() => _photoBusy = false);
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(error ?? 'Photo saved.')));
  }

  Future<void> _clearPhoto() async {
    setState(() => _photoBusy = true);
    final error = await widget.controller.clearPhoto();
    if (!mounted) return;
    setState(() => _photoBusy = false);
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(error ?? 'Photo removed.')));
  }

  @override
  Widget build(BuildContext context) {
    final portal = widget.controller.snapshot!;
    final staff = portal.staff;
    return DeskScroll(
      children: [
        SoftCard(
          child: Row(
            children: [
              PupilFace(
                name: staff.fullName,
                photoUrl: staff.photoUrl,
                photoBytes: PhotoCache.instance[staff.id],
                radius: 34,
                color: KjaColors.navy,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      staff.fullName,
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 18,
                        letterSpacing: -0.2,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      [
                        portal.roleLabel,
                        if ((staff.title ?? '').isNotEmpty) staff.title!,
                        if ((staff.campus ?? '').isNotEmpty) staff.campus!,
                      ].join(' · '),
                      style: const TextStyle(
                        color: KjaColors.soft,
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      [
                        staff.email ?? 'No email',
                        if ((staff.initials ?? '').isNotEmpty) 'Initials ${staff.initials}',
                        if (portal.term != null) portal.term!.label,
                      ].join(' · '),
                      style: const TextStyle(
                        color: KjaColors.mute,
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (portal.mustResetPassword)
          const SoftCard(
            child: Text(
              'Set a new password before the rest of your desk opens.',
              style: TextStyle(
                color: KjaColors.soft,
                fontWeight: FontWeight.w700,
                height: 1.35,
              ),
            ),
          ),
        Row(
          children: [
            Expanded(
              child: FilledButton.tonalIcon(
                onPressed: _photoBusy ? null : _pickPhoto,
                icon: const Icon(Icons.photo_camera_rounded, size: 18),
                label: Text(_photoBusy ? 'Working…' : 'Set photo'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _photoBusy || staff.photoPath == null
                    ? null
                    : _clearPhoto,
                icon: const Icon(Icons.hide_image_rounded, size: 18),
                label: const Text('Clear'),
              ),
            ),
          ],
        ),
        if (portal.classes.isNotEmpty) ...[
          const SectionTitle(title: 'Classes you lead'),
          for (final post in portal.classes)
            SoftCard(
              child: DeskRow(
                leading: ToneIcon(
                  icon: Icons.groups_rounded,
                  tone: Tone.rose,
                  size: 40,
                  iconSize: 20,
                ),
                title: post.label,
                subtitle: 'Class teacher',
              ),
            ),
        ],
        if (portal.subjects.isNotEmpty) ...[
          const SectionTitle(title: 'Subjects you teach'),
          for (final post in portal.subjects)
            SoftCard(
              child: DeskRow(
                leading: ToneIcon(
                  icon: Icons.school_rounded,
                  tone: Tone.sky,
                  size: 40,
                  iconSize: 20,
                ),
                title: post.subjectName,
                subtitle: classLabelOf(post.classCode, post.stream),
              ),
            ),
        ],
        const SectionTitle(title: 'Password'),
        SoftCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Keep your account secure',
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15.5),
              ),
              const SizedBox(height: 4),
              const Text(
                'Use a password only you know. You stay signed in on this device.',
                style: TextStyle(color: KjaColors.soft, height: 1.35, fontSize: 13),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _password,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'New password'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _confirm,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Confirm password',
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
                onPressed: _busy ? null : _savePassword,
                icon: const Icon(Icons.lock_rounded, size: 18),
                label: Text(_busy ? 'Saving…' : 'Change password'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
