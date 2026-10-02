"use client";

import { useState } from "react";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const supabase = createClient();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (password !== confirmPassword) {
      setErrorMessage("Passwords don't match.");
      return;
    }

    setStatus("loading");

    // Verify the recovery token now — on submit, not on page load — so an email link-scanner
    // (e.g. Outlook SafeLinks) that pre-fetches the link can't consume the single-use token first.
    // Falls back to an existing session if the page was reached without a token.
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const type = params.get("type");
    if (tokenHash && type) {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        type: type as EmailOtpType,
        token_hash: tokenHash,
      });
      if (verifyError) {
        setStatus("idle");
        setErrorMessage("This reset link is invalid or has expired. Please request a new one.");
        return;
      }
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus("idle");
      setErrorMessage(error.message);
      return;
    }
    setStatus("done");
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>
            {status === "done"
              ? "Your password has been updated."
              : "Choose a new password for your account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {status === "done" ? (
            <Button asChild className="w-full">
              <a href="/account">Continue to your account</a>
            </Button>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

              <Button type="submit" disabled={status === "loading"}>
                {status === "loading" ? "Saving..." : "Save password"}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                Link expired?{" "}
                <a href="/login" className="underline underline-offset-2">
                  Request a new one
                </a>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
