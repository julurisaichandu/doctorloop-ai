import { DemoAccountPicker } from "@/components/app-shell/demo-account-picker";
import { Bento } from "@/components/landing/bento";
import { HowItWorks } from "@/components/landing/how-it-works";
import {
  Disclaimer,
  Footer,
  Hero,
  IntegrationStatus,
  MarqueeStrip,
  Principles,
  SectionHead,
  StatStrip,
  WRAP,
} from "@/components/landing/sections";
import { isDemoSwitcherEnabled, listDemoAccounts } from "@/lib/auth/demo";
import { getActor, homePathFor } from "@/lib/auth/session";
import { getIntegrationStatus } from "@/lib/config/env";

export default async function Home() {
  const actor = await getActor();
  const status = getIntegrationStatus();
  const demoAccounts = !actor && isDemoSwitcherEnabled() ? listDemoAccounts() : null;

  const integrations = [
    { label: status.data.label, mode: status.data.mode === "supabase" ? "live" : "local" },
    { label: status.ai.label, mode: status.ai.mode === "openai" ? "live" : "mock" },
    { label: status.voice.label, mode: status.voice.mode === "elevenlabs" ? "live" : "simulated" },
    { label: status.vexo.label, mode: status.vexo.mode === "file" ? "simulated" : status.vexo.mode },
  ] as const;

  return (
    <div className="flex flex-1 flex-col overflow-x-clip">
      <main className="flex-1">
        <Hero signedInHref={actor ? homePathFor(actor.role) : null} hasDemo={demoAccounts !== null} />

        <div className="mt-4 sm:mt-6">
          <MarqueeStrip />
        </div>

        <section className={`${WRAP} pt-20 sm:pt-28`}>
          <SectionHead
            eyebrow="How it works"
            title="From a passing thought to a *cited summary.*"
            intro="Four steps, and you stay in charge of every one of them."
          />
          <div className="mt-10 lg:mt-6">
            <HowItWorks />
          </div>
        </section>

        <section className={`${WRAP} pt-20 sm:pt-28`}>
          <SectionHead eyebrow="Inside the product" title="Built for the *space between* visits." />
          <div className="mt-10">
            <Bento />
          </div>
        </section>

        <section className={`${WRAP} pt-20 sm:pt-28`} aria-label="Product facts">
          <StatStrip />
        </section>

        <section className={`${WRAP} pt-20 sm:pt-28`}>
          <SectionHead eyebrow="Built around consent" title="Three promises, *no exceptions.*" className="mb-10" />
          <Principles />
        </section>

        <section className={`${WRAP} pt-16 sm:pt-24`}>
          <Disclaimer />
        </section>

        <section className={`${WRAP} pt-16 sm:pt-24`}>
          <IntegrationStatus items={integrations} />
        </section>

        {demoAccounts ? (
          <section id="demo" className={`${WRAP} scroll-mt-6 pt-20 pb-20 sm:pt-28 sm:pb-28`}>
            <SectionHead
              eyebrow="Explore"
              title="Step in as a *demo account.*"
              intro="Development-only role switcher: signs in as a fictional demo account; all access rules still apply."
              className="mb-10"
            />
            <DemoAccountPicker accounts={demoAccounts} />
          </section>
        ) : (
          <div className="pb-20 sm:pb-28" />
        )}
      </main>

      <Footer />
    </div>
  );
}
