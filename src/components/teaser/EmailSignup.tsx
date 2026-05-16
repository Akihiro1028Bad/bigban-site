"use client";

import { motion, AnimatePresence } from "framer-motion";

import { useEmailSubscription } from "@/hooks/useEmailSubscription";

export function EmailSignup() {
  const { email, status, isSubmitting, setEmail, submit } = useEmailSubscription();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit();
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <AnimatePresence mode="wait">
        {status !== "success" ? (
          <motion.form
            key="form"
            onSubmit={handleSubmit}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-0"
          >
            <div className="flex gap-0">
              <label htmlFor="email-signup" className="sr-only">
                メールアドレス
              </label>
              <input
                id="email-signup"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={isSubmitting}
                className="flex-1 bg-transparent border border-[#E6E6E6]/20 border-r-0 px-5 py-4 text-[13px] text-[#E6E6E6] tracking-wide placeholder:text-[#8A8A8A]/50 focus:outline-none focus:border-[#E6E6E6]/40 transition-colors font-[var(--font-inter)] rounded-l-sm disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-[#F6FF54] text-[#0A0A0A] px-6 py-4 text-[11px] tracking-[0.2em] uppercase font-semibold hover:bg-[#F6FF54]/90 transition-colors shrink-0 font-[var(--font-inter)] rounded-r-sm disabled:opacity-50"
              >
                {isSubmitting ? "..." : "登録ｽﾙ"}
              </button>
            </div>
            {status === "error" && (
              <p role="alert" className="mt-3 text-red-400 text-[12px] tracking-wide font-[var(--font-inter)]">
                登録に失敗しました。もう一度お試しください。
              </p>
            )}
          </motion.form>
        ) : (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <p className="text-[#F6FF54] text-[13px] tracking-[0.15em] font-[var(--font-inter)]">
              登録が完了しました
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
