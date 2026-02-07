import { useEffect, useRef } from "react";

const SUCCESS_PATTERN = /(saved|completed|done|approved|updated|sent|released|finalized|success)/i;
const FAILURE_PATTERN = /(fail|error|invalid|cannot|missing|denied|locked)/i;

export default function useSuccessToast(message, showToast) {
  const lastRef = useRef("");

  useEffect(() => {
    if (!message || typeof message !== "string") return;
    const text = message.trim();
    if (!text || text === lastRef.current) return;
    lastRef.current = text;
    if (FAILURE_PATTERN.test(text)) return;
    if (!SUCCESS_PATTERN.test(text)) return;
    showToast?.(text, "success");
  }, [message, showToast]);
}
