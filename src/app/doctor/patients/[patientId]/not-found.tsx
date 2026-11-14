import Link from "next/link";
import { ArrowLeft, UserX } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export default function PatientNotFound() {
  return (
    <EmptyState
      icon={UserX}
      title="Patient not found or not assigned to you"
      description="You can only view patients who are assigned to you."
      action={
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/doctor">
            <ArrowLeft /> Back to your patients
          </Link>
        </Button>
      }
    />
  );
}
