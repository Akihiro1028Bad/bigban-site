"use client";

import { useState } from "react";
import { motion } from "framer-motion";

import type { FormEvent } from "react";
import { EASE } from "@/constants/motion";


interface ContactCategory {
  value: string;
  label: string;
}

const CATEGORIES: ContactCategory[] = [
  { value: "", label: "選択してください" },
  { value: "court", label: "コート予約" },
  { value: "lesson", label: "レッスンについて" },
  { value: "press", label: "取材依頼" },
  { value: "other", label: "その他" },
];

export default function HomeContact() {
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");

    const formData = new FormData(e.currentTarget);
    const body = Object.fromEntries(formData.entries());

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setStatus("error");
        return;
      }

      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  const inputClass =
    "w-full border-b border-text-gray/40 bg-transparent py-3 text-text-light placeholder:text-text-gray/60 focus:border-accent focus:outline-none transition-colors";

  return (
    <section id="contact" className="bg-deep-black py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24">
          {/* Right column on desktop, top on mobile */}
          <motion.div
            className="order-first lg:order-last"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-150px" }}
            transition={{ duration: 1.0, ease: EASE }}
          >
            <p className="text-xs tracking-[0.3em] text-text-gray uppercase mb-8">
              GET IN TOUCH
            </p>
            <div className="space-y-6">
              <div>
                <p className="text-sm text-text-gray mb-1">Instagram</p>
                <p className="text-lg text-text-light">@thepicklebangtheory</p>
              </div>
              <div>
                <p className="text-sm text-text-gray mb-1">Address</p>
                <p className="text-lg text-text-light">
                  千葉県市川市八幡2-16-6 八幡ハタビル 6階
                </p>
              </div>
              <div>
                <p className="text-sm text-text-gray mb-1">Hours</p>
                <p className="text-lg text-text-light">6:00 – 23:00</p>
              </div>
            </div>
          </motion.div>

          {/* Left column on desktop, bottom on mobile */}
          <motion.div
            className="order-last lg:order-first"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-150px" }}
            transition={{ duration: 1.0, delay: 0.1, ease: EASE }}
          >
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="contact-name" className="sr-only">
                  お名前
                </label>
                <input
                  id="contact-name"
                  name="name"
                  type="text"
                  required
                  placeholder="お名前 *"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="contact-email" className="sr-only">
                  メールアドレス
                </label>
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  required
                  placeholder="メールアドレス *"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="contact-category" className="sr-only">
                  お問い合わせ種別
                </label>
                <select
                  id="contact-category"
                  name="category"
                  required
                  className={`${inputClass} cursor-pointer`}
                  defaultValue=""
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value} disabled={cat.value === ""}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="contact-message" className="sr-only">
                  お問い合わせ内容
                </label>
                <textarea
                  id="contact-message"
                  name="message"
                  required
                  placeholder="お問い合わせ内容 *"
                  rows={5}
                  className={`${inputClass} resize-none`}
                />
              </div>

              <button
                type="submit"
                disabled={status === "sending"}
                className="bg-accent text-deep-black px-8 py-3 text-sm font-semibold tracking-[0.15em] uppercase hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                SEND MESSAGE →
              </button>

              {status === "success" && (
                <p className="text-accent mt-4">送信しました。ありがとうございます。</p>
              )}
              {status === "error" && (
                <p className="text-red-400 mt-4">
                  送信に失敗しました。もう一度お試しください。
                </p>
              )}
            </form>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
