import 'package:flutter/material.dart';

import '../models.dart';
import '../state/portal_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key, required this.portal, required this.controller});

  final PortalSnapshot portal;
  final PortalController controller;

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _address;
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  var _busy = false;
  var _pwdBusy = false;

  @override
  void initState() {
    super.initState();
    final p = widget.portal.profile;
    _name = TextEditingController(text: p.fullName ?? widget.portal.displayName);
    _phone = TextEditingController(text: p.phone ?? '');
    _address = TextEditingController(text: p.address ?? '');
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _address.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    final error = await widget.controller.updateProfile(
      fullName: _name.text,
      phone: _phone.text,
      address: _address.text,
    );
    if (!mounted) return;
    setState(() => _busy = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error ?? 'Details saved.')),
    );
  }

  Future<void> _changePassword() async {
    setState(() => _pwdBusy = true);
    final error = await widget.controller.changePassword(_password.text, _confirm.text);
    if (!mounted) return;
    setState(() => _pwdBusy = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error ?? 'Password updated.')),
    );
    if (error == null) {
      _password.clear();
      _confirm.clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    return PortalScroll(
      children: [
        BrandHero(
          eyebrow: 'ACCOUNT',
          title: 'My details',
          detail: widget.portal.email,
          trailing: PupilFace(
            name: _name.text.isEmpty ? widget.portal.displayName : _name.text,
            radius: 24,
            color: KjaColors.sky,
          ),
        ),
        const SizedBox(height: 14),
        SoftCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Profile', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, letterSpacing: -0.15)),
              const SizedBox(height: 12),
              TextField(controller: _name, decoration: const InputDecoration(labelText: 'Full name')),
              const SizedBox(height: 10),
              TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Phone (for MoMo)'),
              ),
              const SizedBox(height: 10),
              TextField(controller: _address, decoration: const InputDecoration(labelText: 'Address'), minLines: 2, maxLines: 3),
              const SizedBox(height: 14),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: KjaColors.navy, minimumSize: const Size.fromHeight(48)),
                onPressed: _busy ? null : _save,
                child: Text(_busy ? 'Saving…' : 'Save details'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SoftCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Password', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, letterSpacing: -0.15)),
              const SizedBox(height: 12),
              TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'New password')),
              const SizedBox(height: 10),
              TextField(controller: _confirm, obscureText: true, decoration: const InputDecoration(labelText: 'Confirm password')),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: _pwdBusy ? null : _changePassword,
                  child: Text(_pwdBusy ? 'Updating…' : 'Update password'),
                ),
              ),
            ],
          ),
        ),
        if (widget.portal.children.isNotEmpty) ...[
          const SizedBox(height: 12),
          SoftCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Linked children', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, letterSpacing: -0.15)),
                const SizedBox(height: 6),
                ...widget.portal.children.map(
                  (child) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: PupilFace(name: child.fullName, studentId: child.id, photoUrl: child.photoUrl, radius: 20),
                    title: Text(child.fullName, style: const TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text(child.classLabel, style: const TextStyle(fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
