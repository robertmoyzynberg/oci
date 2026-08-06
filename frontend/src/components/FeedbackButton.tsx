import {
  FormEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { sendFeedback } from "../services/api";
import type { SystemMap } from "../types/oci-types";

const FEEDBACK_TO = "rizim13@gmail.com";

export type FeedbackType = "Bug Report" | "Feature Request" | "General Praise";

export type FeedbackSendMode =
  | "api"
  | "mailto"
  | "clipboard"
  | "pending_activation";

export interface FeedbackButtonProps {
  systemMap?: SystemMap;
  assumptionOverrides?: Record<string, number>;
  onSent?: (mode: FeedbackSendMode, detail?: string) => void;
  onError?: (message: string) => void;
}

function compactPageUrl(): string {
  if (typeof window === "undefined") return "";
  const { origin, pathname, hash } = window.location;
  // Keep context without flooding email providers with a multi-KB hash.
  if (hash.length > 180) {
    return `${origin}${pathname}#<map-hash ${hash.length} chars>`;
  }
  return `${origin}${pathname}${hash}`;
}

function buildFeedbackBody(params: {
  type: FeedbackType;
  message: string;
  replyEmail: string;
  systemMap?: SystemMap;
  assumptionOverrides?: Record<string, number>;
}): string {
  const { type, message, replyEmail, systemMap, assumptionOverrides } = params;
  const mapName =
    systemMap?.metadata.title ??
    (systemMap?.metadata as { name?: string } | undefined)?.name ??
    "n/a";

  return [
    `Feedback Type: ${type}`,
    `Message: ${message.trim() || "(no message)"}`,
    `Email: ${replyEmail.trim() || "(not provided)"}`,
    `User Agent: ${typeof navigator !== "undefined" ? navigator.userAgent : "unknown"}`,
    `Screen: ${typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "unknown"}`,
    `Map Name: ${mapName}`,
    `Assumptions: ${JSON.stringify(assumptionOverrides ?? {})}`,
    `URL: ${compactPageUrl()}`,
  ].join("\n");
}

/**
 * Floating feedback control.
 * Prefers backend email delivery; falls back to mailto, then clipboard.
 */
export default function FeedbackButton({
  systemMap,
  assumptionOverrides = {},
  onSent,
  onError,
}: FeedbackButtonProps) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("Bug Report");
  const [message, setMessage] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [sending, setSending] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const fabRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  const resetForm = () => {
    setMessage("");
    setType("Bug Report");
    setReplyEmail("");
  };

  const fallbackMailtoOrClipboard = async (
    subject: string,
    body: string,
  ): Promise<FeedbackSendMode> => {
    const href = `mailto:${FEEDBACK_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const tooLong = href.length > 2000;
    if (!tooLong) {
      try {
        const anchor = document.createElement("a");
        anchor.href = href;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        return "mailto";
      } catch {
        // fall through to clipboard
      }
    }

    const clipboardText = [
      `To: ${FEEDBACK_TO}`,
      `Subject: ${subject}`,
      "",
      body,
      "",
      `Copy this feedback and email us at ${FEEDBACK_TO}.`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(clipboardText);
    } catch {
      // leave toast to explain
    }
    return "clipboard";
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;

    const mapName =
      systemMap?.metadata.title ??
      (systemMap?.metadata as { name?: string } | undefined)?.name ??
      "n/a";
    const subject = `[OCI Feedback] ${type}`;
    const body = buildFeedbackBody({
      type,
      message,
      replyEmail,
      systemMap,
      assumptionOverrides,
    });

    setSending(true);
    try {
      let result: Awaited<ReturnType<typeof sendFeedback>> | null = null;
      try {
        result = await sendFeedback({
          type,
          message: message.trim(),
          reply_email: replyEmail.trim(),
          map_name: mapName,
          assumptions: assumptionOverrides,
          url: compactPageUrl(),
          user_agent:
            typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
          screen:
            typeof window !== "undefined"
              ? `${window.innerWidth}x${window.innerHeight}`
              : "unknown",
        });
      } catch {
        // Older backends without /feedback — deliver via FormSubmit directly.
        const formRes = await fetch(
          `https://formsubmit.co/ajax/${FEEDBACK_TO}`,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: "OCI Converge Feedback",
              email: replyEmail.trim() || "noreply@oci-converge.local",
              _subject: subject,
              message: body,
            }),
          },
        );
        if (!formRes.ok) {
          throw new Error(`FormSubmit ${formRes.status}`);
        }
        result = { status: "sent", provider: "formsubmit" };
      }

      setOpen(false);
      resetForm();

      if (result.provider === "formsubmit") {
        onSent?.(
          "pending_activation",
          "Submitted via FormSubmit. First time: confirm the activation email in rizim13@gmail.com (check spam), then send again.",
        );
      } else {
        onSent?.("api");
      }
    } catch (err) {
      const mode = await fallbackMailtoOrClipboard(subject, body);
      setOpen(false);
      resetForm();
      if (mode === "clipboard") {
        onSent?.("clipboard");
      } else {
        onSent?.("mailto");
        onError?.(
          "Could not email automatically — opened your mail app instead.",
        );
      }
      void err;
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className="feedback-fab"
        aria-label="Send feedback"
        aria-haspopup="dialog"
        title="Send feedback"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">✉️</span>
      </button>

      {open ? (
        <div
          className="feedback-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !sending) setOpen(false);
          }}
        >
          <div
            className="feedback-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <header className="feedback-modal-header">
              <div>
                <h2 id={titleId}>Send Feedback</h2>
                <p>Help us improve OCI Converge.</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                className="feedback-close"
                aria-label="Close feedback dialog"
                disabled={sending}
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </header>

            <form className="feedback-form" onSubmit={handleSubmit}>
              <fieldset>
                <legend>Feedback type</legend>
                {(
                  [
                    "Bug Report",
                    "Feature Request",
                    "General Praise",
                  ] as FeedbackType[]
                ).map((option) => (
                  <label key={option} className="feedback-radio">
                    <input
                      type="radio"
                      name="feedback-type"
                      value={option}
                      checked={type === option}
                      disabled={sending}
                      onChange={() => setType(option)}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </fieldset>

              <label className="feedback-field">
                <span>Message</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={5}
                  required
                  disabled={sending}
                />
              </label>

              <label className="feedback-field">
                <span>Your email (optional)</span>
                <input
                  type="email"
                  value={replyEmail}
                  onChange={(e) => setReplyEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={sending}
                />
              </label>

              <button
                type="submit"
                className="feedback-send"
                disabled={sending}
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
