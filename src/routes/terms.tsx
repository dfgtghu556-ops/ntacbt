/**
 * Terms of service — a real route, not a static file.
 *
 * Written to match what the product actually is. The clause that matters most
 * here is the one on question content: the papers are transcribed from public
 * exam data and are a practice aid, not an official NTA publication. Saying so
 * plainly is both the honest position and the one that avoids a claim we
 * cannot back.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — NTACBT" },
      {
        name: "description",
        content:
          "The terms you agree to when using NTACBT, including how practice content relates to the official exam.",
      },
    ],
  }),
  component: Terms,
});

const SECTION = "mt-8";
const H2 = "text-lg font-semibold";
const P = "mt-2 text-sm leading-relaxed text-muted-foreground";
const LI = "mt-1 text-sm leading-relaxed text-muted-foreground";

function Terms() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated 29 September 2026</p>

      <section className={SECTION}>
        <h2 className={H2}>What this is</h2>
        <p className={P}>
          NTACBT is a free practice tool for JEE Main and CBSE preparation. It runs on your device,
          keeps your progress in your browser, and works without an account. By using it you agree
          to the terms below.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Practice content is not the official exam</h2>
        <p className={P}>
          The previous-year questions are transcribed from public exam data and are provided as a
          practice aid. NTACBT is not affiliated with, endorsed by, or an official publication of
          the National Testing Agency, CBSE, or any examination board. Where a transcription
          disagrees with an official paper, the official paper is correct — please tell us so it can
          be fixed.
        </p>
        <p className={P}>
          Your predicted score on a practice paper is an estimate of how you would do on similar
          questions under similar conditions. It is not a prediction of your rank, your percentile,
          or your admission outcome, and it should not be read as one.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Your account and your data</h2>
        <p className={P}>
          You are responsible for keeping your account credentials private. Your practice data is
          yours; we do not sell it or share it with other students, teachers or institutes. The{" "}
          <a href="/privacy" className="text-primary underline">
            privacy policy
          </a>{" "}
          sets out exactly what is stored and where.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Fair use</h2>
        <p className={P}>
          Please do not attempt to break, overload, scrape at volume, or reverse-engineer the
          service, and please do not use it to cheat on a live examination. The last one is not a
          legal formality — using a practice tool to game a real exam is academic misconduct, and it
          would defeat the point of practising.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Availability</h2>
        <p className={P}>
          The core app runs on your device, so your progress is not lost if the site is briefly
          unavailable. We do not guarantee uninterrupted availability, and we may change or remove
          features. Where a feature is removed, data you can still export will remain readable.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>No warranty</h2>
        <p className={P}>
          The service is provided as is, without warranty of any kind. It is a study aid and is not
          a substitute for your own judgement, your teachers, or official examination material.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Liability</h2>
        <p className={P}>
          To the extent permitted by law, we are not liable for indirect or consequential loss
          arising from your use of the service. Nothing here limits liability that cannot be limited
          under applicable law.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Changes</h2>
        <p className={P}>
          These terms may change, and the date at the top will change with them. Continuing to use
          NTACBT after a change means you accept the updated terms.
        </p>
      </section>
    </div>
  );
}
