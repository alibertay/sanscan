import Link from "next/link";

export default function StatCard({
  label,
  value,
  sub,
  href,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
  icon?: string;
}) {
  const body = (
    <div className="card h-full p-3.5 transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="stat-label">{label}</span>
        {icon && <span className="text-[16px]">{icon}</span>}
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[12px] text-gray-500">{sub}</div>}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {body}
      </Link>
    );
  }
  return body;
}
