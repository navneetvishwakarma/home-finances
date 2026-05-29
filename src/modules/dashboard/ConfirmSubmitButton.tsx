"use client";

import React from "react";
import type { ReactNode } from "react";

export function ConfirmSubmitButton({
  className,
  confirmMessage,
  children,
  ariaLabel
}: {
  className?: string;
  confirmMessage: string;
  children: ReactNode;
  ariaLabel: string;
}) {
  return (
    <button
      className={className}
      type="submit"
      aria-label={ariaLabel}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
