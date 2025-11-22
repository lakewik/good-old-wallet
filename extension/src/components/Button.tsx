import React from "react";
import type { ButtonProps } from "../types";

export default function Button({
  variant = "primary",
  onClick,
  children,
  disabled = false,
  type = "button",
  className = "",
}: ButtonProps) {
  const baseClass = "btn";
  const variantClass = `btn-${variant}`;
  const classes = `${baseClass} ${variantClass} ${className}`.trim();

  return (
    <button
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
