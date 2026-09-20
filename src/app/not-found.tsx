import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <p className="text-[64px] font-black leading-none text-ink-800">404</p>
      <h1 className="mt-3 text-[18px] font-semibold text-ink-900">Page or resource not found</h1>
      <p className="mt-2 text-[13px] text-gray-600">
        The block, transaction, address or contract you are looking for does not exist on this
        SAN chain — or the explorer has not indexed it yet.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link className="btn btn-primary" href="/">
          Home
        </Link>
        <Link className="btn btn-outline" href="/blocks">
          Browse blocks
        </Link>
      </div>
    </div>
  );
}
