import { sendClassNotice } from "@/app/teacher/actions";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { NoticesDesk } from "@/components/teacher/NoticesDesk";
import { streamOf } from "@/lib/academics";
import { loadRoll } from "@/lib/academics-roll";
import { requireTeacher } from "@/lib/teacher-access";
import "./notices.css";

export const metadata = { title: "Notices" };

type Notice = {
  id: string;
  class_code: string;
  stream: string;
  title: string;
  body: string | null;
  created_at: string;
};

export default async function TeacherNoticesPage() {
  const teacher = await requireTeacher();
  if ("error" in teacher) return <AcademicsGate title="Notices" state={{ notice: "auth", message: teacher.error }} />;
  if (teacher.termError) return <AcademicsGate title="Notices" state={{ notice: "schema", message: teacher.termError }} />;
  if (!teacher.classes.length) {
    return (
      <Empty icon="fa-bell" title="Not a class teacher">
        Notices go to a class you lead, and show on the Pupils App notifications page.
      </Empty>
    );
  }
  if (!teacher.term) return <Empty icon="fa-bell" title="No current term" />;

  const [noticesQuery, pupils] = await Promise.all([
    teacher.supabase
      .from("class_notices")
      .select("id, class_code, stream, title, body, created_at")
      .eq("term_id", teacher.term.id)
      .order("created_at", { ascending: false })
      .limit(40),
    loadRoll(teacher.supabase, teacher.user.id),
  ]);

  const error = noticesQuery.error;
  const missing = Boolean(error && /class_notices|schema cache|does not exist/i.test(error.message));
  const notices = missing ? [] : ((noticesQuery.data || []) as Notice[]);
  const label = new Map(teacher.classes.map((post) => [`${post.classCode}|${post.stream}`, post.label]));

  const classes = teacher.classes.map((post) => {
    const count = pupils.filter(
      (pupil) => pupil.class_code === post.classCode && streamOf(pupil.stream) === post.stream,
    ).length;
    return {
      classCode: post.classCode,
      stream: post.stream,
      label: post.label,
      pupils: count,
    };
  });

  const rows = notices.map((notice) => {
    const classKey = `${notice.class_code}|${streamOf(notice.stream)}`;
    return {
      id: notice.id,
      classKey,
      classLabel: label.get(classKey) || notice.class_code,
      title: notice.title,
      body: notice.body,
      created_at: notice.created_at,
    };
  });

  return (
    <div className="app-page ofc-page tch-page tch-ntc-page">
      <PageHeader
        kicker="My class"
        icon="fa-bell"
        title="Notices"
        description={
          <>
            Send a short update to a class you lead. Pupils see it on the <strong>Notifications</strong> page of the Pupils App.
          </>
        }
      />
      {missing || error ? (
        <p className="admin-empty">
          {missing ? "Run supabase/0041_teacher_dashboard.sql before sending class notices." : error?.message}
        </p>
      ) : (
        <NoticesDesk
          classes={classes}
          notices={rows}
          termLabel={teacher.term.label}
          send={sendClassNotice}
        />
      )}
    </div>
  );
}
