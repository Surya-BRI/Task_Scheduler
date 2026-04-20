import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 ${className}`}
      {...props}
    />
  );
}
