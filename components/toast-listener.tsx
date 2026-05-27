"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

export function ToastListener() {
  const searchParams = useSearchParams();
  const message = searchParams.get("toast");

  useEffect(() => {
    if (message) {
      toast.success(message);
    }
  }, [message]);

  return null;
}
