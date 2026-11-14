import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { BrandName, LogoMark } from "@/components/app-shell/brand";
import { DemoAccountPicker } from "@/components/app-shell/demo-account-picker";
import { LoopArt } from "@/components/landing/loop-art";
import { Grain } from "@/components/motion/grain";
import { isDemoSwitcherEnabled, listDemoAccounts } from "@/lib/auth/demo";
import { getActor, homePathFor } from "@/lib/auth/session";
import { getDataBackend } from "@/lib/config/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const actor = await getActor();
  if (actor) redirect(homePathFor(actor.role));

  const supabase = getDataBackend() === "supabase";
  const demoAccounts = isDemoSwitcherEnabled() ? listDemoAccounts() : null;

  return (
    <main className="grid flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Ink panel */}
      <section className="grain relative overflow-hidden bg-ink text-paper lg:min-h-screen">
        <Grain />
        <div className="relative z-10 flex h-full flex-col justify-between gap-8 px-6 py-8 sm:px-10 lg:py-10">
          <Link href="/" className="flex w-fit items-center gap-2.5" aria-label="DoctorLoop AI home">
            <LogoMark />
            <BrandName className="text-xl" />
          </Link>
          <div className="hidden lg:block">
            <LoopArt className="max-w-[440px]" />
          </div>
          <div className="lg:hidden">
            <LoopArt className="max-w-[260px]" caption={false} />
          </div>
          <div>
            <p className="font-display text-4xl leading-[1.05] tracking-[-0.02em] sm:text-5xl">
              Between appointments, <em>nothing gets lost.</em>
            </p>
            <p className="eyebrow mt-4 text-[10px] text-muted-ink">
              Prototype · synthetic data · not a medical device · not for emergencies
            </p>
          </div>
        </div>
      </section>

      {/* Paper panel */}
      <section className="flex flex-col px-4 py-8 sm:px-10 lg:px-14 lg:py-10">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden />
          Back to home
        </Link>

        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-8 py-10">
          {supabase ? (
            <div>
              <p className="eyebrow text-muted-foreground">Welcome back</p>
              <h1 className="font-display mt-2 text-5xl leading-none tracking-[-0.02em]">
                Sign in to your <em>recovery workspace</em>
              </h1>
              <div className="mt-8 rounded-[24px] border border-hairline bg-paper-2 p-6">
                <LoginForm />
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-amber text-ink">
                <FlaskConical className="size-5" strokeWidth={1.5} aria-hidden />
              </span>
              <div>
                <h1 className="font-display text-5xl leading-none tracking-[-0.02em]">Local demo mode</h1>
                <p className="mt-3 text-[15px] text-muted-foreground">
                  Local demo mode — no Supabase credentials configured. Choose a fictional demo account to explore.
                </p>
              </div>
            </div>
          )}

          {demoAccounts ? (
            <div className="space-y-5 lg:[&_ul]:grid-cols-2!">
              <div className="border-t border-hairline pt-6">
                <h2 className="eyebrow text-foreground">Demo accounts</h2>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Development-only role switcher: signs in as a fictional demo account; all access rules still apply.
                </p>
              </div>
              <DemoAccountPicker accounts={demoAccounts} />
            </div>
          ) : !supabase ? (
            <p className="text-sm text-muted-foreground">The demo account switcher is disabled in this environment.</p>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Prototype with synthetic data only. Not a medical device. Not for emergencies.
          </p>
        </div>
      </section>
    </main>
  );
}
