// Loading placeholder for the chat list — same shape as the real list so the
// layout doesn't jump when chats arrive.
const SidebarSkeleton = () => {
  const rows = Array(8).fill(null);

  return (
    <aside className="h-full w-full lg:w-[400px] xl:w-[420px] shrink-0 bg-[#0B141A] flex flex-col lg:border-r lg:border-white/5">
      <div className="px-4 pt-4 pb-3">
        <div className="h-7 w-32 rounded-md bg-white/10 animate-pulse" />
      </div>
      <div className="px-4 pb-3">
        <div className="h-12 rounded-full bg-white/10 animate-pulse" />
      </div>
      <div className="flex gap-2 px-4 pb-3">
        {[14, 20, 20, 18].map((w, i) => (
          <div key={i} className="h-9 rounded-full bg-white/10 animate-pulse" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <div className="overflow-hidden">
        {rows.map((_, idx) => (
          <div key={idx} className="px-4 py-3 flex items-center gap-4">
            <div className="size-14 rounded-full bg-white/10 animate-pulse shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-4 w-40 rounded bg-white/10 animate-pulse" />
              <div className="h-3.5 w-56 max-w-full rounded bg-white/10 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};

export default SidebarSkeleton;
