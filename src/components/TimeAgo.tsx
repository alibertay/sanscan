"use client";

import { useEffect, useState } from "react";

import { formatUtc, relativeTime } from "@/lib/format";

export default function TimeAgo({
  timestamp,
  className = "",
}: {
  timestamp: number | null | undefined;
  className?: string;
}) {
  // SSR renders the absolute time; after hydration it becomes "x secs ago"
  // and ticks on its own, so there is never a hydration mismatch.
  const [text, setText] = useState(() => formatUtc(timestamp));

  useEffect(() => {
    function update() {
      setText(relativeTime(timestamp));
    }
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [timestamp]);

  return (
    <span className={className} title={formatUtc(timestamp)}>
      {text}
    </span>
  );
}
