export default function Header({ title }: { title: string }) {
  return (
    <header className="flex justify-between items-center h-16 px-container-padding sticky top-0 z-40 bg-surface/80 backdrop-blur-md border-b border-border-subtle">
      <div className="flex items-center gap-4">
        <h1 className="text-headline-md font-headline-md text-primary">{title}</h1>
      </div>
      <div className="flex items-center gap-6">
        <div className="relative hidden lg:block">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">
            search
          </span>
          <input
            className="pl-10 pr-4 py-2 bg-surface-container rounded-full border-none text-body-sm w-64 focus:ring-2 focus:ring-primary"
            placeholder="통합 검색..."
            type="text"
          />
        </div>
        <div className="flex items-center gap-4 text-on-surface-variant">
          <button className="hover:bg-surface-container p-2 rounded-full transition-colors relative">
            <span className="material-symbols-outlined">notifications</span>
            <span className="absolute top-2 right-2 w-2 h-2 bg-status-critical rounded-full"></span>
          </button>
          <button className="hover:bg-surface-container p-2 rounded-full transition-colors">
            <span className="material-symbols-outlined">help</span>
          </button>
          <button className="hover:bg-surface-container p-2 rounded-full transition-colors">
            <span className="material-symbols-outlined">account_circle</span>
          </button>
        </div>
      </div>
    </header>
  );
}
