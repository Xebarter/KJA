import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kja_teachers/app.dart';
import 'package:kja_teachers/config.dart';
import 'package:kja_teachers/models.dart';
import 'package:kja_teachers/models_json.dart';
import 'package:kja_teachers/pupil_photos.dart';
import 'package:kja_teachers/data/teacher_repository.dart';
import 'package:kja_teachers/screens/markbook_page.dart';
import 'package:kja_teachers/screens/shell.dart';
import 'package:kja_teachers/state/teacher_controller.dart';
import 'package:kja_teachers/theme.dart';
import 'package:kja_teachers/widgets/ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

TeacherSnapshot _desk({required bool classTeacher, bool locked = false}) {
  return TeacherSnapshot(
    unavailable: false,
    mustResetPassword: locked,
    staff: const StaffProfile(
      id: 'staff',
      fullName: 'Amina Nambi',
      email: 'amina@kja.ug',
    ),
    term: const TermInfo(id: 'term', label: 'Term 1 2026'),
    classes: classTeacher
        ? const [
            ClassPost(classCode: 'P4', stream: 'A', label: 'Primary Four A'),
          ]
        : const [],
    subjects: const [
      SubjectPost(
        classCode: 'P4',
        stream: 'A',
        subjectId: 'math',
        subjectName: 'Mathematics',
        label: 'Primary Four A · Mathematics',
      ),
    ],
    pupils: const [],
    papers: const [],
    scores: const [],
    homework: const [],
    resources: const [],
    marks: const [],
    closures: const [],
    dates: const [],
    notices: const [],
    threads: const [],
    bands: const [],
    today: '2026-10-25',
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
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
    expect(config.url, 'https://example.supabase.co');
  });

  test('the browser desk loads pupil photos from the local school app', () {
    AppConfig.siteUrl = 'https://kja.ug';
    expect(photoSiteBase(web: true, pageHost: 'localhost'), 'http://127.0.0.1:3000');
    expect(photoSiteBase(web: false, pageHost: 'localhost'), 'https://kja.ug');
    AppConfig.siteUrl = 'https://school.example';
    expect(photoSiteBase(web: true, pageHost: 'localhost'), 'https://school.example');
  });

  testWidgets('setup screen shows when the school connection is missing', (
    tester,
  ) async {
    final controller = TeacherController();
    await tester.pumpWidget(KjaTeachersApp(controller: controller));
    await controller.boot();
    await tester.pumpAndSettle();
    expect(find.text('Connect this app to your school'), findsOneWidget);
    expect(find.text('KJA Teachers'), findsWidgets);
  });

  testWidgets(
    'dock is Resources, Home and Chat, and class tools stay in the menu',
    (tester) async {
      final controller = TeacherController()
        ..installSnapshot(_desk(classTeacher: true));
      await tester.pumpWidget(
        MaterialApp(
          theme: buildKjaTheme(),
          home: TeacherShell(controller: controller),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.descendant(
          of: find.byType(TeacherDock),
          matching: find.text('Resources'),
        ),
        findsOneWidget,
      );
      expect(find.text('Home'), findsWidgets);
      expect(find.text('Chat'), findsOneWidget);

      await tester.tap(find.byTooltip('Open menu'));
      await tester.pumpAndSettle();
      expect(
        find.descendant(
          of: find.byType(TeacherMenu),
          matching: find.text('Attendance'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byType(TeacherMenu),
          matching: find.text('Calendar'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byType(TeacherMenu),
          matching: find.text('Notices'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byType(TeacherMenu),
          matching: find.text('Assessments'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byType(TeacherMenu),
          matching: find.text('Profile'),
        ),
        findsOneWidget,
      );
    },
  );

  testWidgets('a subject teacher does not see class tools in the menu', (
    tester,
  ) async {
    final controller = TeacherController()
      ..installSnapshot(_desk(classTeacher: false));
    await tester.pumpWidget(
      MaterialApp(
        theme: buildKjaTheme(),
        home: TeacherShell(controller: controller),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Open menu'));
    await tester.pumpAndSettle();
    expect(find.text('Attendance'), findsNothing);
    expect(find.text('Calendar'), findsNothing);
    expect(find.text('Notices'), findsNothing);
    expect(find.text('Assessments'), findsOneWidget);
    expect(find.text('Chat'), findsOneWidget);
  });

  testWidgets('a password reset hides the dock and leaves only Profile', (
    tester,
  ) async {
    final controller = TeacherController()
      ..installSnapshot(_desk(classTeacher: true, locked: true));
    await tester.pumpWidget(
      MaterialApp(
        theme: buildKjaTheme(),
        home: TeacherShell(controller: controller),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Resources'), findsNothing);
    expect(find.text('Chat'), findsNothing);
    await tester.tap(find.byTooltip('Open menu'));
    await tester.pumpAndSettle();
    expect(find.text('Profile'), findsWidgets);
    expect(find.text('Assessments'), findsNothing);
    expect(find.text('Attendance'), findsNothing);
  });

  testWidgets('mark entry scores one pupil at a time, then submits the sheet', (
    tester,
  ) async {
    final repo = _MarkRepo();
    final controller = TeacherController(repository: repo);
    final desk = _markDesk();
    repo.desk = desk;
    controller.installSnapshot(desk);

    await tester.pumpWidget(
      MaterialApp(
        theme: buildKjaTheme(),
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute<void>(
                    builder: (_) =>
                        MarkbookPage(controller: controller, paperId: 'paper'),
                  ),
                );
              },
              child: const Text('Open paper'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open paper'));
    await tester.pumpAndSettle();

    expect(find.text('Asha Kato'), findsOneWidget);
    expect(find.text('AK'), findsOneWidget);
    expect(find.text('1 of 2'), findsOneWidget);
    expect(
      find.text('Mathematics · Weekly test · out of 100'),
      findsOneWidget,
    );
    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.keyboardType.decimal, isTrue);
    expect(find.text('Next'), findsOneWidget);
    expect(tester.getSize(find.widgetWithText(FilledButton, 'Next')).height, greaterThanOrEqualTo(56));
    expect(tester.getSize(find.widgetWithText(OutlinedButton, 'Back')).height, greaterThanOrEqualTo(56));

    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('Enter a mark, or mark missed.'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '18');
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('Ben Okello'), findsOneWidget);
    expect(find.text('2 of 2'), findsOneWidget);
    expect(find.text('Finish'), findsOneWidget);

    await tester.tap(find.text('Back'));
    await tester.pumpAndSettle();
    expect(find.text('Asha Kato'), findsOneWidget);
    expect(find.text('18'), findsOneWidget);

    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Missed'));
    await tester.pumpAndSettle();
    expect(find.byType(TextField), findsNothing);
    await tester.tap(find.text('Finish'));
    await tester.pumpAndSettle();

    expect(find.text('Marksheet'), findsOneWidget);
    expect(find.text('18'), findsOneWidget);
    expect(find.text('Missed'), findsOneWidget);
    expect(find.text('Submit marks'), findsOneWidget);

    await tester.tap(find.text('Asha Kato'));
    await tester.pumpAndSettle();
    expect(find.text('1 of 2'), findsOneWidget);

    await tester.tap(find.text('Sheet'));
    await tester.pumpAndSettle();
    expect(find.text('Submit marks'), findsOneWidget);
    expect(find.text('18'), findsOneWidget);
    expect(find.text('Missed'), findsWidgets);
    expect(controller.snapshot!.papers.single.open, isTrue);

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Open paper'), findsOneWidget);
  });

  testWidgets('a blank pupil stays on the sheet and blocks submit', (
    tester,
  ) async {
    final controller = TeacherController()..installSnapshot(_markDesk());
    await tester.pumpWidget(
      MaterialApp(
        theme: buildKjaTheme(),
        home: MarkbookPage(controller: controller, paperId: 'paper'),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sheet'));
    await tester.pumpAndSettle();
    expect(find.text('—'), findsNWidgets(2));
    expect(find.text('Every pupil needs a mark or Missed.'), findsOneWidget);
    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Submit marks'),
    );
    expect(button.onPressed, isNull);
  });

  testWidgets('nursery cards use band buttons and a locked paper is review only', (
    tester,
  ) async {
    final controller = TeacherController()..installSnapshot(_nurseryDesk());
    await tester.pumpWidget(
      MaterialApp(
        theme: buildKjaTheme(),
        home: MarkbookPage(controller: controller, paperId: 'nursery-paper'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Exceeding'), findsOneWidget);
    expect(find.text('Secure'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    await tester.tap(find.text('Secure'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Finish'));
    await tester.pumpAndSettle();
    expect(find.text('Secure'), findsOneWidget);
    expect(find.text('Submit marks'), findsOneWidget);

    controller.installSnapshot(_markDesk(status: 'submitted'));
    await tester.pumpWidget(
      MaterialApp(
        theme: buildKjaTheme(),
        home: MarkbookPage(controller: controller, paperId: 'paper'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Marksheet'), findsOneWidget);
    expect(find.text('Next'), findsNothing);
    expect(
      find.text('This markbook is locked. The academics office can unlock it.'),
      findsOneWidget,
    );
    expect(find.text('Submit marks'), findsNothing);
  });
}

class _MarkRepo extends TeacherRepository {
  TeacherSnapshot? desk;
  int saves = 0;
  bool submitted = false;
  List<Map<String, dynamic>> rows = const [];

  @override
  Future<void> saveMarks({
    required TeacherSnapshot snapshot,
    required Paper paper,
    required List<Map<String, dynamic>> rows,
    required bool submit,
  }) async {
    saves += 1;
    submitted = submit;
    this.rows = rows;
    final scores = [
      for (final row in rows)
        Score(
          assessmentId: paper.id,
          studentId: '${row['student_id']}',
          score: row['score'] == null
              ? null
              : (row['score'] is num
                    ? (row['score'] as num).toDouble()
                    : double.tryParse('${row['score']}')),
          missed: row['missed'] == true,
        ),
    ];
    final current = desk;
    if (current == null) return;
    desk = current.copyWith(
      scores: [
        for (final row in current.scores)
          if (row.assessmentId != paper.id) row,
        ...scores,
      ],
      papers: [
        for (final row in current.papers)
          if (row.id == paper.id && submit)
            Paper(
              id: row.id,
              name: row.name,
              classCode: row.classCode,
              stream: row.stream,
              subjectId: row.subjectId,
              subjectName: row.subjectName,
              kind: row.kind,
              maxScore: row.maxScore,
              status: 'submitted',
              heldOn: row.heldOn,
            )
          else
            row,
      ],
    );
  }

  @override
  Future<TeacherSnapshot> load() async => desk!;
}

TeacherSnapshot _markDesk({String status = 'open'}) {
  return TeacherSnapshot(
    unavailable: false,
    mustResetPassword: false,
    staff: const StaffProfile(id: 'staff', fullName: 'Amina Nambi'),
    classes: const [],
    subjects: const [
      SubjectPost(
        classCode: 'P4',
        stream: 'A',
        subjectId: 'math',
        subjectName: 'Mathematics',
        label: 'Primary Four A · Mathematics',
      ),
    ],
    pupils: const [
      Pupil(
        id: 'asha',
        fullName: 'Asha Kato',
        classCode: 'P4',
        stream: 'A',
        photoPath: 'photos/asha.jpg',
      ),
      Pupil(
        id: 'ben',
        fullName: 'Ben Okello',
        classCode: 'P4',
        stream: 'A',
      ),
    ],
    papers: [
      Paper(
        id: 'paper',
        name: 'Weekly test',
        classCode: 'P4',
        stream: 'A',
        subjectId: 'math',
        subjectName: 'Mathematics',
        kind: 'test',
        maxScore: 100,
        status: status,
      ),
    ],
    scores: const [],
    homework: const [],
    resources: const [],
    marks: const [],
    closures: const [],
    dates: const [],
    notices: const [],
    threads: const [],
    bands: const [],
    today: '2026-10-25',
  );
}

TeacherSnapshot _nurseryDesk() {
  return TeacherSnapshot(
    unavailable: false,
    mustResetPassword: false,
    staff: const StaffProfile(id: 'staff', fullName: 'Amina Nambi'),
    classes: const [],
    subjects: const [
      SubjectPost(
        classCode: 'RC',
        stream: '',
        subjectId: 'num',
        subjectName: 'Numeracy',
        label: 'Reception Class · Numeracy',
      ),
    ],
    pupils: const [
      Pupil(
        id: 'lia',
        fullName: 'Lia Namu',
        classCode: 'RC',
        stream: '',
      ),
    ],
    papers: const [
      Paper(
        id: 'nursery-paper',
        name: 'Play assessment',
        classCode: 'RC',
        stream: '',
        subjectId: 'num',
        subjectName: 'Numeracy',
        kind: 'test',
        maxScore: 100,
        status: 'open',
      ),
    ],
    scores: const [],
    homework: const [],
    resources: const [],
    marks: const [],
    closures: const [],
    dates: const [],
    notices: const [],
    threads: const [],
    bands: const [],
    today: '2026-10-25',
  );
}
