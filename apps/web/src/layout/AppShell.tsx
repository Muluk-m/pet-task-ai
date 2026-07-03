import { ClipboardList, Images, Sparkles, UserRound } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { cn } from "../lib/utils";

const leftTabs = [
  { to: "/", label: "任务", icon: ClipboardList },
  { to: "/materials", label: "素材", icon: Images },
] as const;

const rightTabs = [
  { to: "/settings", label: "我的", icon: UserRound },
] as const;

function TabLink({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: typeof ClipboardList;
}) {
  return (
    <NavLink
      className={({ isActive }) =>
        cn(
          "flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground",
          isActive && "font-medium text-primary",
        )
      }
      end={to === "/"}
      to={to}
    >
      <Icon size={22} strokeWidth={1.8} />
      {label}
    </NavLink>
  );
}

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const generateActive = location.pathname.startsWith("/generate");

  return (
    <div className="min-h-dvh">
      <div className="mx-auto w-full max-w-[560px]">
        <Outlet />
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto grid max-w-[560px] grid-cols-4 items-end px-2 pb-safe">
          {leftTabs.map((tab) => (
            <TabLink key={tab.to} {...tab} />
          ))}
          <div className="relative flex flex-col items-center pb-1.5 pt-2">
            <button
              className={cn(
                "relative -top-5 flex size-14 items-center justify-center rounded-full bg-fab text-white shadow-lg shadow-fab/40 active:scale-95",
                generateActive && "ring-4 ring-fab/25",
              )}
              type="button"
              onClick={() => navigate("/generate")}
            >
              <Sparkles size={24} />
            </button>
            <span
              className={cn(
                "-mt-4 text-[11px] text-muted-foreground",
                generateActive && "font-medium text-fab",
              )}
            >
              生成
            </span>
          </div>
          {rightTabs.map((tab) => (
            <TabLink key={tab.to} {...tab} />
          ))}
        </div>
      </nav>
    </div>
  );
}
