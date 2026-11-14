"use client";

import { Mic, PenLine } from "lucide-react";
import { motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { SPRING } from "@/components/motion/tokens";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const triggerClass =
  "relative isolate h-10 flex-1 gap-2 rounded-full border-0 px-5 text-sm font-medium text-ink/70 transition-colors hover:text-ink data-active:bg-transparent data-active:text-paper data-active:shadow-none sm:flex-none";

/** Tabs controlled by the `tab` search param, so in-page links like `?tab=write` switch tabs. */
export function CheckInTabs({
  initialTab,
  voice,
  write,
}: {
  initialTab: "voice" | "write";
  voice: ReactNode;
  write: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const param = searchParams.get("tab");
  const value = param === "write" ? "write" : param === "voice" ? "voice" : initialTab;

  return (
    <Tabs
      value={value}
      onValueChange={(next) =>
        router.replace(`${pathname}?tab=${next === "write" ? "write" : "voice"}`, { scroll: false })
      }
      className="gap-6"
    >
      <TabsList className="h-auto w-full gap-1 rounded-full border border-hairline bg-paper-3 p-1 sm:w-fit">
        <TabsTrigger value="voice" className={triggerClass}>
          {value === "voice" ? (
            <motion.span layoutId="check-in-tab-pill" transition={SPRING} className="absolute inset-0 -z-10 rounded-full bg-ink" aria-hidden />
          ) : null}
          <Mic />
          Talk it through
        </TabsTrigger>
        <TabsTrigger value="write" className={triggerClass}>
          {value === "write" ? (
            <motion.span layoutId="check-in-tab-pill" transition={SPRING} className="absolute inset-0 -z-10 rounded-full bg-ink" aria-hidden />
          ) : null}
          <PenLine />
          Write an update
        </TabsTrigger>
      </TabsList>
      <TabsContent value="voice" className="text-base">
        {voice}
      </TabsContent>
      <TabsContent value="write" className="text-base">
        {write}
      </TabsContent>
    </Tabs>
  );
}
