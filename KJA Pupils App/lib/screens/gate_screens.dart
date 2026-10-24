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
  late final AnimationController _enter = AnimationController(vsync: this, duration: const Duration(milliseconds: 720))
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
      backgroundColor: const Color(0xFFFFFBF6),
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFFFFBF6), Color(0xFFF4F8FB), Color(0xFFEAF3F8)],
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
                  SizedBox(height: 18),
                  Text(
                    'KJA Pupils',
                    style: TextStyle(
                      color: KjaColors.ink,
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.4,
                      height: 1,
                    ),
                  ),
                  SizedBox(height: 6),
                  Text(
                    'Kampala Junior Academy',
                    style: TextStyle(color: KjaColors.soft, fontWeight: FontWeight.w600, fontSize: 14, height: 1.2),
                  ),
                  SizedBox(height: 28),
                  SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2, color: KjaColors.navy),
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
      title: 'KJA Pupils',
      subtitle: 'Connect this app to your school',
      support: 'Paste the project URL and anon key from the school website setup.',
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
      subtitle: 'Sign in to your pupil portal',
      support: 'Use the email and password from the academics office.',
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
              style: IconButton.styleFrom(
                foregroundColor: KjaColors.mute,
                hoverColor: KjaColors.roseWash,
                highlightColor: KjaColors.roseWash,
              ),
              icon: AnimatedSwitcher(
                duration: const Duration(milliseconds: 180),
                transitionBuilder: (child, animation) => ScaleTransition(scale: animation, child: child),
                child: Icon(
                  _obscure ? Icons.visibility_rounded : Icons.visibility_off_rounded,
                  key: ValueKey(_obscure),
                  size: 22,
                ),
              ),
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

/// Soft primary-school wash behind every gate screen.
class GateBackdrop extends StatelessWidget {
  const GateBackdrop({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
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
      child: Stack(
        children: [
          Positioned(top: -60, right: -40, child: _Blob(color: KjaColors.sun.withValues(alpha: 0.18), size: 180)),
          Positioned(top: 120, left: -70, child: _Blob(color: KjaColors.mint.withValues(alpha: 0.16), size: 160)),
          Positioned(bottom: 80, right: -50, child: _Blob(color: KjaColors.sky.withValues(alpha: 0.16), size: 200)),
          Positioned(bottom: -40, left: 40, child: _Blob(color: KjaColors.rose.withValues(alpha: 0.12), size: 140)),
          child,
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
                  TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0, end: 1),
                    duration: const Duration(milliseconds: 520),
                    curve: Curves.easeOutCubic,
                    builder: (context, value, animatedChild) {
                      return Opacity(
                        opacity: value,
                        child: Transform.translate(
                          offset: Offset(0, (1 - value) * 16),
                          child: animatedChild,
                        ),
                      );
                    },
                    child: Column(
                      children: [
                        const SchoolMark(size: 128),
                        const SizedBox(height: 18),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.78),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: KjaColors.gold.withValues(alpha: 0.45)),
                          ),
                          child: const Text(
                            'Kampala Junior Academy',
                            style: TextStyle(
                              color: KjaColors.navy,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.2,
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          title,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 34,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.6,
                            height: 1.1,
                            color: KjaColors.ink,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          subtitle,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            color: KjaColors.navy,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          support,
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: KjaColors.soft, height: 1.4, fontSize: 14),
                        ),
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
                              BoxShadow(
                                color: KjaColors.rose.withValues(alpha: 0.04),
                                blurRadius: 18,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(18, 22, 18, 22),
                            child: child,
                          ),
                        ),
                        const SizedBox(height: 18),
                        const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            _AccentDot(color: KjaColors.rose),
                            SizedBox(width: 8),
                            _AccentDot(color: KjaColors.sun),
                            SizedBox(width: 8),
                            _AccentDot(color: KjaColors.mint),
                            SizedBox(width: 8),
                            _AccentDot(color: KjaColors.sky),
                          ],
                        ),
                      ],
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

class GateField extends StatefulWidget {
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
  State<GateField> createState() => _GateFieldState();
}

class _GateFieldState extends State<GateField> {
  @override
  void initState() {
    super.initState();
    widget.focusNode.addListener(_onFocus);
  }

