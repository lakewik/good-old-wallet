import React from "react";
import type { LogoProps } from "../types";

export default function Logo({
  src,
  alt,
  className = "",
}: LogoProps) {
  return (
    <div className="logo-container">
      <img src={src} alt={alt} className={`logo ${className}`.trim()} />
    </div>
  );
}

