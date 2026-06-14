export function Input({ className = '', ...props }) {
  return (
    <input
      className={`ui-input ${className}`}
      {...props}
    />
  );
}
