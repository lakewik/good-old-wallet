export type ButtonVariant = "primary" | "text";

export interface ButtonProps {
  variant?: ButtonVariant;
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  className?: string;
}

export interface InputProps {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "password" | "textarea";
  rows?: number; // Only applies when type is "textarea"
  disabled?: boolean;
  className?: string;
}

export interface LogoProps {
  src: string;
  alt: string;
  className?: string;
}

export interface ContainerProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

