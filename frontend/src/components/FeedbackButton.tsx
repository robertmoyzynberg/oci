import {
  FormEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { SystemMap } from "../types/oci-types";

const FEEDBACK_TO = "rizim13@gmail.com";

export type FeedbackType = "Bug Report" | "Feature Request" | "General Praise";

export interface FeedbackButtonProps {
  systemMap?: SystemMap;
  assumptionOverrides?: Record<string, number>;
  onSent?: (mode: "mailto" | "clipboard") => void;
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
    `URL: ${typeof window !== "undefined" ? window.location.href : ""}`,
  ].join("\n");
}

/**
 * Floating feedback control via mailto, with clipboard fallback.
 * No backend required.
 */
export default function FeedbackButton({
  systemMap,
  assumptionOverrides = {},
  onSent,
}: FeedbackButtonProps) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("Bug Report");
  const [message, setMessage] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
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
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const body = buildFeedbackBody({
      type,
      message,
      replyEmail,
      systemMap,
      assumptionOverrides,
    });
    const subject = `[OCI Feedback] ${type}`;
    const href = `mailto:${FEEDBACK_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    // Detect likely mailto blocks (very long URLs) or failed navigation.
    const tooLong = href.length > 2000;
    let usedClipboard = false;

    if (tooLong) {
      usedClipboard = true;
    } else {
      try {
        const anchor = document.createElement("a");
        anchor.href = href;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      } catch {
        usedClipboard = true;
      }
    }

    if (usedClipboard) {
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
        // Last resort: leave modal open content selectable — still close & notify.
      }
      setOpen(false);
      resetForm();
      onSent?.("clipboard");
      return;
    }

    setOpen(false);
    resetForm();
    onSent?.("mailto");
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
            if (e.target === e.currentTarget) setOpen(false);
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
                />
              </label>

              <button type="submit" className="feedback-send">
                Send
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
