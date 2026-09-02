"use client";

import { useRouter } from "next/navigation";
import { NP7_LOGO } from "@/components/shared/brand";
import { AuthForm, type Mode } from "./auth-form";

/**
 * Member auth popup — the "typical signup/login pop-up". Opened by the member
 * button on both sub-sites. Password login first, with magic-link + register as
 * clear secondary options (see AuthForm). The /account/login page is the no-JS
 * / email-redirect fallback.
 *
 * Callers can open it straight into "create account" (`initialMode`), give it a
 * contextual heading (`title`/`subtitle`), and override what happens on a
 * successful login (`onLoggedIn`) — e.g. the blog gate just refreshes in place.
 */
export function AuthModal({
  onClose,
  initialMode = "login",
  title = "My NP7",
  subtitle = "Log in to manage your trips & gear",
  onLoggedIn,
  source = "account",
}: {
  onClose: () => void;
  initialMode?: Mode;
  title?: string;
  subtitle?: string;
  onLoggedIn?: () => void;
  /** Which surface opened the modal — rides along on the Lead. */
  source?: string;
}) {
  const router = useRouter();

  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-label="Sign in to NP7">
      <button className="absolute inset-0 bg-[#00141d]/70 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative w-full sm:max-w-[420px] bg-white rounded-t-3xl sm:rounded-3xl shadow-[0_30px_80px_rgba(0,20,30,0.4)] max-h-[92svh] overflow-y-auto p-7 sm:p-8 pb-[calc(1.75rem+env(safe-area-inset-bottom))] sm:pb-8">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 w-9 h-9 grid place-items-center rounded-full bg-[#f1f5f6] text-[#5a6b72] hover:bg-[#e4ebee]">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>

        <div className="text-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={NP7_LOGO} alt="NP7" className="h-7 w-auto mx-auto mb-3" />
          <h2 className="text-xl font-black tracking-[-0.02em] text-[#00374a]">{title}</h2>
          <p className="text-[13px] text-[#6a7a80] mt-1">{subtitle}</p>
        </div>

        <AuthForm
          compact
          initialMode={initialMode}
          source={source}
          onLoggedIn={onLoggedIn ?? (() => { onClose(); router.push("/account"); router.refresh(); })}
        />
      </div>
    </div>
  );
}
