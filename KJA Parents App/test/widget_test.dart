import 'package:flutter_test/flutter_test.dart';
import 'package:kja_parents/app.dart';
import 'package:kja_parents/config.dart';
import 'package:kja_parents/state/portal_controller.dart';
import 'package:kja_parents/widgets/ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    AppConfig.loadForTest('');
  });

  test('production .env values are treated as ready', () async {
    AppConfig.loadForTest('''
SUPABASE_URL=https://example.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.examplekeyexamplekeyexamplekey
''');
    final config = await AppConfig.load();
    expect(config.isReady, isTrue);
    expect(config.url, startsWith('https://'));
  });

  testWidgets('setup screen shows when the school connection is missing', (tester) async {
    final controller = PortalController();
    await tester.pumpWidget(KjaParentsApp(controller: controller));
    await controller.boot();
    await tester.pumpAndSettle();
    expect(find.text('Connect this app to your school'), findsOneWidget);
    expect(find.text('KJA Parents'), findsWidgets);
    expect(find.byType(SchoolMark), findsOneWidget);
  });

  testWidgets('preview mode opens children, home and communications dock', (tester) async {
    final controller = PortalController();
    await tester.pumpWidget(KjaParentsApp(controller: controller));
    await controller.boot();
    await tester.pumpAndSettle();

    await controller.enterPreview();
    await tester.pumpAndSettle();

    expect(find.byType(ParentDock), findsOneWidget);
    expect(find.textContaining('Grace'), findsWidgets);

    await tester.tap(find.descendant(of: find.byType(ParentDock), matching: find.text('Children')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Aisha Nambi'), findsWidgets);

    await tester.tap(find.descendant(of: find.byType(ParentDock), matching: find.text('Comms')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Communications'), findsWidgets);
  });
}
