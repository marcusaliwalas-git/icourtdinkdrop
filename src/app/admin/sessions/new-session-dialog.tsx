"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SessionForm, type CourtOption, type HostOption } from "./session-form";

export function NewSessionDialog({
  venueId,
  courts,
  hosts,
}: {
  venueId: string;
  courts: CourtOption[];
  hosts: HostOption[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New session</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New session</DialogTitle>
        </DialogHeader>
        <SessionForm
          venueId={venueId}
          courts={courts}
          hosts={hosts}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
