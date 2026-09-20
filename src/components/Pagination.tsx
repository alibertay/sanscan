import Link from "next/link";

export default function Pagination({
  page,
  pageSize,
  total,
  basePath,
  query = {},
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  query?: Record<string, string | undefined>;
}) {
  const pageCount = Math.max(Math.ceil(total / pageSize), 1);
  const current = Math.min(Math.max(page, 1), pageCount);

  function href(target: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value);
    }
    if (target > 1) params.set("page", String(target));
    const suffix = params.toString();
    return suffix ? `${basePath}?${suffix}` : basePath;
  }

  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  const windowStart = Math.max(1, Math.min(current - 2, pageCount - 4));
  const windowEnd = Math.min(pageCount, windowStart + 4);
  const pages: number[] = [];
  for (let index = windowStart; index <= windowEnd; index++) pages.push(index);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px] text-gray-600">
      <span>
        Showing <span className="font-medium text-ink-900">{from.toLocaleString()}</span> to{" "}
        <span className="font-medium text-ink-900">{to.toLocaleString()}</span> of{" "}
        <span className="font-medium text-ink-900">{total.toLocaleString()}</span> entries
      </span>
      <div className="flex items-center gap-1">
        <Link
          aria-disabled={current <= 1}
          className={`rounded border border-line px-2.5 py-1 ${
            current <= 1 ? "pointer-events-none text-gray-300" : "text-link hover:bg-surface"
          }`}
          href={href(1)}
        >
          First
        </Link>
        <Link
          aria-disabled={current <= 1}
          className={`rounded border border-line px-2.5 py-1 ${
            current <= 1 ? "pointer-events-none text-gray-300" : "text-link hover:bg-surface"
          }`}
          href={href(current - 1)}
        >
          ‹ Prev
        </Link>
        {pages.map((item) => (
          <Link
            key={item}
            href={href(item)}
            className={`rounded border px-2.5 py-1 ${
              item === current
                ? "border-link bg-link font-semibold text-white"
                : "border-line text-link hover:bg-surface"
            }`}
          >
            {item}
          </Link>
        ))}
        <Link
          aria-disabled={current >= pageCount}
          className={`rounded border border-line px-2.5 py-1 ${
            current >= pageCount ? "pointer-events-none text-gray-300" : "text-link hover:bg-surface"
          }`}
          href={href(current + 1)}
        >
          Next ›
        </Link>
        <Link
          aria-disabled={current >= pageCount}
          className={`rounded border border-line px-2.5 py-1 ${
            current >= pageCount ? "pointer-events-none text-gray-300" : "text-link hover:bg-surface"
          }`}
          href={href(pageCount)}
        >
          Last
        </Link>
      </div>
    </div>
  );
}
