"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Brand } from "./Brand";

const LINKS = [
  { href: "/dashboard", label: "Your sessions" },
  { href: "/discover", label: "Discover" },
];

export function TopNav() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  return (
    <header className="border-b border-black/5 bg-white/70 backdrop-blur sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/dashboard">
            <Brand />
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-signal/10 text-signal"
                      : "text-ink-600/70 hover:text-ink hover:bg-black/5"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {user && <span className="text-sm text-ink-600/70 hidden sm:inline">{user.name}</span>}
          <button
            onClick={logout}
            className="text-sm font-medium text-ink-600/70 hover:text-ink transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
