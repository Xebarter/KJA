import { ActionForm } from "@/components/account/ActionForm";
import { removeChild, saveChild } from "@/app/account/actions";
import { getPortal } from "@/lib/portal";

const campuses = ["Kitante", "Najjanankumbi", "Makindye", "Bunga"];

export default async function ChildrenPage() {
  const { children } = await getPortal();
  return (
    <div>
      <div className="account-title">
        <div>
          <h1>Children</h1>
          <p>Keep each child&apos;s details current so reports, fees and clubs stay in the right place.</p>
        </div>
      </div>
      <div className="account-list">
        {children.map((child) => (
          <article className="account-card" key={child.id}>
            <h2>{child.full_name}</h2>
            <p>{[child.campus, child.grade, child.student_code].filter(Boolean).join(" · ") || "Details to be completed"}</p>
            <ActionForm action={saveChild}>
              <input type="hidden" name="id" value={child.id} />
              <label>Name<input name="full_name" defaultValue={child.full_name} required /></label>
              <label>Campus
                <select name="campus" defaultValue={child.campus || ""}>
                  <option value="">Select campus</option>
                  {campuses.map((campus) => <option key={campus}>{campus}</option>)}
                </select>
              </label>
              <label>Class / grade<input name="grade" defaultValue={child.grade || ""} /></label>
              <label>Date of birth<input name="date_of_birth" type="date" defaultValue={child.date_of_birth || ""} /></label>
              <label>Student number<input name="student_code" defaultValue={child.student_code || ""} /></label>
              <button className="account-btn" type="submit">Save</button>
            </ActionForm>
            <ActionForm action={removeChild} className="account-form" success="">
              <input type="hidden" name="id" value={child.id} />
              <button className="account-btn account-btn-ghost" type="submit">Remove</button>
            </ActionForm>
          </article>
        ))}
        <article className="account-card">
          <h2>Add a child</h2>
          <ActionForm action={saveChild} success="Child added.">
            <label>Name<input name="full_name" required /></label>
            <label>Campus
              <select name="campus">
                <option value="">Select campus</option>
                {campuses.map((campus) => <option key={campus}>{campus}</option>)}
              </select>
            </label>
            <label>Class / grade<input name="grade" /></label>
            <label>Date of birth<input name="date_of_birth" type="date" /></label>
            <label>Student number<input name="student_code" /></label>
            <button className="account-btn" type="submit">Add child</button>
          </ActionForm>
        </article>
      </div>
    </div>
  );
}
