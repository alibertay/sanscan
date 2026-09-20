import CopyButton from "@/components/CopyButton";
import { jsonPretty } from "@/lib/format";

export default function JsonBlock({
  value,
  title,
  copyable = true,
  maxHeight = 360,
}: {
  value: unknown;
  title?: string;
  copyable?: boolean;
  maxHeight?: number;
}) {
  const text = jsonPretty(value);
  return (
    <div>
      {(title || copyable) && (
        <div className="mb-1.5 flex items-center justify-between">
          {title && <span className="text-[12px] font-semibold text-gray-600">{title}</span>}
          {copyable && <CopyButton value={text} />}
        </div>
      )}
      <pre
        className="overflow-auto rounded-md border border-line bg-ink-900 p-3 text-[12px] leading-relaxed text-sky-100"
        style={{ maxHeight }}
      >
        {text}
      </pre>
    </div>
  );
}
