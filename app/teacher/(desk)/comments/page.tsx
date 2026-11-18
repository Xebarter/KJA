import { PageHeader } from "@/components/admin/PageHeader";
import { CommentsWorkspaceSwitch } from "@/components/academics/CommentsWorkspaceSwitch";
import { NurseryCommentsDesk, type NurseryCommentCard } from "@/components/academics/NurseryCommentsDesk";
import {
  PrimaryCommentsDesk,
  type PrimaryActivityCommentCard,
  type PrimaryClassCommentCard,
  type PrimaryCommentSubject,
  type PrimarySubjectCommentCard,
  type PrimarySubjectMark,
} from "@/components/academics/PrimaryCommentsDesk";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import {
  classSection,
  groupPupils,
  mapSubject,
  streamOf,
  subjectFits,
} from "@/lib/academics";
import { loadRoll } from "@/lib/academics-roll";
import { resolveNurseryClassTeacherComment } from "@/lib/nursery-class-comments";
import { resolvePrimaryComment } from "@/lib/primary-report-comments";
import { TEACHER_BASE } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";
import {
  saveTeacherNurseryComment,
  saveTeacherPrimaryActivityComment,
  saveTeacherPrimaryClassComment,
  saveTeacherPrimarySubjectComment,
} from "@/app/teacher/(desk)/comments/comments-actions";

export const metadata = { title: "Comments" };

type SearchParams = Promise<{ view?: string; class?: string; stream?: string }>;

const COMMENTS_BASE = `${TEACHER_BASE}/comments`;

