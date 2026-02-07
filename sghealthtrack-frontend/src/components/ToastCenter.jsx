import { createContext, useContext } from "react";

export const ToastContext = createContext({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastCenter({ toast }) {
  if (!toast?.message) return null;

  return (
    <div className="toast-center" role="status" aria-live="polite">
      <div className={`toast-center-box toast-center-${toast.variant || "success"}`}>
        <span className="toast-center-icon" aria-hidden="true">
          OK
        </span>
        <span className="toast-center-text">{toast.message}</span>
      </div>
    </div>
  );
}
