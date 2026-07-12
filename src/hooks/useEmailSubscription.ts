"use client";

import { useCallback, useState } from "react";
import { trackCtaClick } from "@/lib/analytics/trackEvent";

export type SubscriptionStatus = "idle" | "submitting" | "success" | "error";

export interface UseEmailSubscriptionResult {
  email: string;
  status: SubscriptionStatus;
  isSubmitting: boolean;
  setEmail: (value: string) => void;
  submit: () => Promise<void>;
}

export function useEmailSubscription(): UseEmailSubscriptionResult {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SubscriptionStatus>("idle");

  const isSubmitting = status === "submitting";

  const submit = useCallback(async () => {
    if (!email || status === "submitting") return;

    setStatus("submitting");

    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        trackCtaClick("newsletterSignup", "footer_newsletter");
        setStatus("success");
        return;
      }

      setStatus("error");
    } catch {
      setStatus("error");
    }
  }, [email, status]);

  return { email, status, isSubmitting, setEmail, submit };
}
