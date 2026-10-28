import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../state/portal_controller.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _enter = AnimationController(vsync: this, duration: const Duration(milliseconds: 280))
    ..forward();

  @override
  void dispose() {
    _enter.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final curve = CurvedAnimation(parent: _enter, curve: Curves.easeOutCubic);
    return Scaffold(
      backgroundColor: KjaColors.navyDeep,
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [KjaColors.navyDeep, KjaColors.navy, Color(0xFF1E5A8A)],
          ),
        ),
        child: Center(
          child: FadeTransition(
            opacity: curve,
            child: AnimatedBuilder(
              animation: curve,
              builder: (context, child) => Transform.translate(offset: Offset(0, (1 - curve.value) * 14), child: child),
              child: const Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _SplashMark(),
                  SizedBox(height: 20),
                  Text(
                    'KJA Parents',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.45,
                      height: 1,
                    ),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'Kampala Junior Academy',
                    style: TextStyle(color: Color(0xFFFDA31B), fontWeight: FontWeight.w700, fontSize: 14.5, height: 1.2),
                  ),
                  SizedBox(height: 30),
                  SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2.2, color: KjaColors.gold),
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

class _SplashMark extends StatelessWidget {
  const _SplashMark();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 96,
      height: 96,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white,
        border: Border.all(color: KjaColors.gold.withValues(alpha: 0.55), width: 2),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.22), blurRadius: 24, offset: const Offset(0, 10)),
        ],
      ),
      padding: const EdgeInsets.all(5),
      child: const SchoolMark(size: 86),
    );
  }
}

class SetupScreen extends StatefulWidget {
  const SetupScreen({super.key, required this.controller});
  final PortalController controller;

  @override
  State<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends State<SetupScreen> {
  final _url = TextEditingController();
  final _key = TextEditingController();
  final _urlFocus = FocusNode();
  final _keyFocus = FocusNode();
  var _busy = false;
  String? _error;

  @override
  void dispose() {
    _url.dispose();
    _key.dispose();
    _urlFocus.dispose();
    _keyFocus.dispose();
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
      title: 'KJA Parents',
      subtitle: 'Connect this app to your school',
      support: 'Paste the project URL and anon key from your school setup.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          GateField(
            controller: _url,
            focusNode: _urlFocus,
            label: 'Project URL',
            hint: 'https://your-project.supabase.co',
            icon: Icons.link_rounded,
            accent: KjaColors.skyDeep,
            keyboardType: TextInputType.url,
            textInputAction: TextInputAction.next,
            onSubmitted: (_) => _keyFocus.requestFocus(),
          ),
          const SizedBox(height: 12),
          GateField(
            controller: _key,
            focusNode: _keyFocus,
            label: 'Anon key',
            icon: Icons.vpn_key_rounded,
            accent: KjaColors.sunDeep,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) {
              if (!_busy) _save();
            },
          ),
          if (_error != null) ...[
            const SizedBox(height: 14),
            _GateNotice(message: _error!, tone: Tone.rose),
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
  final PortalController controller;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _emailFocus = FocusNode();
  final _passwordFocus = FocusNode();
  var _busy = false;
  var _obscure = true;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _emailFocus.dispose();
    _passwordFocus.dispose();
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
    final waiting = widget.controller.hasSession && widget.controller.snapshot == null;
    final notice = _error ?? widget.controller.banner;
    return GateScaffold(
      title: 'Welcome',
      subtitle: 'Sign in to your parent portal',
      support: 'Use the email and password for your parent account.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          GateField(
            controller: _email,
            focusNode: _emailFocus,
            label: 'Email',
            icon: Icons.mail_rounded,
            accent: KjaColors.skyDeep,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.email],
            onSubmitted: (_) => _passwordFocus.requestFocus(),
          ),
          const SizedBox(height: 12),
          GateField(
            controller: _password,
            focusNode: _passwordFocus,
            label: 'Password',
            icon: Icons.lock_rounded,
            accent: KjaColors.rose,
            obscureText: _obscure,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.password],
            onSubmitted: (_) {
              if (!_busy) _submit();
            },
            trailing: IconButton(
              tooltip: _obscure ? 'Show password' : 'Hide password',
              onPressed: () {
                HapticFeedback.selectionClick();
                setState(() => _obscure = !_obscure);
              },
              icon: Icon(_obscure ? Icons.visibility_rounded : Icons.visibility_off_rounded, size: 22),
            ),
          ),
          if (notice != null) ...[
            const SizedBox(height: 14),
            _GateNotice(message: notice, tone: Tone.rose),
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
  final PortalController controller;

  @override
  Widget build(BuildContext context) {
    return GateScaffold(
      title: 'Not linked yet',
      subtitle: 'This login is not a parent account',
      support: 'Ask the school office to link your email as a guardian, then sign in again.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _GateNotice(
            message: 'We could not find children linked to this account.',
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

class GateBackdrop extends StatelessWidget {
  const GateBackdrop({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color(0xFF0C243C),
            Color(0xFF163A5F),
            Color(0xFF1E4D7B),
            Color(0xFFF4F7FB),
          ],
          stops: [0, 0.28, 0.48, 0.72],
        ),
      ),
      child: child,
    );
  }
}

class GateScaffold extends StatelessWidget {
  const GateScaffold({
    super.key,
    required this.title,
    required this.subtitle,
    required this.support,
    required this.child,
  });

  final String title;
  final String subtitle;
  final String support;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: GateBackdrop(
        child: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(22, 28, 22, 32),
                children: [
                  Column(
                    children: [
                      Container(
                        width: 118,
                        height: 118,
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.white,
                          border: Border.all(color: KjaColors.gold.withValues(alpha: 0.55), width: 2),
                          boxShadow: [
                            BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 28, offset: const Offset(0, 12)),
                          ],
                        ),
                        child: const SchoolMark(size: 106),
                      ),
                      const SizedBox(height: 20),
                      Text(
                        title,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 32,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.55,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        subtitle,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: KjaColors.gold.withValues(alpha: 0.95),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        support,
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.78), height: 1.45, fontSize: 14, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 28),
                      DecoratedBox(
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(22),
                          border: Border.all(color: const Color(0xFFF0F3F8)),
                          boxShadow: [
                            BoxShadow(color: KjaColors.navyDeep.withValues(alpha: 0.16), blurRadius: 28, offset: const Offset(0, 12)),
                          ],
                        ),
                        child: Padding(padding: const EdgeInsets.fromLTRB(18, 20, 18, 20), child: child),
                      ),
                    ],
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

class GateField extends StatelessWidget {
  const GateField({
    super.key,
    required this.controller,
    required this.focusNode,
    required this.label,
    required this.icon,
    required this.accent,
    this.hint,
    this.obscureText = false,
    this.keyboardType,
    this.textInputAction,
    this.autofillHints,
    this.trailing,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final String label;
  final String? hint;
  final IconData icon;
  final Color accent;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;
  final Widget? trailing;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      focusNode: focusNode,
      obscureText: obscureText,
      keyboardType: keyboardType,
      textInputAction: textInputAction,
      autofillHints: autofillHints,
      onSubmitted: onSubmitted,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: Icon(icon, color: accent),
        suffixIcon: trailing,
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
          ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
          : Text(label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
    );
  }
}

class _GateNotice extends StatelessWidget {
  const _GateNotice({required this.message, required this.tone});
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
          Expanded(child: Text(message, style: TextStyle(color: tone.ink, height: 1.35, fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}
