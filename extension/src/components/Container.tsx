import React from "react";
import type { ContainerProps } from "../types";

export function PageContainer({ children, className = "" }: ContainerProps) {
  return (
    <div className={`page-container ${className}`.trim()}>
      {children}
    </div>
  );
}

export function ContentContainer({
  children,
  className = "",
  style,
}: ContainerProps) {
  return (
    <div
      className={`content-container ${className}`.trim()}
      style={style}
    >
      {children}
    </div>
  );
}

export function ButtonGroup({ children, className = "" }: ContainerProps) {
  return (
    <div className={`button-group ${className}`.trim()}>
      {children}
    </div>
  );
}

export function InputGroup({ children, className = "" }: ContainerProps) {
  return (
    <div className={`input-group ${className}`.trim()}>
      {children}
    </div>
  );
}

