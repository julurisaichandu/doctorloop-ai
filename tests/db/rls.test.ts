import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Applies the real migration to an in-process Postgres (PGlite) with a Supabase-like bootstrap
 * (roles, auth.users stub, auth.uid()) and verifies the row-level security rules of
 * docs/ARCHITECTURE.md section 5 by impersonating users the way PostgREST does.
 */

const MIGRATION = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261113000000_doctorloop_init.sql"),
  "utf8",
);

const PRIVACY_MIGRATION = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261114000000_privacy_filter.sql"),
  "utf8",
);

const BILLING_MIGRATION = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261114100000_billing.sql"),
  "utf8",
);

const BOOTSTRAP = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
  $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const U = {
  maya: id(1),
  daniel: id(2),
  park: id(3),
  bell: id(4),
};
const P = { maya: id(11), daniel: id(12) };
const E = {
  mayaPending: id(21),
  mayaApproved: id(22),
  mayaRejected: id(23),
  danielApproved: id(24),
  danielPending: id(25),
};
const OBS = {
  mayaApprovedActive: id(31),
  mayaApprovedRemoved: id(32),
  mayaPendingActive: id(33),
  danielApprovedActive: id(34),
};
const REF = { mayaApproved: id(41), mayaPending: id(42) };
const VS = id(51);

let db: PGlite;

/** Runs `sql` as an authenticated user (role + JWT claims set locally, like PostgREST). */
async function asUser<T extends Record<string, unknown> = Record<string, unknown>>(
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    const result = await tx.query<T>(sql, params);
    return result.rows;
  });
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

beforeAll(async () => {
  db = new PGlite();
  await db.exec(BOOTSTRAP);
  await db.exec(MIGRATION);
  await db.exec(PRIVACY_MIGRATION);
  await db.exec(BILLING_MIGRATION);

  await db.exec(`
    insert into auth.users (id) values ('${U.maya}'), ('${U.daniel}'), ('${U.park}'), ('${U.bell}');
    insert into public.profiles (id, role, full_name, email, title) values
      ('${U.maya}', 'patient', 'Maya Thompson', 'maya@example.com', null),
      ('${U.daniel}', 'patient', 'Daniel Okafor', 'daniel@example.com', null),
      ('${U.park}', 'doctor', 'Dr. Elena Park', 'park@example.com', 'Post-operative Care'),
      ('${U.bell}', 'doctor', 'Dr. Marcus Bell', 'bell@example.com', 'General Surgery');
    insert into public.patient_profiles (id, user_id, full_name, procedure, procedure_date, recovery_stage) values
      ('${P.maya}', '${U.maya}', 'Maya Thompson', 'Knee procedure', '2026-10-26', 'Week 3'),
      ('${P.daniel}', '${U.daniel}', 'Daniel Okafor', 'Hip procedure', '2026-10-09', 'Week 5');
    insert into public.care_assignments (doctor_id, patient_id) values
      ('${U.park}', '${P.maya}'), ('${U.park}', '${P.daniel}');

    insert into public.source_references (id, patient_id, provider, mode) values
      ('${REF.mayaApproved}', '${P.maya}', 'vexo', 'mock'),
      ('${REF.mayaPending}', '${P.maya}', 'vexo', 'mock');
    insert into public.voice_sessions (id, patient_id, mode, status) values
      ('${VS}', '${P.maya}', 'simulated', 'completed');

    insert into public.journal_entries (id, patient_id, source, body, occurred_at, review_status, source_ref_id) values
      ('${E.mayaPending}', '${P.maya}', 'manual', 'pending text', now(), 'pending_review', '${REF.mayaPending}'),
      ('${E.mayaApproved}', '${P.maya}', 'vexo', 'approved text', now(), 'approved', '${REF.mayaApproved}'),
      ('${E.mayaRejected}', '${P.maya}', 'manual', 'private text', now(), 'rejected', null),
      ('${E.danielApproved}', '${P.daniel}', 'manual', 'daniel approved', now(), 'approved', null),
      ('${E.danielPending}', '${P.daniel}', 'manual', 'daniel pending', now(), 'pending_review', null);

    update public.journal_entries set processing_status = 'processed';

    insert into public.observations (id, patient_id, journal_entry_id, category, label, patient_quote, status, extracted_by) values
      ('${OBS.mayaApprovedActive}', '${P.maya}', '${E.mayaApproved}', 'symptom', 'Knee', 'q', 'active', 'mock'),
      ('${OBS.mayaApprovedRemoved}', '${P.maya}', '${E.mayaApproved}', 'sleep', 'Sleep', 'q', 'removed', 'mock'),
      ('${OBS.mayaPendingActive}', '${P.maya}', '${E.mayaPending}', 'symptom', 'Knee', 'q', 'active', 'mock'),
      ('${OBS.danielApprovedActive}', '${P.daniel}', '${E.danielApproved}', 'mobility', 'Walk', 'q', 'active', 'mock');

    insert into public.generated_summaries (patient_id, audience, period_start, period_end, content, generated_by) values
      ('${P.maya}', 'patient', now(), now(), '{}', 'mock'),
      ('${P.maya}', 'clinician', now(), now(), '{}', 'mock'),
      ('${P.daniel}', 'patient', now(), now(), '{}', 'mock'),
      ('${P.daniel}', 'clinician', now(), now(), '{}', 'mock');
    insert into public.sharing_approvals (patient_id, journal_entry_id, decision, decided_by) values
      ('${P.maya}', '${E.mayaApproved}', 'approved', '${U.maya}'),
      ('${P.daniel}', '${E.danielApproved}', 'approved', '${U.daniel}');
    insert into public.vexo_connections (user_id, tokens_enc) values ('${U.maya}', 'enc');
  `);
});

