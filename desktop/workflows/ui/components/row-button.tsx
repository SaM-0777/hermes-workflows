import type { ButtonHTMLAttributes } from "react";

export function RowButton({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={className}
      data-slot="row-button"
      type={type}
    />
  );
}
