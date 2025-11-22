import React from "react";

interface TitleProps {
  children: React.ReactNode;
  className?: string;
}

export default function Title({ children, className = "" }: TitleProps) {
  return <h1 className={`wallet-title ${className}`.trim()}>{children}</h1>;
}
