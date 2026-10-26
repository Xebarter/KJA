import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../state/teacher_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _enter = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 720),
  )..forward();

  @override
  void dispose() {
    _enter.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final curve = CurvedAnimation(parent: _enter, curve: Curves.easeOutCubic);
    return Scaffold(
      backgroundColor: KjaColors.pageTop,
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              KjaColors.pageTop,
              KjaColors.pageMid,
              KjaColors.pageBottom,
            ],
          ),
        ),
        child: Center(
          child: FadeTransition(
            opacity: curve,
            child: const Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _SplashMark(),
                SizedBox(height: 18),
                Text(
                  'KJA Teachers',
                  style: TextStyle(
                    color: KjaColors.ink,
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.4,
                  ),
                ),
                SizedBox(height: 6),
                Text(
                  'Kampala Junior Academy',
                  style: TextStyle(
                    color: KjaColors.soft,
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                ),
                SizedBox(height: 28),
                SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: KjaColors.navy,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SplashMark extends StatelessWidget {
  const _SplashMark();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 88,
      height: 88,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: KjaColors.navy.withValues(alpha: 0.08),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      padding: const EdgeInsets.all(5),
      child: const SchoolMark(size: 78),
    );
  }
}

class SetupScreen extends StatefulWidget {
  const SetupScreen({super.key, required this.controller});
  final TeacherController controller;

  @override
  State<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends State<SetupScreen> {
  final _url = TextEditingController();
  final _key = TextEditingController();
  var _busy = false;
  String? _error;

  @override
  void dispose() {
    _url.dispose();
    _key.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await widget.controller.saveConnection(_url.text, _key.text);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = error;
    });
  }

  @override
  Widget build(BuildContext context) {
    return GateScaffold(
      title: 'KJA Teachers',
      subtitle: 'Connect this app to your school',
      support:
          'Paste the project URL and anon key from the school website setup.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _url,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              labelText: 'Project URL',
              hintText: 'https://your-project.supabase.co',
              prefixIcon: Icon(Icons.link_rounded, color: KjaColors.skyDeep),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _key,
            decoration: const InputDecoration(
              labelText: 'Anon key',
              prefixIcon: Icon(Icons.vpn_key_rounded, color: KjaColors.sunDeep),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 14),
            GateNotice(message: _error!, tone: Tone.rose),
          ],
          const SizedBox(height: 20),
          GatePrimaryButton(
            label: _busy ? 'Connecting…' : 'Save connection',
            busy: _busy,
            color: KjaColors.navy,
            onPressed: _busy ? null : _save,
          ),
        ],
      ),
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.controller});
  final TeacherController controller;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  var _busy = false;
  var _obscure = true;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = widget.controller.hasSession && _email.text.trim().isEmpty
        ? await widget.controller.retry()
        : await widget.controller.signIn(_email.text, _password.text);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = error ?? widget.controller.banner;
    });
  }

  @override
  Widget build(BuildContext context) {
    final waiting =
        widget.controller.hasSession && widget.controller.snapshot == null;
    final notice = _error ?? widget.controller.banner;
    return GateScaffold(
      title: 'Welcome',
      subtitle: 'Sign in to your teacher desk',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            decoration: const InputDecoration(
              labelText: 'Email',
              prefixIcon: Icon(Icons.mail_rounded, color: KjaColors.skyDeep),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _password,
            obscureText: _obscure,
            autofillHints: const [AutofillHints.password],
            onSubmitted: (_) {
              if (!_busy) _submit();
            },
            decoration: InputDecoration(
              labelText: 'Password',
              prefixIcon: const Icon(Icons.lock_rounded, color: KjaColors.rose),
              suffixIcon: IconButton(
                tooltip: _obscure ? 'Show password' : 'Hide password',
                onPressed: () {
                  HapticFeedback.selectionClick();
                  setState(() => _obscure = !_obscure);
                },
                icon: Icon(
                  _obscure
                      ? Icons.visibility_rounded
                      : Icons.visibility_off_rounded,
                ),
              ),
            ),
          ),
          if (notice != null) ...[
            const SizedBox(height: 14),
            GateNotice(message: notice, tone: Tone.rose),
          ],
          const SizedBox(height: 20),
          GatePrimaryButton(
            label: _busy ? 'Signing in…' : (waiting ? 'Try again' : 'Sign in'),
            busy: _busy,
            color: KjaColors.rose,
            onPressed: _busy ? null : _submit,
          ),
        ],
      ),
    );
  }
}

class UnavailableScreen extends StatelessWidget {
  const UnavailableScreen({super.key, required this.controller});
  final TeacherController controller;

  @override
  Widget build(BuildContext context) {
    return GateScaffold(
      title: 'Not linked yet',
      subtitle: 'This login is not a teacher desk',
      support: 'Ask the academics office to link your email to your staff record, then sign in again.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          GateNotice(
            message:
                controller.snapshot?.unavailableMessage ??
                'We could not open a teacher desk for this account.',
            tone: Tone.sun,
          ),
          const SizedBox(height: 20),
          GatePrimaryButton(
            label: 'Sign out',
            busy: false,
            color: KjaColors.navy,
            onPressed: controller.signOut,
          ),
        ],
      ),
    );
  }
}

class GateScaffold extends StatelessWidget {
  const GateScaffold({
    super.key,
    required this.title,
    required this.subtitle,
    required this.child,
    this.support,
  });

  final String title;
  final String subtitle;
  final String? support;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFFFFF8EF),
              Color(0xFFE8F8F0),
              Color(0xFFE8F4FF),
              Color(0xFFFFF1F0),
            ],
            stops: [0, 0.35, 0.7, 1],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(22, 28, 22, 32),
                children: [
                  const SchoolMark(size: 128),
                  const SizedBox(height: 18),
                  Text(
                    title,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.5,
                      color: KjaColors.ink,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    subtitle,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: KjaColors.navy,
                    ),
                  ),
                  if (support != null) ...[
                    const SizedBox(height: 6),
                    Text(
                      support!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: KjaColors.soft,
                        height: 1.4,
                        fontSize: 14,
                      ),
                    ),
                  ],
                  const SizedBox(height: 26),
                  DecoratedBox(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(28),
                      border: Border.all(color: const Color(0xFFF0F3F8)),
                      boxShadow: [
                        BoxShadow(
                          color: KjaColors.navy.withValues(alpha: 0.07),
                          blurRadius: 32,
                          offset: const Offset(0, 14),
                        ),
                      ],
                    ),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(18, 22, 18, 22),
                      child: child,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class GatePrimaryButton extends StatelessWidget {
  const GatePrimaryButton({
    super.key,
    required this.label,
    required this.busy,
    required this.color,
    required this.onPressed,
  });

  final String label;
  final bool busy;
  final Color color;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      style: FilledButton.styleFrom(
        backgroundColor: color,
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      onPressed: onPressed,
      child: busy
          ? const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white,
              ),
            )
          : Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
            ),
    );
  }
}

class GateNotice extends StatelessWidget {
  const GateNotice({super.key, required this.message, required this.tone});
  final String message;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: tone.wash,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: tone.ink.withValues(alpha: 0.15)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_rounded, color: tone.ink, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: tone.ink,
                height: 1.35,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
