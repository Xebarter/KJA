"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { checkChargePayment, payCharge } from "@/app/account/(portal)/charges/actions";
import { ugx } from "@/lib/accounts-format";

type Kid = { id: string; full_name: string; class_code?: string | null; campus?: string | null };
type Product = {
  id: string;
  name: string;
  kind: string;
  default_amount: number;
  description: string | null;
};

const KIND_ICON: Record<string, string> = {
  ple: "fa-pen-to-square",
  tour: "fa-bus",
  admission: "fa-file-signature",
  other: "fa-receipt",
};

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

export function ChargesView({
  kids,
  products,
  payerPhone,
  online,
}: {
  kids: Kid[];
  products: Product[];
  payerPhone: string;
  online: boolean;
}) {
  const [productId, setProductId] = useState(products[0]?.id || "");
  const [studentId, setStudentId] = useState(kids[0]?.id || "");
  const [phone, setPhone] = useState(payerPhone);
  const [amount, setAmount] = useState(products[0]?.default_amount ? String(products[0].default_amount) : "");
  const [message, setMessage] = useState<{ tone: "ok" | "err" | "wait"; text: string } | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const product = useMemo(() => products.find((row) => row.id === productId) || null, [products, productId]);
  const needsChild = product ? product.kind !== "other" : true;
  const selectedKid = kids.find((kid) => kid.id === studentId) || null;

  useEffect(() => {
    if (!product) return;
    if (product.default_amount > 0) setAmount(String(product.default_amount));
  }, [product]);

  useEffect(() => {
    if (!paymentId) return;
    let live = true;
    const timer = window.setInterval(() => {
      checkChargePayment(paymentId).then((result) => {
        if (!live || "error" in result) return;
        if (result.payment.status === "paid") {
          setMessage({ tone: "ok", text: `Paid. Receipt ${result.payment.receiptNo || "saved"}.` });
          setPaymentId(null);
        } else if (result.payment.status === "failed") {
          setMessage({ tone: "err", text: "The payment did not go through. You can try again." });
          setPaymentId(null);
        }
      }).catch(() => undefined);
    }, 4000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [paymentId]);

  if (!products.length) {
    return (
      <div className="ov chg">
        <section className="ch-hero chg-hero">
          <div className="ch-hero-copy">
            <p className="ch-kicker">Payments</p>
            <h1>Other school payments</h1>
            <p>There are no online school charges open right now. You can still pay at the accounts office.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="ov chg">
      <section className="ch-hero chg-hero">
        <div className="ch-hero-copy">
          <p className="ch-kicker">Payments</p>
          <h1>Other school payments</h1>
          <p>Pay PLE registration, study tours and other school charges by mobile money. School fees and clubs stay on their own pages.</p>
        </div>
        <dl className="ch-hero-stats">
          <div>
            <dt>Available</dt>
            <dd>{products.length}</dd>
          </div>
          <div>
            <dt>Children</dt>
            <dd>{kids.length || "—"}</dd>
          </div>
        </dl>
      </section>

      {!online ? (
        <div className="chg-banner is-warn" role="status">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <p>Online payment is temporarily unavailable. Please pay at the accounts office.</p>
        </div>
      ) : null}

      <section className="chg-panel">
        <header className="chg-panel-head">
          <div>
            <p className="chg-label">Choose a charge</p>
            <h2>What are you paying for?</h2>
          </div>
        </header>

        <div className="chg-product-grid" role="radiogroup" aria-label="Charge type">
          {products.map((row) => {
            const on = productId === row.id;
            return (
              <button
                key={row.id}
                type="button"
                className={`chg-product${on ? " is-on" : ""} is-${row.kind}`}
                aria-pressed={on}
                onClick={() => setProductId(row.id)}
              >
                <span className="chg-product-ico" aria-hidden="true">
                  <i className={`fa-solid ${KIND_ICON[row.kind] || "fa-receipt"}`} />
                </span>
                <span className="chg-product-copy">
                  <strong>{row.name}</strong>
                  <small>{row.description || (row.default_amount ? ugx(row.default_amount) : "Enter an amount")}</small>
                </span>
                {on ? <i className="fa-solid fa-circle-check chg-product-check" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>

        <form
          className="chg-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!online) return;
            const form = new FormData(event.currentTarget);
            form.set("product_id", productId);
            setMessage({ tone: "wait", text: "Sending a prompt to your phone…" });
            start(async () => {
              const result = await payCharge(form);
              if ("error" in result) {
                setMessage({ tone: "err", text: result.error || "Could not start payment." });
                setPaymentId(null);
                return;
              }
              setPaymentId(result.payment.id);
              setMessage({
                tone: "wait",
                text: `Approve the ${result.payment.network} prompt on ${result.payment.phone} for ${ugx(result.payment.amount)}.`,
              });
            });
          }}
        >
          <input type="hidden" name="product_id" value={productId} />

          {needsChild ? (
            <div className="chg-field">
              <span className="chg-field-label">Child</span>
              {kids.length > 1 ? (
                <div className="chg-kids" role="radiogroup" aria-label="Child">
                  {kids.map((kid) => {
                    const on = studentId === kid.id;
                    return (
                      <label key={kid.id} className={`chg-kid${on ? " is-on" : ""}`}>
                        <input
                          type="radio"
                          name="student_id"
                          value={kid.id}
                          checked={on}
                          onChange={() => setStudentId(kid.id)}
                          required={needsChild}
                        />
                        <span>
                          <strong>{firstName(kid.full_name)}</strong>
                          <small>{kid.class_code || kid.campus || "Pupil"}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <>
                  <input type="hidden" name="student_id" value={studentId} />
                  <p className="chg-single-kid">
                    <i className="fa-solid fa-child" aria-hidden="true" />
                    {selectedKid?.full_name || "Your child"}
                    {selectedKid?.class_code ? ` · ${selectedKid.class_code}` : ""}
                  </p>
                </>
              )}
            </div>
          ) : null}

          <div className="chg-fields">
            <label className="chg-field">
              <span className="chg-field-label">Amount (UGX)</span>
              <input
                name="amount"
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))}
                required
                placeholder="0"
              />
            </label>
            <label className="chg-field">
              <span className="chg-field-label">Mobile money number</span>
              <input name="phone" value={phone} onChange={(event) => setPhone(event.target.value)} required placeholder="07…" />
            </label>
          </div>

          {message ? (
            <p className={`chg-msg is-${message.tone}`} role="status">
              <i
                className={`fa-solid ${message.tone === "ok" ? "fa-circle-check" : message.tone === "err" ? "fa-circle-exclamation" : "fa-mobile-screen-button"}`}
                aria-hidden="true"
              />
              {message.text}
            </p>
          ) : null}

          <button type="submit" className="chg-submit" disabled={pending || !online || !productId}>
            <i className={`fa-solid ${pending ? "fa-circle-notch fa-spin" : "fa-mobile-screen-button"}`} aria-hidden="true" />
            {pending ? "Starting…" : "Pay with mobile money"}
          </button>
        </form>
      </section>
    </div>
  );
}