afterAll(async () => {
  await db.close();
});

describe("patient access", () => {
  it("sees only their own entries in every status", async () => {
    const rows = await asUser<{ id: string }>(U.maya, "select id from public.journal_entries");
    expect(ids(rows)).toEqual([E.mayaPending, E.mayaApproved, E.mayaRejected].sort());
  });

  it("sees own observations (including removed) but not other patients'", async () => {
    const rows = await asUser<{ id: string }>(U.maya, "select id from public.observations");
    expect(ids(rows)).toEqual([OBS.mayaApprovedActive, OBS.mayaApprovedRemoved, OBS.mayaPendingActive].sort());
  });

  it("sees both summary audiences for self only", async () => {
    const rows = await asUser<{ patient_id: string; audience: string }>(
      U.maya,
      "select patient_id, audience from public.generated_summaries",
    );
    expect(rows.map((r) => r.audience).sort()).toEqual(["clinician", "patient"]);
    expect(new Set(rows.map((r) => r.patient_id))).toEqual(new Set([P.maya]));
  });

  it("sees own voice sessions, approvals, profile and care team only", async () => {
    expect(await asUser(U.maya, "select id from public.voice_sessions")).toHaveLength(1);
    expect(await asUser(U.daniel, "select id from public.voice_sessions")).toHaveLength(0);
    expect(await asUser(U.maya, "select id from public.sharing_approvals")).toHaveLength(1);
    const profiles = await asUser<{ id: string }>(U.maya, "select id from public.profiles");
    expect(ids(profiles)).toEqual([U.maya, U.park].sort());
    expect(await asUser(U.maya, "select id from public.patient_profiles")).toHaveLength(1);
  });

  it("cannot read vexo_connections or write observations/summaries", async () => {
    await expect(asUser(U.maya, "select * from public.vexo_connections")).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(
        U.maya,
        `insert into public.observations (patient_id, journal_entry_id, category, label, patient_quote, extracted_by)
         values ('${P.maya}', '${E.mayaPending}', 'other', 'x', 'q', 'mock')`,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(
        U.maya,
        `insert into public.generated_summaries (patient_id, audience, period_start, period_end, content, generated_by)
         values ('${P.maya}', 'clinician', now(), now(), '{}', 'mock')`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("can insert an entry for self but not for another patient", async () => {
    const own = await asUser<{ id: string }>(
      U.maya,
      `insert into public.journal_entries (patient_id, source, body, occurred_at)
       values ('${P.maya}', 'manual', 'new note', now()) returning id`,
    );
    expect(own).toHaveLength(1);
    await expect(
      asUser(
        U.maya,
        `insert into public.journal_entries (patient_id, source, body, occurred_at)
         values ('${P.daniel}', 'manual', 'spoofed', now())`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("can update the body of a pending entry and approve it", async () => {
    const edited = await asUser<{ body: string }>(
      U.daniel,
      `update public.journal_entries set body = 'edited' where id = '${E.danielPending}' returning body`,
    );
    expect(edited[0]?.body).toBe("edited");
    const approved = await asUser<{ review_status: string }>(
      U.daniel,
      `update public.journal_entries set review_status = 'approved' where id = '${E.danielPending}' returning review_status`,
    );
    expect(approved[0]?.review_status).toBe("approved");
  });

  it("cannot edit the body or time of an approved entry, but can revoke and re-approve it", async () => {
    await expect(
      asUser(U.maya, `update public.journal_entries set body = 'changed' where id = '${E.mayaApproved}'`),
    ).rejects.toThrow(/pending review/i);
    await expect(
      asUser(U.maya, `update public.journal_entries set occurred_at = now() where id = '${E.mayaApproved}'`),
    ).rejects.toThrow(/pending review/i);

    const revoked = await asUser<{ review_status: string }>(
      U.maya,
      `update public.journal_entries set review_status = 'rejected' where id = '${E.mayaApproved}' returning review_status`,
    );
    expect(revoked[0]?.review_status).toBe("rejected");
    // Restore for later tests (service role / superuser is not subject to the guard).
    await db.exec(`update public.journal_entries set review_status = 'approved' where id = '${E.mayaApproved}'`);
  });

  it("cannot jump to an invalid status, move an entry to another patient, or edit another patient's entry", async () => {
    await expect(
      asUser(U.maya, `update public.journal_entries set review_status = 'pending_review' where id = '${E.mayaApproved}'`),
    ).rejects.toThrow(/transition/i);
    await expect(
      asUser(U.maya, `update public.journal_entries set patient_id = '${P.daniel}' where id = '${E.mayaPending}'`),
    ).rejects.toThrow(/permission denied/i);
    const hidden = await asUser(
      U.maya,
      `update public.journal_entries set body = 'x' where id = '${E.danielApproved}' returning id`,
    );
    expect(hidden).toHaveLength(0);
  });

  it("can edit observations of a pending entry but not of an approved one", async () => {
    const ok = await asUser<{ label: string }>(
      U.maya,
      `update public.observations set label = 'Edited' where id = '${OBS.mayaPendingActive}' returning label`,
    );
    expect(ok[0]?.label).toBe("Edited");
    const blocked = await asUser(
      U.maya,
      `update public.observations set label = 'Edited' where id = '${OBS.mayaApprovedActive}' returning id`,
    );
    expect(blocked).toHaveLength(0);
  });

  it("cannot insert sharing approvals or source references (system only)", async () => {
    await expect(
      asUser(
        U.maya,
        `insert into public.sharing_approvals (patient_id, journal_entry_id, decision, decided_by)
         values ('${P.maya}', '${E.mayaApproved}', 'revoked', '${U.maya}')`,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(
        U.maya,
        `insert into public.source_references (patient_id, provider, mode) values ('${P.maya}', 'manual', 'mock')`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("cannot update voice sessions but can insert own ones", async () => {
    await expect(
      asUser(U.maya, `update public.voice_sessions set status = 'failed' where id = '${VS}'`),
    ).rejects.toThrow(/permission denied/i);
    const own = await asUser(
      U.maya,
      `insert into public.voice_sessions (patient_id, mode, status) values ('${P.maya}', 'simulated', 'active') returning id`,
    );
    expect(own).toHaveLength(1);
    await expect(
      asUser(U.maya, `insert into public.voice_sessions (patient_id, mode, status) values ('${P.daniel}', 'simulated', 'active')`),
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot link an entry to another patient's source reference or voice session", async () => {
    const danielRef = id(43);
    const danielVs = id(52);
    await db.exec(`
      insert into public.source_references (id, patient_id, provider, mode) values ('${danielRef}', '${P.daniel}', 'vexo', 'mock');
      insert into public.voice_sessions (id, patient_id, mode, status) values ('${danielVs}', '${P.daniel}', 'simulated', 'completed');
    `);
    await expect(
      db.exec(
        `insert into public.journal_entries (patient_id, source, body, occurred_at, source_ref_id)
         values ('${P.maya}', 'manual', 'x', now(), '${danielRef}')`,
      ),
    ).rejects.toThrow(/foreign key/i);
    await expect(
      db.exec(
        `insert into public.journal_entries (patient_id, source, body, occurred_at, voice_session_id)
         values ('${P.maya}', 'voice', 'x', now(), '${danielVs}')`,
      ),
    ).rejects.toThrow(/foreign key/i);
    await expect(
      asUser(
        U.maya,
        `insert into public.journal_entries (patient_id, source, body, occurred_at, source_ref_id)
         values ('${P.maya}', 'manual', 'x', now(), '${danielRef}')`,
      ),
    ).rejects.toThrow();
  });

  it("cannot insert an already approved or processed entry", async () => {
    await expect(
      asUser(
        U.maya,
        `insert into public.journal_entries (patient_id, source, body, occurred_at, review_status)
         values ('${P.maya}', 'manual', 'x', now(), 'approved')`,
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      asUser(
        U.maya,
        `insert into public.journal_entries (patient_id, source, body, occurred_at, processing_status)
         values ('${P.maya}', 'manual', 'x', now(), 'processed')`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot update processing fields, and cannot review an entry that is still processing", async () => {
    await expect(
      asUser(U.maya, `update public.journal_entries set processing_status = 'processed' where id = '${E.mayaPending}'`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(U.maya, `update public.journal_entries set source_ref_id = null where id = '${E.mayaPending}'`),
    ).rejects.toThrow(/permission denied/i);

    await db.exec(`update public.journal_entries set processing_status = 'processing' where id = '${E.mayaPending}'`);
    await expect(
      asUser(U.maya, `update public.journal_entries set review_status = 'approved' where id = '${E.mayaPending}'`),
    ).rejects.toThrow(/being processed/i);
    await db.exec(`update public.journal_entries set processing_status = 'processed' where id = '${E.mayaPending}'`);
  });
});

describe("privacy filter receipt (system-only column)", () => {
  const receipt = `'{"provider":"mock","model":null,"totalSentences":3,"keptSentences":1,"redactions":{},"filteredAt":"2026-11-14T00:00:00Z"}'::jsonb`;

  it("a patient cannot set privacy_filter on insert or change it on update", async () => {
    await expect(
      asUser(
        U.maya,
        `insert into public.journal_entries (patient_id, source, body, occurred_at, privacy_filter)
         values ('${P.maya}', 'manual', 'x', now(), ${receipt})`,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(U.maya, `update public.journal_entries set privacy_filter = ${receipt} where id = '${E.mayaPending}'`),
    ).rejects.toThrow(/permission denied/i);
  });

  it("a patient can still insert an entry without it, and the service role can set it", async () => {
    const rows = await asUser(
      U.maya,
      `insert into public.journal_entries (patient_id, source, body, occurred_at)
       values ('${P.maya}', 'manual', 'plain', now()) returning id, privacy_filter`,
    );
    expect(rows[0].privacy_filter).toBeNull();
    const set = await db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      await tx.query(`update public.journal_entries set privacy_filter = ${receipt} where id = '${E.mayaPending}'`);
      return (await tx.query("select privacy_filter from public.journal_entries where id = $1", [E.mayaPending])).rows;
    });
    expect((set[0] as { privacy_filter: { keptSentences: number } }).privacy_filter.keptSentences).toBe(1);
    await db.exec(`update public.journal_entries set privacy_filter = null where id = '${E.mayaPending}'`);
  });
});

describe("billing tables (system-only)", () => {
  it("patients and doctors cannot read or write ai_usage_records or billing_accounts", async () => {
    for (const u of [U.maya, U.park]) {
      await expect(asUser(u, "select * from public.ai_usage_records")).rejects.toThrow(/permission denied/i);
      await expect(asUser(u, "select * from public.billing_accounts")).rejects.toThrow(/permission denied/i);
      await expect(
        asUser(
          u,
          `insert into public.billing_accounts (doctor_id, mode, status, rate_micros_per_1k) values ('${U.park}', 'simulated', 'active', 10000)`,
        ),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it("the service role can insert a usage record and an account, and checks apply", async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      await tx.query(
        `insert into public.billing_accounts (doctor_id, mode, status, rate_micros_per_1k)
         values ('${U.park}', 'simulated', 'active', 10000)`,
      );
      await tx.query(
        `insert into public.ai_usage_records
           (patient_id, billing_doctor_id, operation, triggered_by, provider, input_tokens, output_tokens,
            total_tokens, token_source, rate_micros_per_1k, amount_micros, billing_status, occurred_at)
         values ('${P.maya}', '${U.park}', 'entry_extraction', 'patient', 'mock', 100, 50, 150, 'estimated',
                 10000, 1500, 'pending', now())`,
      );
      return (await tx.query("select id, created_at, amount_micros from public.ai_usage_records")).rows;
    });
    expect(rows).toHaveLength(1);
    await expect(
      db.exec(
        `insert into public.billing_accounts (doctor_id, mode, status, rate_micros_per_1k)
         values ('${U.bell}', 'simulated', 'active', 0)`,
      ),
    ).rejects.toThrow(/check/i);
    await db.exec(`delete from public.billing_accounts; delete from public.ai_usage_records;`);
  });
});

describe("assigned doctor access", () => {
  it("sees only approved entries of assigned patients", async () => {
    const rows = await asUser<{ id: string }>(U.park, "select id from public.journal_entries");
    expect(ids(rows)).toEqual([E.mayaApproved, E.danielApproved, E.danielPending].sort());
    // danielPending was approved earlier in this file; Maya pending/rejected entries stay hidden.
    expect(rows.map((r) => r.id)).not.toContain(E.mayaPending);
    expect(rows.map((r) => r.id)).not.toContain(E.mayaRejected);
  });

  it("sees only active observations of approved entries", async () => {
    const rows = await asUser<{ id: string }>(U.park, "select id from public.observations");
    expect(rows.map((r) => r.id)).toContain(OBS.mayaApprovedActive);
    expect(rows.map((r) => r.id)).toContain(OBS.danielApprovedActive);
    expect(rows.map((r) => r.id)).not.toContain(OBS.mayaApprovedRemoved);
    expect(rows.map((r) => r.id)).not.toContain(OBS.mayaPendingActive);
  });

  it("sees only clinician summaries", async () => {
    const rows = await asUser<{ audience: string }>(U.park, "select audience from public.generated_summaries");
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.audience))).toEqual(new Set(["clinician"]));
  });

  it("cannot read superseded clinician summaries", async () => {
    await db.exec(
      `insert into public.generated_summaries (patient_id, audience, period_start, period_end, content, generated_by, superseded_at)
       values ('${P.maya}', 'clinician', now(), now(), '{"old":true}', 'mock', now())`,
    );
    const rows = await asUser<{ content: { old?: boolean } }>(
      U.park,
      `select content from public.generated_summaries where patient_id = '${P.maya}'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.content.old).toBeUndefined();
    await db.exec(`delete from public.generated_summaries where superseded_at is not null`);
  });

  it("sees source references only of approved entries", async () => {
    const rows = await asUser<{ id: string }>(U.park, "select id from public.source_references");
    expect(ids(rows)).toEqual([REF.mayaApproved]);
  });

  it("sees patients, assignments and profiles of their care relationships", async () => {
    expect(await asUser(U.park, "select id from public.patient_profiles")).toHaveLength(2);
    expect(await asUser(U.park, "select id from public.care_assignments")).toHaveLength(2);
    const profiles = await asUser<{ id: string }>(U.park, "select id from public.profiles");
    expect(ids(profiles)).toEqual([U.park, U.maya, U.daniel].sort());
  });

  it("cannot see voice sessions, approvals or vexo connections", async () => {
    expect(await asUser(U.park, "select id from public.voice_sessions")).toHaveLength(0);
    expect(await asUser(U.park, "select id from public.sharing_approvals")).toHaveLength(0);
    await expect(asUser(U.park, "select * from public.vexo_connections")).rejects.toThrow(/permission denied/i);
  });

  it("cannot modify entries or observations", async () => {
    await expect(
      asUser(U.park, `update public.journal_entries set body = 'x' where id = '${E.mayaApproved}'`),
    ).resolves.toEqual([]);
    const unchanged = await db.query<{ body: string }>(
      `select body from public.journal_entries where id = '${E.mayaApproved}'`,
    );
    expect(unchanged.rows[0]?.body).toBe("approved text");
    await expect(
      asUser(U.park, `insert into public.journal_entries (patient_id, source, body, occurred_at) values ('${P.maya}', 'manual', 'x', now())`),
    ).rejects.toThrow(/row-level security/i);
  });

  it("can insert and re-mark a review for an approved entry of an assigned patient", async () => {
    const insert = `insert into public.doctor_reviews (doctor_id, patient_id, journal_entry_id)
      values ('${U.park}', '${P.maya}', '${E.mayaApproved}')
      on conflict (doctor_id, journal_entry_id) do update set reviewed_at = now() returning id`;
    const first = await asUser<{ id: string }>(U.park, insert);
    const second = await asUser<{ id: string }>(U.park, insert);
    expect(second[0]?.id).toBe(first[0]?.id);
    expect(await asUser(U.park, "select id from public.doctor_reviews")).toHaveLength(1);
  });

  it("cannot review pending/rejected entries, mismatched patients, or as another doctor", async () => {
    await expect(
      asUser(
        U.park,
        `insert into public.doctor_reviews (doctor_id, patient_id, journal_entry_id)
         values ('${U.park}', '${P.maya}', '${E.mayaPending}')`,
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      asUser(
        U.park,
        `insert into public.doctor_reviews (doctor_id, patient_id, journal_entry_id)
         values ('${U.park}', '${P.daniel}', '${E.mayaApproved}')`,
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      asUser(
        U.park,
        `insert into public.doctor_reviews (doctor_id, patient_id, journal_entry_id)
         values ('${U.bell}', '${P.maya}', '${E.mayaApproved}')`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("loses access when the patient stops sharing", async () => {
    await db.exec(`update public.journal_entries set review_status = 'rejected' where id = '${E.mayaApproved}'`);
    const rows = await asUser<{ id: string }>(U.park, "select id from public.journal_entries where patient_id = '" + P.maya + "'");
    expect(rows).toHaveLength(0);
    expect(await asUser(U.park, "select id from public.doctor_reviews")).toHaveLength(0);
    expect(await asUser(U.park, "select id from public.observations where patient_id = '" + P.maya + "'")).toHaveLength(0);
    await db.exec(`update public.journal_entries set review_status = 'approved' where id = '${E.mayaApproved}'`);
  });
});

describe("unassigned doctor", () => {
  it("sees nothing about patients", async () => {
    for (const table of [
      "journal_entries",
      "observations",
      "source_references",
      "voice_sessions",
      "generated_summaries",
      "sharing_approvals",
      "doctor_reviews",
      "patient_profiles",
      "care_assignments",
    ]) {
      expect(await asUser(U.bell, `select * from public.${table}`), table).toHaveLength(0);
    }
    const profiles = await asUser<{ id: string }>(U.bell, "select id from public.profiles");
    expect(ids(profiles)).toEqual([U.bell]);
  });

  it("cannot review an approved entry of an unassigned patient", async () => {
    await expect(
      asUser(
        U.bell,
        `insert into public.doctor_reviews (doctor_id, patient_id, journal_entry_id)
         values ('${U.bell}', '${P.maya}', '${E.mayaApproved}')`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("anonymous and service roles", () => {
  it("anon has no table access", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role anon");
        await tx.query("select * from public.journal_entries");
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it("service_role bypasses RLS and the entry guard", async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      await tx.query(`update public.journal_entries set body = 'system edit' where id = '${E.mayaRejected}'`);
      return (await tx.query("select id from public.journal_entries")).rows;
    });
    expect(rows.length).toBeGreaterThanOrEqual(5);
    await db.exec(`update public.journal_entries set body = 'private text' where id = '${E.mayaRejected}'`);
  });

  it("every public table has row-level security enabled", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });
});
