import { Sparkles } from "lucide-react";
import { CoverageNote } from "@/components/billing/coverage-note";
import { Reveal } from "@/components/motion/reveal";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { ClinicalDisclaimer } from "@/components/shared/clinical-disclaimer";
import { EmptyState } from "@/components/shared/empty-state";
import { EntryTimeline } from "@/components/shared/entry-timeline";
import { BodyMap } from "@/components/viz/body-map";
import { SymptomHeatCalendar } from "@/components/viz/heat-calendar";
import { MetricTile } from "@/components/viz/metric-tile";
import { OverviewHero } from "@/components/patient/overview/hero";
import { LoopList } from "@/components/patient/overview/loop-list";
import { buildOverviewModel } from "@/components/patient/overview/model";
import { ReviewSpotlight } from "@/components/patient/overview/review-spotlight";
import { CARD, OverviewSection } from "@/components/patient/overview/section";
import { WeeklyPreview } from "@/components/patient/overview/weekly-preview";
import { orNotFound } from "@/components/patient/or-not-found";
import { RegenerateSummaryButton } from "@/components/patient/regenerate-summary-button";
import { requireActor } from "@/lib/auth/session";
import { getPatientDashboard } from "@/lib/services/patient";

export default async function PatientOverviewPage() {
  const actor = await requireActor("patient");
  const data = await orNotFound(getPatientDashboard(actor));
  const firstName = actor.fullName.split(" ")[0] ?? actor.fullName;

  const model = buildOverviewModel(data);
  const observations = data.recentEntries.flatMap((v) => v.observations);
  const weekStats = [
    { label: "Updates", value: model.rings.shared.of },
    { label: "Shared", value: model.rings.shared.done },
    { label: "Check-in days", value: model.rings.checkIn.done },
  ];

  return (
    <div className="space-y-16 sm:space-y-20">
      <OverviewHero firstName={firstName} patient={data.patient} model={model} />

      {model.tiles.length > 0 ? (
        <Reveal>
          <OverviewSection
            eyebrow="Self-reported · from your own words"
            title="What you've been telling us"
          >
            <Stagger className={`${CARD} grid divide-y divide-hairline overflow-hidden md:grid-cols-3 md:divide-x md:divide-y-0`}>
              {model.tiles.map((t) => (
                <StaggerItem key={t.key}>
                  <MetricTile
                    label={t.label}
                    value={t.value}
                    decimals={t.decimals}
                    unit={t.unit}
                    values={t.values}
                    color={t.color}
                    delta={t.delta}
                    sourceCount={t.sourceCount}
                  />
                </StaggerItem>
              ))}
            </Stagger>
          </OverviewSection>
        </Reveal>
      ) : null}

      <Reveal>
        <OverviewSection
          eyebrow="Waiting on you"
          title="Needs your review"
          description="Nothing is shared until you approve it."
        >
          <ReviewSpotlight pending={data.pendingReview} />
        </OverviewSection>
      </Reveal>

      <Reveal>
        <OverviewSection
          eyebrow="Last 14 days"
          title="Your fortnight at a glance"
          description="Darker means a larger number you reported that day. Hatched means you didn't log."
        >
          <div className={`${CARD} p-5 sm:p-8`}>
            <SymptomHeatCalendar days={model.heat.days} rows={model.heat.rows} />
          </div>
        </OverviewSection>
      </Reveal>

      <Reveal>
        <OverviewSection eyebrow="Body & loop" title="Where it hurts, and where it went">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className={`${CARD} p-5 sm:p-7 lg:sticky lg:top-24 lg:self-start`}>
              <BodyMap observations={observations} />
            </div>
            <div className={`${CARD} p-5 sm:p-7`}>
              <p className="eyebrow mb-5 text-muted-foreground">Latest updates · captured to seen</p>
              <LoopList items={data.recentEntries.slice(0, 4)} />
            </div>
          </div>
        </OverviewSection>
      </Reveal>

      <Reveal>
        <OverviewSection
          eyebrow="AI weekly report · unverified"
          title="Your week, in short"
          action={<RegenerateSummaryButton />}
        >
          {data.weeklySummary ? (
            <WeeklyPreview summary={data.weeklySummary} stats={weekStats} />
          ) : (
            <EmptyState
              icon={Sparkles}
              title="No summary yet"
              description="Add an update, then regenerate to see a recap of your week."
              action={<RegenerateSummaryButton label="Generate summary" />}
            />
          )}
        </OverviewSection>
      </Reveal>

      <Reveal>
        <OverviewSection eyebrow="Timeline" title="Recent activity">
          <EntryTimeline
            items={data.recentEntries.slice(0, 5)}
            emptyTitle="No updates yet"
            emptyDescription="Start with a voice check-in or a written note."
          />
        </OverviewSection>
      </Reveal>

      <CoverageNote />
      <ClinicalDisclaimer variant="patient" />
    </div>
  );
}
