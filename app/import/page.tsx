"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// The import screen and the settings tab called «Данные» were two places for the
// same work — moving data in and out of the app. There is one place now; this
// keeps every old link, bookmark and shortcut pointing at it. A client-side
// redirect because the app is a static export: there is no server to send a 302.
export default function ImportPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings?section=data");
  }, [router]);
  return null;
}
