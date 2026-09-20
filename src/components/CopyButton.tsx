"use client";

import { useState } from "react";

export default function CopyButton({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy to clipboard"
      className={`inline-flex items-center gap-1 rounded border border-line bg-white px-1.5 py-0.5 text-[11px] font-medium text-gray-500 hover:text-link ${className}`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
