export function Button({ className = '', ...props }) {
  return (
    <button
      className={`rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 ${className}`}
      {...props}
    />
  );
}
