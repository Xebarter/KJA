import 'package:flutter_test/flutter_test.dart';
import 'package:kja_teachers/data/teacher_repository.dart';
import 'package:kja_teachers/models.dart';
import 'package:kja_teachers/models_json.dart';
import 'package:kja_teachers/state/teacher_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Repo extends TeacherRepository {
  TeacherSnapshot? desk;
  var saves = 0;

  @override
  Future<void> saveMarks({
    required TeacherSnapshot snapshot,
    required Paper paper,
    required List<Map<String, dynamic>> rows,
    required bool submit,
  }) async {
    saves += 1;
    final current = desk!;
    desk = current.copyWith(
      scores: [
        for (final row in rows)
          Score(
            assessmentId: paper.id,
            studentId: '${row['student_id']}',
            score: row['score'] == null ? null : (row['score'] as num).toDouble(),
            missed: row['missed'] == true,
          ),
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

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('mark drafts stay on the desk until submit', () async {
    final repo = _Repo();
    final desk = TeacherSnapshot(
      unavailable: false,
      mustResetPassword: false,
      staff: const StaffProfile(id: 'staff', fullName: 'Amina'),
      classes: const [],
      subjects: const [
        SubjectPost(
          classCode: 'P4',
          stream: 'A',
          subjectId: 'math',
          subjectName: 'Mathematics',
          label: 'P4 A Math',
        ),
      ],
      pupils: const [
        Pupil(id: 'asha', fullName: 'Asha', classCode: 'P4', stream: 'A'),
        Pupil(id: 'ben', fullName: 'Ben', classCode: 'P4', stream: 'A'),
      ],
      papers: const [
        Paper(
          id: 'paper',
          name: 'Test',
          classCode: 'P4',
          stream: 'A',
          subjectId: 'math',
          subjectName: 'Mathematics',
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
    repo.desk = desk;
    final controller = TeacherController(repository: repo)..installSnapshot(desk);
    final paper = desk.papers.single;

    await controller.saveMarkDraft(
      paper: paper,
      rows: [
        {
          'assessment_id': 'paper',
          'student_id': 'asha',
          'score': 18,
          'missed': false,
        },
      ],
    );
    expect(controller.snapshot!.scoreFor('paper', 'asha')?.score, 18);
    expect(controller.snapshot!.papers.single.open, isTrue);

    await controller.saveMarks(
      paper: paper,
      rows: [
        {
          'assessment_id': 'paper',
          'student_id': 'asha',
          'score': 18,
          'missed': false,
        },
        {
          'assessment_id': 'paper',
          'student_id': 'ben',
          'score': null,
          'missed': true,
        },
      ],
      submit: true,
    );
    expect(repo.saves, greaterThanOrEqualTo(1));
    expect(controller.snapshot!.papers.single.status, 'submitted');
  });

  test('a teacher snapshot round-trips through JSON', () {
    final desk = TeacherSnapshot(
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
        Pupil(id: 'asha', fullName: 'Asha Kato', classCode: 'P4', stream: 'A'),
      ],
      papers: const [
        Paper(
          id: 'paper',
          name: 'Weekly test',
          classCode: 'P4',
          stream: 'A',
          subjectId: 'math',
          subjectName: 'Mathematics',
          kind: 'test',
          maxScore: 100,
          status: 'open',
        ),
      ],
      scores: const [
        Score(assessmentId: 'paper', studentId: 'asha', score: 18, missed: false),
      ],
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

    final copy = TeacherSnapshotJson.fromJson(desk.toJson());
    expect(copy.staff.fullName, 'Amina Nambi');
    expect(copy.pupils.single.fullName, 'Asha Kato');
    expect(copy.scoreFor('paper', 'asha')?.score, 18);
    expect(copy.papers.single.open, isTrue);
  });
}
