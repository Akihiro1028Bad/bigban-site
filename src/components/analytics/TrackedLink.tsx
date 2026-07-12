"use client";

import { Link } from "@/i18n/navigation";
import { trackCtaClick } from "@/lib/analytics/trackEvent";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import type { CtaKey } from "@/lib/analytics/events";

interface TrackedLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick"> {
  href: string;
  eventKey: CtaKey;
  location: string;
  label?: string;
  external?: boolean;
  children: ReactNode;
}

export function TrackedLink({
  href,
  eventKey,
  location,
  label,
  external = false,
  children,
  ...props
}: TrackedLinkProps) {
  const handleClick = () => {
    trackCtaClick(eventKey, location, label);
  };

  if (external) {
    return (
      <a href={href} onClick={handleClick} {...props}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}
