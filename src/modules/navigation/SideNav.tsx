"use client";

import { useState } from "react";
import { Database, LogOut, PanelLeftClose, PanelLeftOpen, ReceiptText, UserCircle } from "lucide-react";

type SelectedView = "profile" | "transactions" | "metadata";

type SideNavUser = {
  displayName: string;
  email: string;
};

export function SideNav({
  currentUser,
  initialCollapsed = false,
  logoutAction,
  selectedView
}: {
  currentUser: SideNavUser;
  initialCollapsed?: boolean;
  logoutAction: () => Promise<void>;
  selectedView: SelectedView;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  return (
    <aside className={collapsed ? "side-nav is-collapsed" : "side-nav"} aria-label="Primary navigation">
      <button
        type="button"
        className="side-nav-toggle"
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand side navigation" : "Collapse side navigation"}
        title={collapsed ? "Expand side navigation" : "Collapse side navigation"}
        onClick={() => setCollapsed((value) => !value)}
      >
        {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
        <span className="side-nav-label">{collapsed ? "Expand" : "Collapse"}</span>
      </button>

      {!collapsed ? (
        <div className="side-nav-user">
          <span>{currentUser.displayName}</span>
          <small>{currentUser.email}</small>
        </div>
      ) : null}

      <nav>
        <a
          className={selectedView === "profile" ? "is-active" : ""}
          href="/?view=profile"
          aria-label="User profile"
          title="User profile"
        >
          <UserCircle size={18} aria-hidden="true" />
          <span className="side-nav-label">User profile</span>
        </a>
        <a
          className={selectedView === "transactions" ? "is-active" : ""}
          href="/"
          aria-label="Transactions"
          title="Transactions"
        >
          <ReceiptText size={18} aria-hidden="true" />
          <span className="side-nav-label">Transactions</span>
        </a>
        <a
          className={selectedView === "metadata" ? "is-active" : ""}
          href="/?view=metadata"
          aria-label="Metadata"
          title="Metadata"
        >
          <Database size={18} aria-hidden="true" />
          <span className="side-nav-label">Metadata</span>
        </a>
      </nav>
      <form action={logoutAction}>
        <button type="submit" aria-label="Logout" title="Logout">
          <LogOut size={18} aria-hidden="true" />
          <span className="side-nav-label">Logout</span>
        </button>
      </form>
    </aside>
  );
}
