import { useCallback } from "react";
import { toast } from "react-toastify";

/**
 * Wraps react-toastify for React 18 compatibility.
 *
 * Usage:
 *   const { notify } = useNotification();
 *   notify("Saved!", "success")
 */
export function useNotification() {
  const notify = useCallback((message, type = "info") => {
    const toastType = type === "danger" ? "error" : type;
    toast[toastType](message, {
      position: "top-right",
      autoClose: 4000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
  }, []);

  return { notify };
}
