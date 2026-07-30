"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetStatus, setResetStatus] = useState<"idle" | "sending" | "sent">("idle");
  const supabase = createClient();

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/` },
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (mode === "signup" && password !== confirmPassword) {
      setErrorMessage("Passwords don't match.");
      return;
    }

    setStatus("loading");
    const { error } =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus("idle");
      setErrorMessage(error.message);
      return;
    }

    window.location.href = "/";
  }

  async function onForgotPassword() {
    if (!email) {
      setErrorMessage("Enter your email above first.");
      return;
    }
    setErrorMessage(null);
    setResetStatus("sending");
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
    });
    setResetStatus("sent");
  }

  function toggleMode() {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setErrorMessage(null);
    setPassword("");
    setConfirmPassword("");
    setResetStatus("idle");
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === "signin" ? "Sign in to DinkDrop" : "Create your account"}</CardTitle>
          <CardDescription>
            {mode === "signin"
              ? "Book a court in under a minute."
              : "Save your details so booking is even faster next time."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button variant="outline" className="w-full" onClick={signInWithGoogle} type="button">
            Continue with Google
          </Button>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === "signin" &&
                  (resetStatus === "sent" ? (
                    <span className="text-xs text-muted-foreground">Reset link sent</span>
                  ) : (
                    <button
                      type="button"
                      onClick={onForgotPassword}
                      disabled={resetStatus === "sending"}
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      {resetStatus === "sending" ? "Sending..." : "Forgot password?"}
                    </button>
                  ))}
              </div>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>

            {mode === "signup" && (
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
            )}

            {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

            <Button type="submit" className="w-full" disabled={status === "loading"}>
              {status === "loading"
                ? mode === "signin"
                  ? "Signing in..."
                  : "Creating account..."
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
            <button type="button" onClick={toggleMode} className="underline underline-offset-2">
              {mode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </p>

          <p className="text-center text-xs text-muted-foreground">
            Booking as a guest?{" "}
            <a href="/book" className="underline underline-offset-2">
              Continue without an account
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