  @override
  void didUpdateWidget(covariant GateField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.focusNode != widget.focusNode) {
      oldWidget.focusNode.removeListener(_onFocus);
      widget.focusNode.addListener(_onFocus);
    }
  }

  @override
  void dispose() {
    widget.focusNode.removeListener(_onFocus);
    super.dispose();
  }

  void _onFocus() => setState(() {});

  @override
  Widget build(BuildContext context) {
    final focused = widget.focusNode.hasFocus;
    final wash = Color.alphaBlend(widget.accent.withValues(alpha: 0.10), Colors.white);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      decoration: BoxDecoration(
        color: focused ? wash : const Color(0xFFF7F9FC),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: focused ? widget.accent.withValues(alpha: 0.55) : const Color(0xFFE7EDF5),
          width: focused ? 1.6 : 1,
        ),
        boxShadow: focused
            ? [
                BoxShadow(
                  color: widget.accent.withValues(alpha: 0.14),
                  blurRadius: 16,
                  offset: const Offset(0, 6),
                ),
              ]
            : null,
      ),
      child: TextField(
        controller: widget.controller,
        focusNode: widget.focusNode,
        obscureText: widget.obscureText,
        keyboardType: widget.keyboardType,
        textInputAction: widget.textInputAction,
        autofillHints: widget.autofillHints,
        autocorrect: false,
        cursorColor: widget.accent,
        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: KjaColors.ink, height: 1.25),
        onSubmitted: widget.onSubmitted,
        decoration: InputDecoration(
          labelText: widget.label,
          hintText: widget.hint,
          floatingLabelBehavior: FloatingLabelBehavior.auto,
          labelStyle: TextStyle(
            color: focused ? widget.accent : KjaColors.mute,
            fontWeight: FontWeight.w600,
          ),
          floatingLabelStyle: TextStyle(color: widget.accent, fontWeight: FontWeight.w700),
          filled: true,
          fillColor: Colors.transparent,
          contentPadding: const EdgeInsets.fromLTRB(4, 18, 12, 16),
          prefixIcon: Padding(
            padding: const EdgeInsets.only(left: 10, right: 6),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOutCubic,
              width: 38,
              height: 38,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: focused ? widget.accent.withValues(alpha: 0.14) : Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: focused ? widget.accent.withValues(alpha: 0.28) : const Color(0xFFE7EDF5),
                ),
              ),
              child: Icon(widget.icon, size: 20, color: focused ? widget.accent : KjaColors.soft),
            ),
          ),
          prefixIconConstraints: const BoxConstraints(minWidth: 54, minHeight: 48),
          suffixIcon: widget.trailing,
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
        ),
      ),
    );
  }
}

class GatePrimaryButton extends StatefulWidget {
  const GatePrimaryButton({
    super.key,
    required this.label,
    required this.color,
    required this.onPressed,
    this.busy = false,
  });

  final String label;
  final Color color;
  final VoidCallback? onPressed;
  final bool busy;

  @override
  State<GatePrimaryButton> createState() => _GatePrimaryButtonState();
}

class _GatePrimaryButtonState extends State<GatePrimaryButton> {
  var _pressed = false;

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onPressed != null && !widget.busy;
    return AnimatedScale(
      scale: _pressed && enabled ? 0.985 : 1,
      duration: const Duration(milliseconds: 120),
      curve: Curves.easeOutCubic,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: enabled
              ? () {
                  HapticFeedback.lightImpact();
                  widget.onPressed?.call();
                }
              : null,
          onHighlightChanged: (value) => setState(() => _pressed = value),
          borderRadius: BorderRadius.circular(18),
          child: Ink(
            height: 56,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: enabled
                    ? [widget.color, Color.lerp(widget.color, Colors.black, 0.12)!]
                    : [widget.color.withValues(alpha: 0.45), widget.color.withValues(alpha: 0.35)],
              ),
              boxShadow: enabled
                  ? [
                      BoxShadow(
                        color: widget.color.withValues(alpha: 0.32),
                        blurRadius: 18,
                        offset: const Offset(0, 8),
                      ),
                    ]
                  : null,
            ),
            child: Center(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: widget.busy
                    ? const SizedBox(
                        key: ValueKey('busy'),
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                      )
                    : Text(
                        widget.label,
                        key: ValueKey(widget.label),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.1,
                        ),
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Blob extends StatelessWidget {
  const _Blob({required this.color, required this.size});

  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(shape: BoxShape.circle, color: color),
      ),
    );
  }
}

class _AccentDot extends StatelessWidget {
  const _AccentDot({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 8,
      height: 8,
      decoration: BoxDecoration(shape: BoxShape.circle, color: color),
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
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: tone.wash,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: tone.ink.withValues(alpha: 0.18)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline_rounded, size: 18, color: tone.ink),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(color: tone.ink, fontWeight: FontWeight.w600, height: 1.35),
            ),
          ),
        ],
      ),
    );
  }
}
