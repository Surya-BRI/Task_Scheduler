export default function AuthLayout({ children }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'linear-gradient(135deg, #f0f4ff 0%, #e8edf8 40%, #dde7f5 100%)',
      }}
    >
      {children}
    </div>
  );
}
