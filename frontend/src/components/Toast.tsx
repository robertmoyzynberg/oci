export type ToastTone = "error" | "success" | "info";

export interface ToastProps {
  message: string;
  tone?: ToastTone;
  onDismiss: () => void;
}

/**
 * Non-blocking notification. Pointer-events stay open on the rest of the UI.
 */
export default function Toast({
  message,
  tone = "info",
  onDismiss,
}: ToastProps) {
  return (
    <div className={`toast toast-${tone}`} role="alert">
      <p>{message}</p>
      <button type="button" aria-label="Dismiss" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
