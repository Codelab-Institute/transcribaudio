import Link from "next/link";

type Props = {
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
  home?: { label: string; href: string };
};

// Shared card for error.tsx / not-found.tsx so failures don't dead-end on
// Next's default screen.
export function ErrorPanel({ title, message, action, home }: Props) {
  return (
    <main className="min-h-screen bg-slate-50 flex items-start justify-center pt-16 px-4 pb-16">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center space-y-4">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {message && <p className="text-sm text-slate-500">{message}</p>}
        <div className="flex items-center justify-center gap-3 pt-2">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {action.label}
            </button>
          )}
          {home && (
            <Link
              href={home.href}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
            >
              {home.label}
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
