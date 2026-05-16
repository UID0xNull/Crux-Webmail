'use client';

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a1a]">
      {/* Animated background gradient */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -left-1/4 -top-1/4 h-[150vmax] w-[150vmax] animate-[spin_60s_linear_infinite] opacity-30"
          style={{
            background:
              'conic-gradient(from 180deg at 50% 50%, #6366f1 0deg, #8b5cf6 60deg, #ec4899 120deg, #6366f1 180deg, #8b5cf6 240deg, #ec4899 300deg, #6366f1 360deg)',
            filter: 'blur(100px)',
          }}
        />
        <div
          className="absolute -right-1/4 -bottom-1/4 h-[150vmax] w-[150vmax] animate-[spin_45s_linear_infinite_reverse] opacity-20"
          style={{
            background:
              'conic-gradient(from 0deg at 50% 50%, #06b6d4 0deg, #3b82f6 90deg, #6366f1 180deg, #06b6d4 270deg, #3b82f6 360deg)',
            filter: 'blur(120px)',
          }}
        />
        {/* Mesh grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Glassmorphism content area */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}