"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { motion } from "motion/react";
import { DUR, EASE_OUT } from "@/components/motion/tokens";
import { StructuredEntry } from "@/components/patient/quick-log/structuring-result";
import { arrowNudge, pillOnInk, pillOutlineOnInk } from "@/components/patient/quick-log/styles";
import { Button } from "@/components/ui/button";
import type { VexoImportResult } from "@/lib/services/vexo";

export function ImportSuccess({ result, onReset }: { result: VexoImportResult; onReset: () => void }) {
  const count = result.entries.length;
  const skipped = result.skippedExternalIds.length;
  const filteredOut = result.filteredOutExternalIds.length;
  return (
    <div className="space-y-5">
      <section className="grain relative overflow-hidden rounded-[28px] bg-ink p-6 text-paper sm:p-8">
        <div className="relative z-10">
          <p className="eyebrow flex items-center gap-2 text-lime">
            <span className="flex size-5 items-center justify-center rounded-full bg-lime text-ink" aria-hidden>
              <Check className="size-3" strokeWidth={2.5} />
            </span>
            Memory stream · done
          </p>
          <h2 className="font-display mt-3 text-4xl leading-[1.05] sm:text-5xl">
            {count === 1 ? "1 memory imported" : `${count} memories imported`}
          </h2>
          <p className="mt-3 max-w-xl text-sm text-muted-ink">
            They are private and waiting for your review. Nothing is shared with your care team until you approve it.
            {skipped > 0 ? ` ${skipped} already imported and skipped.` : ""}
            {filteredOut > 0
              ? ` ${filteredOut} ${filteredOut === 1 ? "memory" : "memories"} had nothing health-related left after the privacy filter, so nothing was saved for ${filteredOut === 1 ? "it" : "them"}.`
              : ""}
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button asChild className={pillOnInk}>
              <Link href="/patient/review">
                Review &amp; share
                <ArrowRight className={arrowNudge} aria-hidden />
              </Link>
            </Button>
            <Button variant="outline" onClick={onReset} className={pillOutlineOnInk}>
              Find more memories
            </Button>
          </div>
        </div>
      </section>

      {result.entries.map((item, index) => (
        <motion.div
          key={item.entry.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR.reveal, ease: EASE_OUT, delay: 0.15 * index }}
        >
          <StructuredEntry item={item} chipsDelay={0.6 + 0.15 * index} headingLevel="h3" />
        </motion.div>
      ))}
    </div>
  );
}
