import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Editorial section: mono eyebrow, serif title, optional description + trailing action. */
export function OverviewSection({
  eyebrow,
  title,
  description,
  action,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-6", className)}>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-2xl">
          <p className="eyebrow text-muted-foreground">{eyebrow}</p>
          <h2 className="mt-2 font-display text-[32px] leading-[1.05] tracking-[-0.015em] sm:text-[40px]">{title}</h2>
          {description ? <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export const CARD = "rounded-[20px] border border-hairline bg-paper-2";
