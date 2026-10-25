import '../models.dart';

PortalSnapshot samplePortal() {
  const aisha = ParentChild(
    id: 'sample-aisha',
    fullName: 'Aisha Nambi',
    campus: 'Main',
    classCode: 'P4',
    stream: 'Blue',
    grade: 'P4 Blue',
    studentCode: 'KJA-24012',
    status: 'active',
    feeOutstanding: 350000,
    reportCount: 1,
    clubCount: 1,
  );
  const joel = ParentChild(
    id: 'sample-joel',
    fullName: 'Joel Okello',
    campus: 'Main',
    classCode: 'P2',
    stream: 'Green',
    grade: 'P2 Green',
    studentCode: 'KJA-24108',
    status: 'active',
    feeOutstanding: 0,
    reportCount: 1,
    clubCount: 0,
  );

  return PortalSnapshot(
    displayName: 'Grace Nakato',
    email: 'grace@example.com',
    preview: true,
    familyId: 'sample-family',
    profile: const ParentProfile(
      id: 'sample-parent',
      role: 'parent',
      fullName: 'Grace Nakato',
      email: 'grace@example.com',
      phone: '0700123456',
      address: 'Kampala',
    ),
    children: const [aisha, joel],
    fees: const [
      FeeBalance(
        id: 'sample-aisha:term',
        childId: 'sample-aisha',
        term: 'Term 1 2026',
        amountDue: 850000,
        amountPaid: 500000,
        dueOn: '2026-04-15',
      ),
      FeeBalance(
        id: 'sample-joel:term',
        childId: 'sample-joel',
        term: 'Term 1 2026',
        amountDue: 850000,
        amountPaid: 850000,
        dueOn: '2026-04-15',
      ),
    ],
    receipts: const [
      FeeReceipt(
        id: 'r1',
        childId: 'sample-joel',
        receiptNo: 'RCP-1042',
        amount: 850000,
        paidOn: '2026-02-10',
        method: 'Mobile money',
      ),
    ],
    reports: const [
      PublishedReport(
        id: 'rep1',
        studentId: 'sample-aisha',
        pupilName: 'Aisha Nambi',
        term: 'Term 3 2025',
        classLabel: 'P4 Blue',
        publishedAt: '2025-12-05',
      ),
      PublishedReport(
        id: 'rep2',
        studentId: 'sample-joel',
        pupilName: 'Joel Okello',
        term: 'Term 3 2025',
        classLabel: 'P2 Green',
        publishedAt: '2025-12-05',
      ),
    ],
    messages: [
      ParentMessage(
        id: 'm1',
        subject: 'School fees',
        body: 'Please confirm the balance for Aisha this term.',
        direction: 'out',
        read: true,
        createdAt: DateTime.now().toUtc().subtract(const Duration(days: 2)).toIso8601String(),
        threadId: 'thread-fees',
      ),
      ParentMessage(
        id: 'm2',
        subject: 'School fees',
        body: 'Aisha has UGX 350,000 outstanding for Term 1. You can pay on the fees page.',
        direction: 'in',
        read: false,
        createdAt: DateTime.now().toUtc().subtract(const Duration(days: 1)).toIso8601String(),
        threadId: 'thread-fees',
      ),
    ],
    notices: [
      Notice(
        id: 'n1',
        title: 'Parent consultation day',
        body: 'Meet class teachers on Friday afternoon.',
        read: false,
        createdAt: DateTime.now().toUtc().subtract(const Duration(hours: 8)).toIso8601String(),
        href: '/account/calendar',
      ),
      Notice(
        id: 'n2',
        title: 'Report cards published',
        body: 'Term 3 reports are ready to view.',
        read: true,
        createdAt: DateTime.now().toUtc().subtract(const Duration(days: 20)).toIso8601String(),
        href: '/account/reports',
      ),
    ],
    clubs: const [
      ClubOffer(
        id: 'club1',
        title: 'Football',
        campus: 'Main',
        meeting: 'Wed 3:30pm',
        description: 'Skills and friendly matches.',
      ),
      ClubOffer(
        id: 'club2',
        title: 'Choir',
        campus: 'Main',
        meeting: 'Tue 3:30pm',
      ),
    ],
    consents: const [
      ClubConsent(id: 'c1', clubId: 'club1', studentId: 'sample-aisha'),
    ],
    applications: const [
      ApplicationItem(
        id: 'app1',
        childName: 'Maria Nakato',
        status: 'under_review',
        createdAt: '2026-01-12',
        campus: 'Main',
        grade: 'Baby Class',
      ),
    ],
    events: const [
      SchoolEvent(
        id: 'e1',
        title: 'Sports day',
        startsOn: '2026-05-08',
        summary: 'Whole-school sports on the main field.',
        location: 'Main campus',
      ),
      SchoolEvent(
        id: 'e2',
        title: 'End of term',
        startsOn: '2026-05-22',
        summary: 'Reports and closing assembly.',
      ),
    ],
  );
}
