// Small shared loading indicator: a spinning ring next to the loading text,
// used by every register and panel while data is being fetched.
export function LoadingIndicator({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <span aria-hidden className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-navy-700" />
      {label}
    </span>
  );
}
