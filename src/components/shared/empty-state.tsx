import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Empty className="rounded-[20px] border border-dashed border-hairline bg-paper-2 py-12">
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="size-11 rounded-full bg-ink text-lime [&_svg:not([class*='size-'])]:size-5"
        >
          <Icon strokeWidth={1.5} />
        </EmptyMedia>
        <EmptyTitle className="font-display text-2xl font-normal tracking-tight">{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
