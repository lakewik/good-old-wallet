import React from "react";
import type { InputProps } from "../types";

export default function Input({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  rows = 4,
  disabled = false,
  className = "",
  onKeyDown,
  autoFocus = false,
}: InputProps) {
  const inputId = id || `input-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className={`input-section ${className}`.trim()}>
      <label htmlFor={inputId} className="input-label">
        {label}
      </label>
      {type === "textarea" ? (
        <textarea
          id={inputId}
          className="input-field input-textarea"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          rows={rows}
          autoFocus={autoFocus}
        />
      ) : (
        <input
          id={inputId}
          type={type}
          className="input-field"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          autoFocus={autoFocus}
        />
      )}
    </div>
  );
}
