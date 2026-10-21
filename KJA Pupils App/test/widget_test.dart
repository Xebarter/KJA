import 'package:flutter_test/flutter_test.dart';
import 'package:kja_pupils/app.dart';
import 'package:kja_pupils/config.dart';
import 'package:kja_pupils/state/portal_controller.dart';
import 'package:kja_pupils/widgets/ui.dart';
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
    await tester.pumpWidget(KjaPupilsApp(controller: controller));
    await controller.boot();
    await tester.pump();
    expect(find.text('Connect this app to your school'), findsOneWidget);
    expect(find.text('KJA Pupils'), findsWidgets);
    expect(find.byType(SchoolMark), findsOneWidget);
  });

  testWidgets('preview mode opens homework, home and chart', (tester) async {
    final controller = PortalController();
    await tester.pumpWidget(KjaPupilsApp(controller: controller));
    await controller.boot();
    await tester.pump();

    await controller.enterPreview();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byType(PupilDock), findsOneWidget);
    expect(find.textContaining('Amina'), findsWidgets);

    await tester.tap(find.descendant(of: find.byType(PupilDock), matching: find.text('Homework')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Fractions practice, page 42'), findsOneWidget);

    await tester.tap(find.descendant(of: find.byType(PupilDock), matching: find.text('Chat')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Class chat'), findsOneWidget);
    expect(find.text('Classmates'), findsOneWidget);
  });
}
