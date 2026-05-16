"use client";

import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";

import { useEmailSubscription } from "@/hooks/useEmailSubscription";

export default function FooterNewsletter() {
  const t = useTranslations("HomeFooter.newsletter");
  const { email, status, isSubmitting, setEmail, submit } = useEmailSubscription();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void submit();
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-center">
      <div>
        <h3 className="text-sm tracking-[0.25em] text-text-light uppercase font-medium">
          {t("heading")}
        </h3>
        <p className="mt-2 text-xs tracking-[0.1em] text-text-gray">
          {t("description")}
        </p>
      </div>

      <div className="lg:justify-self-end w-full lg:max-w-md">
        <AnimatePresence mode="wait" initial={false}>
          {status !== "success" ? (
            <motion.form
              key="form"
              onSubmit={handleSubmit}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-2"
              noValidate
            >
              <div className="flex">
                <label htmlFor="footer-newsletter-email" className="sr-only">
                  {t("emailLabel")}
                </label>
                <input
                  id="footer-newsletter-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("emailPlaceholder")}
                  required
                  disabled={isSubmitting}
                  className="flex-1 bg-transparent border border-text-gray/30 border-r-0 px-4 py-3 text-xs tracking-wide text-text-light placeholder:text-text-gray/60 focus:outline-none focus:border-text-light/60 transition-colors rounded-l-sm disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-accent text-deep-black px-5 py-3 text-[11px] tracking-[0.2em] uppercase font-semibold hover:bg-accent/90 transition-colors shrink-0 rounded-r-sm disabled:opacity-50"
                >
                  {isSubmitting ? t("submitting") : t("submit")}
                </button>
              </div>
              {status === "error" && (
                <p role="alert" className="text-red-400 text-[11px] tracking-wide">
                  {t("errorMessage")}
                </p>
              )}
            </motion.form>
          ) : (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="lg:text-right"
            >
              <p className="text-accent text-xs tracking-[0.15em]">
                {t("successMessage")}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
