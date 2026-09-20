"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthFormState } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

const initialState: AuthFormState = { error: null };

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [signInState, signInAction, signInPending] = useActionState(
    signIn,
    initialState,
  );
  const [signUpState, signUpAction, signUpPending] = useActionState(
    signUp,
    initialState,
  );

  const isSignIn = mode === "sign-in";
  const action = isSignIn ? signInAction : signUpAction;
  const state = isSignIn ? signInState : signUpState;
  const pending = isSignIn ? signInPending : signUpPending;

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex rounded-md bg-slate-100 p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => setMode("sign-in")}
          className={`flex-1 rounded-md py-1.5 transition-colors ${
            isSignIn ? "bg-white shadow-sm text-slate-900" : "text-slate-500"
          }`}
        >
          Inloggen
        </button>
        <button
          type="button"
          onClick={() => setMode("sign-up")}
          className={`flex-1 rounded-md py-1.5 transition-colors ${
            !isSignIn ? "bg-white shadow-sm text-slate-900" : "text-slate-500"
          }`}
        >
          Account aanmaken
        </button>
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <div>
          <Label htmlFor="email">E-mailadres</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>

        <div>
          <Label htmlFor="password">Wachtwoord</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignIn ? "current-password" : "new-password"}
            required
            minLength={isSignIn ? undefined : 8}
          />
        </div>

        {state.error && (
          <p className="text-sm text-red-600" role="alert">
            {state.error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending
            ? "Bezig..."
            : isSignIn
              ? "Inloggen"
              : "Account aanmaken"}
        </Button>
      </form>
    </div>
  );
}
