import { NavLink } from "react-router-dom";
import { Activity, Building2, Radio, Flame } from "lucide-react";

export default function Sidebar() {
  const links = [
    { to: "/", label: "Live Feed", icon: Radio },
    { to: "/fresh", label: "Fresh Jobs", icon: Flame },
    { to: "/companies", label: "Companies", icon: Building2 },
  ];

  return (
    <aside
      data-testid="sidebar"
      className="fixed left-0 top-0 h-screen w-60 bg-zinc-950 border-r border-white/5 flex flex-col z-30"
    >
      <div className="px-5 py-6 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-md bg-indigo-600 flex items-center justify-center">
          <Activity className="w-4 h-4 text-white" />
        </div>
        <span className="font-heading text-lg font-semibold tracking-tight text-zinc-100">
          ATS Pulse
        </span>
      </div>

      <nav className="flex-1 px-3 mt-2">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            data-testid={`nav-${link.label.toLowerCase().replace(/\s/g, "-")}`}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors mb-1 ${
                isActive
                  ? "bg-white/10 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5"
              }`
            }
          >
            <link.icon className="w-4 h-4" />
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-white/5">
        <p className="text-xs text-zinc-500 font-mono">v1.0 MVP</p>
      </div>
    </aside>
  );
}