export default async function TeacherCommentsPage({ searchParams }: { searchParams: SearchParams }) {
  const teacher = await requireTeacher();
  if ("error" in teacher) return <AcademicsGate title="Comments" state={{ notice: "auth", message: teacher.error }} />;
  if (teacher.termError) return <AcademicsGate title="Comments" state={{ notice: "schema", message: teacher.termError }} />;
  if (!teacher.classes.length) {
    return (
      <Empty icon="fa-quote-left" title="Not a class teacher">
        Comments are for the class you lead this term.
      </Empty>
    );
  }

  const params = await searchParams;
  const { supabase, user, term, classes } = teacher;
  const classCodes = [...new Set(classes.map((post) => post.classCode))];
  const campuses = [...new Set(classes.map((post) => post.campus))];
  const posts = new Set(classes.map((post) => `${post.campus}|${post.classCode}|${post.stream}`));

  const hasNursery = classes.some((post) => classSection(post.classCode) === "nursery");
  const hasPrimary = classes.some((post) => classSection(post.classCode) === "primary");
  const both = hasNursery && hasPrimary;

  let nurseryView = hasNursery && !hasPrimary;
  let primaryView = hasPrimary && !hasNursery;
  if (both) {
    if (params.view === "primary-comments") {
      primaryView = true;
      nurseryView = false;
    } else {
      nurseryView = true;
      primaryView = false;
    }
  }

  const pupilsAll = await loadRoll(supabase, user.id, classCodes, campuses);
  const minePupils = pupilsAll.filter((pupil) => {
    const campus = String(pupil.campus || "").trim() || "Kitante";
    return posts.has(`${campus}|${pupil.class_code}|${streamOf(pupil.stream)}`);
  });
  const groups = groupPupils(minePupils);

  if (primaryView) {
    const primaryGroups = groups.filter((group) => group.section === "primary");
    const primaryCodes = new Set([
      ...classes.filter((post) => classSection(post.classCode) === "primary").map((post) => post.classCode),
      ...primaryGroups.map((group) => group.code),
    ]);
    const primaryCodeList = [...primaryCodes];

    const [cardsQuery, classStoreQuery, subjectStoreQuery, activityStoreQuery, subjectsQuery] = await Promise.all([
      term && primaryCodeList.length
        ? supabase
            .from("report_cards")
            .select("id, student_id, status, class_code, stream, campus, class_teacher_comment")
            .eq("term_id", term.id)
            .in("class_code", primaryCodeList)
        : Promise.resolve({ data: [], error: null }),
      term && primaryCodeList.length
        ? supabase
            .from("primary_class_comments")
            .select("student_id, comment, class_code, stream, campus")
            .eq("term_id", term.id)
            .in("class_code", primaryCodeList)
        : Promise.resolve({ data: [], error: null }),
      term && primaryCodeList.length
        ? supabase
            .from("primary_subject_comments")
            .select("student_id, subject_id, comment, class_code, stream")
            .eq("term_id", term.id)
            .in("class_code", primaryCodeList)
        : Promise.resolve({ data: [], error: null }),
      term && primaryCodeList.length
        ? supabase
            .from("primary_activity_comments")
            .select("student_id, slot, subject_id, activity_name, comment, class_code, stream")
            .eq("term_id", term.id)
            .in("class_code", primaryCodeList)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("subjects").select("*").eq("active", true).order("sort_order"),
    ]);

    for (const query of [cardsQuery, classStoreQuery, subjectStoreQuery, activityStoreQuery, subjectsQuery]) {
      if (query.error) {
        return <AcademicsGate title="Primary Comments" state={{ notice: "schema", message: query.error.message }} />;
      }
    }

    const subjects: PrimaryCommentSubject[] = ((subjectsQuery.data || []) as Record<string, unknown>[])
      .map(mapSubject)
      .filter((subject) => [...primaryCodes].some((code) => subjectFits(subject, code)))
      .map((subject) => ({
        id: subject.id,
        name: subject.name,
        kind: subject.kind,
        section: subject.section,
        applies_from: subject.applies_from,
        applies_to: subject.applies_to,
        sort_order: subject.sort_order,
        active: subject.active,
      }));

    const cardByStudent = new Map(
      ((cardsQuery.data || []) as {
        id: string;
        student_id: string;
        status: string;
        class_code: string | null;
        stream: string | null;
        campus: string | null;
        class_teacher_comment: string | null;
      }[])
        .filter((card) => {
          if (!card.class_code || !primaryCodes.has(card.class_code)) return false;
          const campus = String(card.campus || "").trim() || "Kitante";
          return posts.has(`${campus}|${card.class_code}|${streamOf(card.stream)}`);
        })
        .map((card) => [card.student_id, card]),
    );
    const classStoreByStudent = new Map(
      ((classStoreQuery.data || []) as {
        student_id: string;
        comment: string | null;
        class_code: string | null;
        stream: string | null;
        campus: string | null;
      }[]).map((row) => [row.student_id, row]),
    );

    const classCards: PrimaryClassCommentCard[] = [];
    const seenClass = new Set<string>();
    for (const group of primaryGroups) {
      for (const pupil of group.pupils) {
        if (seenClass.has(pupil.id)) continue;
        seenClass.add(pupil.id);
        const store = classStoreByStudent.get(pupil.id);
        const card = cardByStudent.get(pupil.id);
        classCards.push({
          student_id: pupil.id,
          comment: resolvePrimaryComment(store?.comment, card?.class_teacher_comment),
          class_code: pupil.class_code || store?.class_code || group.code,
          stream: pupil.stream ?? store?.stream ?? group.stream,
          campus: pupil.campus || store?.campus || null,
          report_card_id: card?.id ?? null,
          status: card?.status ?? "",
        });
      }
    }
    for (const [studentId, store] of classStoreByStudent) {
      if (seenClass.has(studentId)) continue;
      if (!store.class_code || !primaryCodes.has(store.class_code)) continue;
      const campus = String(store.campus || "").trim() || "Kitante";
      if (!posts.has(`${campus}|${store.class_code}|${streamOf(store.stream)}`)) continue;
      const card = cardByStudent.get(studentId);
      seenClass.add(studentId);
      classCards.push({
        student_id: studentId,
        comment: resolvePrimaryComment(store.comment, card?.class_teacher_comment),
        class_code: store.class_code,
        stream: store.stream || "",
        campus: store.campus,
        report_card_id: card?.id ?? null,
        status: card?.status ?? "",
      });
    }

    const subjectCards: PrimarySubjectCommentCard[] = ((subjectStoreQuery.data || []) as {
      student_id: string;
      subject_id: string;
      comment: string | null;
    }[]).map((row) => ({
      student_id: row.student_id,
      subject_id: row.subject_id,
      comment: resolvePrimaryComment(row.comment, null),
    }));

    const cardIds = [...cardByStudent.values()].map((card) => card.id);
    const cardIdToStudent = new Map([...cardByStudent.entries()].map(([studentId, card]) => [card.id, studentId]));
    const subjectSeen = new Set(subjectCards.map((card) => `${card.student_id}|${card.subject_id}`));
    const subjectMarks: PrimarySubjectMark[] = [];
    const markSeen = new Set<string>();
    for (let index = 0; index < cardIds.length; index += 80) {
      const slice = cardIds.slice(index, index + 80);
      const lines = await supabase
        .from("report_lines")
        .select("report_card_id, subject_id, teacher_comment, score, grade, points, position")
        .in("report_card_id", slice);
      if (lines.error) {
        return <AcademicsGate title="Primary Comments" state={{ notice: "schema", message: lines.error.message }} />;
      }
      for (const line of (lines.data || []) as {
        report_card_id: string;
        subject_id: string;
        teacher_comment: string | null;
        score: number | null;
        grade: string | null;
        points: number | null;
        position: number | null;
      }[]) {
        const studentId = cardIdToStudent.get(line.report_card_id);
        if (!studentId) continue;
        const key = `${studentId}|${line.subject_id}`;
        if (!markSeen.has(key)) {
          markSeen.add(key);
          subjectMarks.push({
            student_id: studentId,
            subject_id: line.subject_id,
            score: line.score == null ? null : Number(line.score),
            grade: line.grade,
            points: line.points == null ? null : Number(line.points),
            position: line.position == null ? null : Number(line.position),
          });
        }
        const existing = subjectCards.find((card) => card.student_id === studentId && card.subject_id === line.subject_id);
        if (existing) {
          existing.comment = resolvePrimaryComment(existing.comment, line.teacher_comment);
          continue;
        }
        if (!resolvePrimaryComment(null, line.teacher_comment)) continue;
        if (subjectSeen.has(key)) continue;
        subjectSeen.add(key);
        subjectCards.push({
          student_id: studentId,
          subject_id: line.subject_id,
          comment: resolvePrimaryComment(null, line.teacher_comment),
        });
      }
    }

    const activityCards: PrimaryActivityCommentCard[] = ((activityStoreQuery.data || []) as {
      student_id: string;
      slot: number;
      subject_id: string | null;
      activity_name: string | null;
      comment: string | null;
    }[]).map((row) => ({
      student_id: row.student_id,
      slot: row.slot,
      subject_id: row.subject_id,
      activity_name: row.activity_name,
      comment: resolvePrimaryComment(row.comment, null),
    }));
    const activitySeen = new Set(activityCards.map((card) => `${card.student_id}|${card.slot}`));
    for (let index = 0; index < cardIds.length; index += 80) {
      const slice = cardIds.slice(index, index + 80);
      const activities = await supabase
        .from("report_card_activities")
        .select("report_card_id, slot, subject_id, activity_name, comment")
        .in("report_card_id", slice);
      if (activities.error) {
        return <AcademicsGate title="Primary Comments" state={{ notice: "schema", message: activities.error.message }} />;
      }
      for (const row of (activities.data || []) as {
        report_card_id: string;
        slot: number;
        subject_id: string | null;
        activity_name: string | null;
        comment: string | null;
      }[]) {
        const studentId = cardIdToStudent.get(row.report_card_id);
        if (!studentId) continue;
        const key = `${studentId}|${row.slot}`;
        const existing = activityCards.find((card) => card.student_id === studentId && card.slot === row.slot);
        if (existing) {
          existing.comment = resolvePrimaryComment(existing.comment, row.comment);
          if (!existing.subject_id && row.subject_id) existing.subject_id = row.subject_id;
          if (!existing.activity_name && row.activity_name) existing.activity_name = row.activity_name;
          continue;
        }
        if (!resolvePrimaryComment(null, row.comment)) continue;
        if (activitySeen.has(key)) continue;
        activitySeen.add(key);
        activityCards.push({
          student_id: studentId,
          slot: row.slot,
          subject_id: row.subject_id,
          activity_name: row.activity_name,
          comment: resolvePrimaryComment(null, row.comment),
        });
      }
    }

    return (
      <div className="app-page ofc-page cmt-page ncm-page tch-cmt-page">
        <PageHeader
          kicker="Comments"
          icon="fa-chalkboard-user"
          title="Primary Comments"
          description={
            term ? (
              <>
                Class teacher, subject, and other-subject remarks · <strong>{term.label}</strong>
              </>
            ) : (
              "Class teacher, subject, and other-subject remarks — saved before report cards are prepared."
            )
          }
        />
        <CommentsWorkspaceSwitch
          active="primary-comments"
          classCode={params.class || null}
          stream={params.stream === "-" ? "" : params.stream || null}
          base={COMMENTS_BASE}
          showBank={false}
          showNursery={hasNursery}
          showPrimary={hasPrimary}
        />
        <PrimaryCommentsDesk
          termLabel={term?.label ?? null}
          termId={term?.id ?? null}
          groups={primaryGroups}
          classCards={classCards}
          subjectCards={subjectCards}
          activityCards={activityCards}
          subjectMarks={subjectMarks}
          subjects={subjects}
          commentsBase={COMMENTS_BASE}
          closeHref={both ? `${COMMENTS_BASE}?view=primary-comments` : COMMENTS_BASE}
          viewParam={both ? "primary-comments" : null}
          saveClassComment={saveTeacherPrimaryClassComment}
          saveSubjectComment={saveTeacherPrimarySubjectComment}
          saveActivityComment={saveTeacherPrimaryActivityComment}
        />
      </div>
    );
  }

  const nurseryGroups = groups.filter((group) => group.section === "nursery");
  const nurseryCodes = new Set([
    ...classes.filter((post) => classSection(post.classCode) === "nursery").map((post) => post.classCode),
    ...nurseryGroups.map((group) => group.code),
  ]);
  const nurseryCodeList = [...nurseryCodes];

  const [cardsQuery, storeQuery] = await Promise.all([
    term && nurseryCodeList.length
      ? supabase
          .from("report_cards")
          .select("id, student_id, status, class_code, stream, class_teacher_comment")
          .eq("term_id", term.id)
          .in("class_code", nurseryCodeList)
      : Promise.resolve({ data: [], error: null }),
    term && nurseryCodeList.length
      ? supabase
          .from("nursery_class_comments")
          .select("student_id, comment, class_code, stream, campus")
          .eq("term_id", term.id)
          .in("class_code", nurseryCodeList)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (cardsQuery.error) {
    return <AcademicsGate title="Nursery Comments" state={{ notice: "schema", message: cardsQuery.error.message }} />;
  }
  if (storeQuery.error) {
    return <AcademicsGate title="Nursery Comments" state={{ notice: "schema", message: storeQuery.error.message }} />;
  }

  const cardByStudent = new Map(
    ((cardsQuery.data || []) as {
      id: string;
      student_id: string;
      status: string;
      class_code: string | null;
      stream: string | null;
      class_teacher_comment: string | null;
    }[])
      .filter((card) => card.class_code && nurseryCodes.has(card.class_code))
      .map((card) => [card.student_id, card]),
  );
  const storeByStudent = new Map(
    ((storeQuery.data || []) as {
      student_id: string;
      comment: string | null;
      class_code: string | null;
      stream: string | null;
      campus: string | null;
    }[]).map((row) => [row.student_id, row]),
  );

  const cards: NurseryCommentCard[] = [];
  const seen = new Set<string>();
  for (const group of nurseryGroups) {
    for (const pupil of group.pupils) {
      if (seen.has(pupil.id)) continue;
      seen.add(pupil.id);
      const store = storeByStudent.get(pupil.id);
      const card = cardByStudent.get(pupil.id);
      cards.push({
        student_id: pupil.id,
        comment: resolveNurseryClassTeacherComment(store?.comment, card?.class_teacher_comment),
        class_code: pupil.class_code || store?.class_code || group.code,
        stream: pupil.stream ?? store?.stream ?? group.stream,
        campus: pupil.campus || store?.campus || null,
        report_card_id: card?.id ?? null,
        status: card?.status ?? "",
      });
    }
  }
  for (const [studentId, store] of storeByStudent) {
    if (seen.has(studentId)) continue;
    if (!store.class_code || !nurseryCodes.has(store.class_code)) continue;
    const campus = String(store.campus || "").trim() || "Kitante";
    if (!posts.has(`${campus}|${store.class_code}|${streamOf(store.stream)}`)) continue;
    const card = cardByStudent.get(studentId);
    seen.add(studentId);
    cards.push({
      student_id: studentId,
      comment: resolveNurseryClassTeacherComment(store.comment, card?.class_teacher_comment),
      class_code: store.class_code,
      stream: store.stream || "",
      campus: store.campus,
      report_card_id: card?.id ?? null,
      status: card?.status ?? "",
    });
  }
  for (const [studentId, card] of cardByStudent) {
    if (seen.has(studentId)) continue;
    if (!card.class_code || !nurseryCodes.has(card.class_code)) continue;
    if (!resolveNurseryClassTeacherComment(null, card.class_teacher_comment)) continue;
    cards.push({
      student_id: studentId,
      comment: resolveNurseryClassTeacherComment(null, card.class_teacher_comment),
      class_code: card.class_code,
      stream: card.stream || "",
      campus: null,
      report_card_id: card.id,
      status: card.status ?? "",
    });
  }

  return (
    <div className="app-page ofc-page cmt-page ncm-page tch-cmt-page">
      <PageHeader
        kicker="Comments"
        icon="fa-seedling"
        title="Nursery Comments"
        description={
          term ? (
            <>
              Class teacher remarks for nursery learners · <strong>{term.label}</strong>
            </>
          ) : (
            "Class teacher remarks for nursery learners — saved before report cards are prepared."
          )
        }
      />
      <CommentsWorkspaceSwitch
        active="nursery-comments"
        classCode={params.class || null}
        stream={params.stream === "-" ? "" : params.stream || null}
        base={COMMENTS_BASE}
        showBank={false}
        showNursery={hasNursery}
        showPrimary={hasPrimary}
      />
      <NurseryCommentsDesk
        termLabel={term?.label ?? null}
        termId={term?.id ?? null}
        groups={nurseryGroups}
        cards={cards}
        commentsBase={COMMENTS_BASE}
        closeHref={both ? `${COMMENTS_BASE}?view=nursery-comments` : COMMENTS_BASE}
        viewParam={both ? "nursery-comments" : null}
        allowImport={false}
        saveComment={saveTeacherNurseryComment}
      />
    </div>
  );
}
