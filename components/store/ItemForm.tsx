"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ProcessStatus } from "@/components/ProcessStatus";
import { saveItem } from "@/app/store/(desk)/actions";

type Category = { id: string; name: string };
type Editing = {
  id: string;
  name: string;
  category_id: string | null;
  unit: string;
  reorder_level: number;
  qty_on_hand: number;
  unit_price: number;
  notes: string;
  active: boolean;
};

export function ItemForm({
  categories,
  editing = null,
  defaultReorder = 5,
}: {
  categories: Category[];
  editing?: Editing | null;
  defaultReorder?: number;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; ok?: string } | null>(null);
  const isEdit = Boolean(editing);

  return (
    <form
      ref={formRef}
      className="store-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        setResult(null);
        startTransition(async () => {
          const outcome = await saveItem(data).catch(() => ({ error: "Something went wrong. Try again." }));
          if ("href" in outcome && outcome.href) {
            router.push(outcome.href);
            router.refresh();
            return;
          }
          if ("error" in outcome && outcome.error) {
            setResult({ error: outcome.error });
            return;
          }
          setResult({ ok: ("ok" in outcome && outcome.ok) || "Saved." });
          if (!isEdit) {
            form.reset();
            const unit = form.elements.namedItem("unit") as HTMLInputElement | null;
            const reorder = form.elements.namedItem("reorder_level") as HTMLInputElement | null;
            const present = form.elements.namedItem("qty_on_hand") as HTMLInputElement | null;
            const price = form.elements.namedItem("unit_price") as HTMLInputElement | null;
            if (unit) unit.value = "pcs";
            if (reorder) reorder.value = String(defaultReorder);
            if (present) present.value = "0";
            if (price) price.value = "0";
            nameRef.current?.focus();
          }
          router.refresh();
        });
      }}
    >
      <fieldset disabled={pending}>
        {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
        <div className="store-fields">
          <label className="span-2">
            Name
            <input
              ref={nameRef}
              name="name"
              required
              defaultValue={editing?.name || ""}
              placeholder="Item name"
              autoComplete="off"
            />
          </label>
          <label>
            Category
            <select name="category_id" defaultValue={editing?.category_id || ""}>
              <option value="">Uncategorised</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Unit
            <input name="unit" defaultValue={editing?.unit || "pcs"} />
          </label>
          <label>
            Reorder level
            <input
              name="reorder_level"
              type="number"
              min="0"
              step="any"
              defaultValue={editing?.reorder_level ?? defaultReorder}
              required
            />
          </label>
          <label>
            Units present
            <input
              name="qty_on_hand"
              type="number"
              min="0"
              step="any"
              defaultValue={editing?.qty_on_hand ?? 0}
              required
            />
          </label>
          <label>
            Unit price
            <input
              name="unit_price"
              type="number"
              min="0"
              step="any"
              defaultValue={editing?.unit_price ?? 0}
              required
            />
          </label>
          <label className="span-2">
            Notes
            <textarea name="notes" defaultValue={editing?.notes || ""} />
          </label>
          {editing ? (
            <label>
              Active
              <select name="active" defaultValue={editing.active ? "1" : "0"}>
                <option value="1">Yes</option>
                <option value="0">No</option>
              </select>
            </label>
          ) : (
            <input type="hidden" name="active" value="1" />
          )}
        </div>
        <div className="store-actions" style={{ marginTop: "0.85rem" }}>
          <button className="store-btn is-gold" type="submit">
            {isEdit ? "Save item" : "Add item"}
          </button>
        </div>
      </fieldset>
      {result?.error ? (
        <p className="acd-feedback is-error" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {result.error}
        </p>
      ) : null}
      {result?.ok ? (
        <p className="acd-feedback" role="status">
          <i className="fa-solid fa-circle-check" aria-hidden="true" /> {result.ok}
        </p>
      ) : null}
      <ProcessStatus active={pending} label={isEdit ? "Saving" : "Adding item"} />
    </form>
  );
}
