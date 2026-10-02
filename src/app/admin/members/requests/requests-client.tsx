"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { reviewMembershipRequest, getMembershipReceipt } from "./actions";

export interface RequestRow {
  id: string;
  name: string;
  email: string | null;
  tier: string;
  amountCents: number;
  durationDays: number;
  reference: string | null;
  status: string;
  submitted: string;
  reviewNotes: string | null;
}

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  approved: "default",
  rejected: "destructive",
};

export function SubscriptionRequests({ pending, reviewed }: { pending: RequestRow[]; reviewed: RequestRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [proofFor, setProofFor] = useState<RequestRow | null>(null);
  const [proof, setProof] = useState<{ paymentReference: string | null; slipUrl: string | null } | null>(null);
  const [rejectFor, setRejectFor] = useState<RequestRow | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");

  function run(fn: () => Promise<{ success: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.success) setError(result.message ?? "Something went wrong.");
      else router.refresh();
    });
  }

  function openProof(r: RequestRow) {
    setProofFor(r);
    setProof(null);
    getMembershipReceipt(r.id).then(setProof);
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No pending requests.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                      {r.email && <div className="text-xs text-muted-foreground">{r.email}</div>}
                    </TableCell>
                    <TableCell>{r.tier}</TableCell>
                    <TableCell>{pesos(r.amountCents)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.durationDays} days</TableCell>
                    <TableCell className="font-mono text-xs">{r.reference ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{r.submitted}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" disabled={isPending} onClick={() => openProof(r)}>
                          Receipt
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() => {
                            setRejectNotes("");
                            setRejectFor(r);
                          }}
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          disabled={isPending}
                          onClick={() => run(() => reviewMembershipRequest(r.id, true))}
                        >
                          Approve
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {reviewed.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Recently reviewed</h2>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewed.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                      {r.email && <div className="text-xs text-muted-foreground">{r.email}</div>}
                    </TableCell>
                    <TableCell>{r.tier}</TableCell>
                    <TableCell>{pesos(r.amountCents)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[r.status] ?? "secondary"}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.reviewNotes ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{r.submitted}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {/* Receipt viewer */}
      <Dialog open={proofFor !== null} onOpenChange={(open) => !open && setProofFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Receipt — {proofFor?.name}</DialogTitle>
          </DialogHeader>
          {proof === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !proof.paymentReference && !proof.slipUrl ? (
            <p className="text-sm text-muted-foreground">No receipt was submitted.</p>
          ) : (
            <div className="flex flex-col gap-2 text-sm">
              {proof.paymentReference && (
                <p>
                  Reference: <span className="font-mono">{proof.paymentReference}</span>
                </p>
              )}
              {proof.slipUrl && (
                <a href={proof.slipUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  View receipt
                </a>
              )}
            </div>
          )}
          {proofFor && (
            <Button disabled={isPending} onClick={() => run(() => reviewMembershipRequest(proofFor.id, true))}>
              Approve membership
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject with reason */}
      <Dialog open={rejectFor !== null} onOpenChange={(open) => !open && setRejectFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject request — {rejectFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Input
              placeholder="Reason (optional) — included in the email to the member"
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
            />
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => {
                const id = rejectFor!.id;
                setRejectFor(null);
                run(() => reviewMembershipRequest(id, false, rejectNotes));
              }}
            >
              Reject
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
