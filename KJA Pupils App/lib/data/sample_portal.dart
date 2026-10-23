import '../format.dart';
import '../models.dart';

/// In-memory threads for the sample pupil, so chat works without a school connection.
final sampleThreads = <String, List<ChatMessage>>{};

PortalSnapshot samplePortal() {
  final today = todayYmd();
  final yesterday = addDaysYmd(today, -1);
  final tomorrow = addDaysYmd(today, 1);
  final inThree = addDaysYmd(today, 3);
  final inSix = addDaysYmd(today, 6);
  final weekday = kampalaWeekday();

  const pupil = Pupil(
    id: 'sample-amina',
    fullName: 'Amina Nakato',
    preferredName: 'Amina',
    classCode: 'P4',
    stream: 'A',
    campus: 'Kitante',
    studentNumber: 'KJA-1042',
    status: 'active',
    house: 'Blue',
    sex: 'F',
  );

  const classmates = [
    Classmate(id: 'c1', fullName: 'David Okello', preferredName: 'David', house: 'Blue'),
    Classmate(id: 'c2', fullName: 'Sara Namuli', preferredName: 'Sara', house: 'Red'),
    Classmate(id: 'c3', fullName: 'Joel Kato', house: 'Green'),
    Classmate(id: 'c4', fullName: 'Grace Achieng', preferredName: 'Grace', house: 'Gold'),
    Classmate(id: 'c5', fullName: 'Peter Ssemakula', house: 'Blue'),
    Classmate(id: 'c6', fullName: 'Lydia Nansubuga', preferredName: 'Lydia', house: 'Red'),
  ];

  final homework = [
    HomeworkItem(
      id: 'hw-1',
      title: 'Fractions practice, page 42',
      instructions: 'Do questions 1 to 8. Show your working in your exercise book.',
      dueOn: tomorrow,
      subjectName: 'Mathematics',
      done: false,
    ),
    HomeworkItem(
      id: 'hw-2',
      title: 'Read the market story',
      instructions: 'Read pages 12–16 and write three sentences about what happened.',
      dueOn: yesterday,
      subjectName: 'English',
      done: false,
    ),
    HomeworkItem(
      id: 'hw-3',
      title: 'Parts of a plant',
      instructions: 'Draw a plant and label the root, stem, leaf and flower.',
      dueOn: inThree,
      subjectName: 'Science',
      done: false,
    ),
    HomeworkItem(
      id: 'hw-4',
      title: 'Spelling list 6',
      instructions: 'Learn the ten words and write each one in a sentence.',
      dueOn: addDaysYmd(today, -4),
      subjectName: 'English',
      done: true,
      doneAt: addDaysYmd(today, -3),
    ),
  ];

  final timetable = <Lesson>[
    for (final day in [1, 2, 3, 4, 5]) ...[
      Lesson(id: 'l$day-1', weekday: day, period: 1, startsAt: '08:00', endsAt: '08:40', subjectName: 'Mathematics', room: 'P4A', teacherName: 'Mr Kato'),
      Lesson(id: 'l$day-2', weekday: day, period: 2, startsAt: '08:40', endsAt: '09:20', subjectName: day.isEven ? 'English' : 'Science', room: 'P4A'),
      Lesson(id: 'l$day-3', weekday: day, period: 3, startsAt: '09:40', endsAt: '10:20', subjectName: 'Literacy', room: 'P4A'),
      Lesson(id: 'l$day-4', weekday: day, period: 4, startsAt: '10:20', endsAt: '11:00', subjectName: day == 5 ? 'Physical education' : 'Social studies', room: day == 5 ? 'Field' : 'P4A'),
      Lesson(id: 'l$day-5', weekday: day, period: 5, startsAt: '11:20', endsAt: '12:00', subjectName: day == 3 ? 'Creative arts' : 'Religious education', room: 'P4A'),
    ],
  ];

  final lessonsToday = weekday >= 1 && weekday <= 5
      ? timetable.where((lesson) => lesson.weekday == weekday).toList()
      : <Lesson>[];

  final attendanceDays = <AttendanceDay>[
    for (var i = 1; i <= 12; i++)
      AttendanceDay(
        attendedOn: addDaysYmd(today, -i),
        status: i == 2 ? 'late' : (i == 8 ? 'absent' : (i == 11 ? 'excused' : 'present')),
      ),
  ];

  final notices = [
    Notice(
      id: 'n1',
      title: 'Sports day is this Friday',
      body: 'Wear your house colours and bring a water bottle. We meet on the field after break.',
      href: '/student/calendar',
      kind: 'school',
      read: false,
      createdAt: '${addDaysYmd(today, -1)}T08:00:00Z',
    ),
    Notice(
      id: 'n2',
      title: 'New mathematics homework',
      body: 'Fractions practice is waiting in Homework.',
      href: '/student/homework',
      kind: 'homework',
      read: false,
      createdAt: '${today}T06:30:00Z',
    ),
    Notice(
      id: 'n3',
      title: 'Library books are due',
      body: 'Please return borrowed storybooks to the library by Thursday.',
      kind: 'school',
      read: true,
      createdAt: '${addDaysYmd(today, -5)}T09:00:00Z',
    ),
  ];

  final groupId = 'conv-class';
  final dmId = 'conv-david';
  final now = DateTime.now().toUtc();
  sampleThreads[groupId] = [
    ChatMessage(
      id: 'm1',
      conversationId: groupId,
      senderStudentId: 'c2',
      body: 'Did everyone bring a colouring pencil for art?',
      flagged: false,
      createdAt: now.subtract(const Duration(hours: 5)),
    ),
    ChatMessage(
      id: 'm2',
      conversationId: groupId,
      senderStudentId: pupil.id,
      body: 'I have blue and green. I can share.',
      flagged: false,
      createdAt: now.subtract(const Duration(hours: 4, minutes: 40)),
    ),
  ];
  sampleThreads[dmId] = [
    ChatMessage(
      id: 'm3',
      conversationId: dmId,
      senderStudentId: 'c1',
      body: 'Can you remind me which maths questions are due tomorrow?',
      flagged: false,
      createdAt: now.subtract(const Duration(hours: 2)),
    ),
  ];

  return PortalSnapshot(
    displayName: pupil.displayName,
    classLabel: pupil.classLabel,
    email: 'amina.nakato@pupils.kja.ac.ug',
    mustResetPassword: false,
    preview: true,
    pupil: pupil,
    termLabel: 'Term III',
    classTeacher: const Teacher(
      id: 't-class',
      fullName: 'Namubiru',
      title: 'Mrs',
      role: 'class',
    ),
    homework: homework,
    notices: notices,
    lessonsToday: lessonsToday,
    timetable: timetable,
    attendance: AttendanceSummary.fromDays(attendanceDays),
    clubs: const [
      ClubMembership(
        id: 'club-1',
        title: 'Choir',
        campus: 'Kitante',
        meeting: 'Tuesday, after lessons',
        description: 'Singing, rhythm and school assemblies.',
        paid: true,
      ),
      ClubMembership(
        id: 'club-2',
        title: 'Football',
        campus: 'Kitante',
        meeting: 'Thursday, 3:30',
        description: 'Skills, teamwork and friendly matches.',
        paid: false,
      ),
    ],
    teachers: const [
      Teacher(id: 't-math', fullName: 'Kato', title: 'Mr', subjectName: 'Mathematics', role: 'subject'),
      Teacher(id: 't-eng', fullName: 'Achen', title: 'Ms', subjectName: 'English', role: 'subject'),
      Teacher(id: 't-sci', fullName: 'Mugisha', title: 'Mr', subjectName: 'Science', role: 'subject'),
    ],
    classmates: classmates,
    academicDates: [
      AcademicDate(
        id: 'ad-1',
        title: 'Mathematics test',
        kind: 'exam',
        startsOn: inSix,
        note: 'Bring a pencil and ruler.',
      ),
      AcademicDate(
        id: 'ad-2',
        title: 'Reports go home',
        kind: 'reporting',
        startsOn: addDaysYmd(today, 18),
      ),
    ],
    events: [
      SchoolEvent(slug: 'sports-day', title: 'House sports day', startsOn: inThree, location: 'Kitante field'),
      SchoolEvent(slug: 'open-day', title: 'Family visiting morning', startsOn: addDaysYmd(today, 12), location: 'Kitante'),
    ],
    reports: [
      ReportCard(
        id: 'r-3',
        term: 'Term III',
        classLabel: 'P4 A',
        publishedAt: addDaysYmd(today, -20),
        overallScore: 81,
        overallPosition: 4,
        overallAggregate: 8,
        overallGrade: '1',
        classTeacherName: 'Mrs Namubiru',
        classTeacherComment: 'Amina is curious and kind. She explains her ideas clearly and helps her group.',
        headComment: 'A joyful term. Keep reading every evening.',
        conduct: 'Very good',
        daysPresent: 58,
        daysOpened: 62,
        lines: const [
          ReportLine(
            subjectName: 'Mathematics',
            score: 86,
            maxScore: 100,
            grade: 'D1',
            points: 1,
            position: 3,
            comment: 'Accurate and neat.',
            parts: [
              ReportPart(label: 'Midterm', share: 30, score: 24, sortOrder: 1),
              ReportPart(label: 'End of term', share: 70, score: 62, sortOrder: 2),
            ],
          ),
          ReportLine(subjectName: 'English', score: 78, maxScore: 100, grade: 'D2', points: 2, position: 6, comment: 'Lovely stories. Watch spelling.'),
          ReportLine(subjectName: 'Science', score: 82, maxScore: 100, grade: 'D1', points: 1, position: 5, comment: 'Asks thoughtful questions.'),
          ReportLine(subjectName: 'Social studies', score: 74, maxScore: 100, grade: 'D2', points: 2, position: 8, comment: 'Good recall of class topics.'),
        ],
      ),
      const ReportCard(
        id: 'r-2',
        term: 'Term II',
        classLabel: 'P4 A',
        publishedAt: '2026-08-01',
        overallScore: 74,
        overallGrade: '2',
        overallAggregate: 12,
        lines: [
          ReportLine(subjectName: 'Mathematics', score: 71, maxScore: 100, grade: 'D2'),
          ReportLine(subjectName: 'English', score: 76, maxScore: 100, grade: 'D2'),
          ReportLine(subjectName: 'Science', score: 70, maxScore: 100, grade: 'D2'),
          ReportLine(subjectName: 'Social studies', score: 68, maxScore: 100, grade: 'C3'),
        ],
      ),
    ],
    conversations: [
      Conversation(
        id: groupId,
        kind: 'class_group',
        title: 'P4 A group',
        lastBody: sampleThreads[groupId]!.last.body,
        lastAt: sampleThreads[groupId]!.last.createdAt,
        memberCount: classmates.length + 1,
      ),
      Conversation(
        id: dmId,
        kind: 'dm',
        title: 'David',
        peerId: 'c1',
        house: 'Blue',
        lastBody: sampleThreads[dmId]!.last.body,
        lastAt: sampleThreads[dmId]!.last.createdAt,
      ),
    ],
    resources: [
      ClassResource(
        id: 'res-1',
        kind: 'note',
        title: 'Fractions — remember the steps',
        body:
            '1. Make the bottoms the same.\n2. Add or subtract the tops.\n3. Simplify your answer.\n\nPractice pages 40–42 before tomorrow.',
        subjectName: 'Mathematics',
        teacherName: 'Mr Kato',
        publishedAt: DateTime.now().toUtc().subtract(const Duration(hours: 5)),
      ),
      ClassResource(
        id: 'res-2',
        kind: 'link',
        title: 'BBC Bitesize — plant parts',
        body: 'Watch the short video, then draw and label a flower.',
        linkUrl: 'https://www.bbc.co.uk/bitesize',
        subjectName: 'Science',
        teacherName: 'Mr Mugisha',
        publishedAt: DateTime.now().toUtc().subtract(const Duration(days: 1)),
      ),
      ClassResource(
        id: 'res-3',
        kind: 'file',
        title: 'Spelling list for the week',
        body: 'Learn these words for Friday’s quiz.',
        fileName: 'P4A-spellings.pdf',
        fileMime: 'application/pdf',
        subjectName: 'English',
        teacherName: 'Ms Achen',
        publishedAt: DateTime.now().toUtc().subtract(const Duration(days: 2)),
      ),
      ClassResource(
        id: 'res-4',
        kind: 'image',
        title: 'Map of Uganda — study this',
        body: 'Find Kampala, Lake Victoria and your home district.',
        subjectName: 'Social studies',
        teacherName: 'Mrs Namubiru',
        publishedAt: DateTime.now().toUtc().subtract(const Duration(days: 3)),
      ),
    ],
    unreadMessages: 2,
  );
}
