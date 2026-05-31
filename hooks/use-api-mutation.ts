"use client";

import { useState } from "react";
import { toast } from "sonner";

type RunOptions<T> = {
  /** Toast shown on success (omit for silent success). */
  success?: string;
  /** Fallback toast message if the error has no message. */
  error?: string;
  /** Runs after a successful action (e.g. close dialog, reload, refresh). */
  onSuccess?: (result: T) => void | Promise<void>;
};

// Wraps the repeated "try → call API → toast → side-effects, catch → toast error"
// pattern used across the CRUD manager components. Returns `run` and a `pending`
// flag for disabling buttons during the request.
export function useApiMutation() {
  const [pending, setPending] = useState(false);

  async function run<T>(action: () => Promise<T>, options?: RunOptions<T>): Promise<T | undefined> {
    setPending(true);
    try {
      const result = await action();
      if (options?.success) toast.success(options.success);
      await options?.onSuccess?.(result);
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : options?.error ?? "Что-то пошло не так");
      return undefined;
    } finally {
      setPending(false);
    }
  }

  return { run, pending };
}
