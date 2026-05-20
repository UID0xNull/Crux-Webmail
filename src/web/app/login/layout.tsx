'use client';

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020418] text-white antialiased">
      {/* Global keyframes */}
      <style>{`
        @keyframes aurora-a {
          0%   { transform: translate3d(-25%, -15%) rotate(0deg) scale(1); }
          33%  { transform: translate3d(5%, -30%) rotate(40deg) scale(1.16); }
          66%  { transform: translate3d(-15%, -8%) rotate(110deg) scale(1.02); }
          100% { transform: translate3d(-25%, -15%) rotate(0deg) scale(1); }
        }
        @keyframes aurora-b {
          0%   { transform: translate3d(20%, 25%) rotate(0deg) scale(1.04); }
          33%  { transform: translate3d(-18%, 16%) rotate(-40deg) scale(0.96); }
          66%  { transform: translate3d(12%, -15%) rotate(70deg) scale(1.09); }
          100% { transform: translate3d(20%, 25%) rotate(0deg) scale(1.04); }
        }
        @keyframes float-slow {
          0%,100% { transform: translateY(0); opacity:.18; }
          50%     { transform: translateY(-16px); opacity:.28; }
        }
        @keyframes pulse-glow {
          0%,100% { box-shadow: 0 0 35px rgba(124,92,255,.28), 0 0 80px rgba(76,201,240,.12); }
          50%     { box-shadow: 0 0 48px rgba(124,92,255,.38), 0 0 110px rgba(76,201,240,.22); }
        }
      `}</style>

      {/* Aurora / Nebula backgrounds */}
      <div className="pointer-events-none absolute inset-0">
        {/* Left aurora (purple-blue) */}
        <div
          className="absolute -left-[26%] -top-[18%] h-[140vmax] w-[135vmax] opacity-[.36] blur-[90px]"
          style={{
            background:
              'radial-gradient(circle at 30% 20%, rgba(139,92,246,.9), transparent 48%), radial-gradient(circle at 70% 25%, rgba(59,130,246,.9), transparent 48%)',
            animation: 'aurora-a 42s ease-in-out infinite alternate',
          }}
        />
        {/* Right aurora (cyan-pink) */}
        <div
          className="absolute -right-[28%] -bottom-[18%] h-[150vmax] w-[148vmax] opacity-[.30] blur-[95px]"
          style={{
            background:
              'radial-gradient(circle at 70% 18%, rgba(6,182,212,.8), transparent 48%), radial-gradient(circle at 25% 70%, rgba(236,72,153,.8), transparent 50%)',
            animation: 'aurora-b 50s ease-in-out infinite alternate',
          }}
        />

        {/* Ultra-wide color smear */}
        <div
          className="absolute left-1/2 top-[16%] h-[140vmax] w-[170vmax] -translate-x-1/2 opacity-[.18] blur-[160px]"
          style={{
            background:
              'radial-gradient(circle at 35% 25%, rgba(15,23,42,.9), transparent 40%), radial-gradient(circle at 72% 15%, rgba(15,23,42,.8), transparent 40%)',
          }}
        />

        {/* Subtle mesh grid (sci-fi HUD feel) */}
        <div
          className="absolute inset-0 opacity-[.06]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(148,163,253,.9) 1px, transparent 1px),
              linear-gradient(90deg, rgba(148,163,253,.9) 1px, transparent 1px)
            `,
            backgroundSize: '72px 72px',
          }}
        />

        {/* Floating particles */}
        <div className="absolute inset-0">
          {[...Array(24)].map((_, i) => (
            <span
              key={i}
              className="absolute rounded-full bg-gradient-to-t from-cyan-300/90 to-violet-400/90"
              style={{
                left: `${Math.round(Math.random() * 100)}%`,
                top: `${Math.round(Math.random() * 100)}%`,
                width: '2px',
                height: '2px',
                animationDuration: '4s,6s,8s'.split(',').join('') , // hint for variety (will vary via random in browser)
                animationDelay: `${(i * 0.7).toFixed(1)}s`,
                animationTimingFunction: 'ease-in-out',
                animationIterationCount: 'infinite',
              }}
            >
              <style>{`@keyframes float-slow {
                  0%,100%{transform:translateY(0);opacity:.18}
                  50%{transform:translateY(-16px);opacity:.28}
                }`}
              </style>
            </span>
          ))}
        </div>

        {/* Top scanline bar */}
        <div className="absolute left-0 right-0 top-0 h-[35vh] bg-gradient-to-b from-cyan-950/24 to-transparent" />
      </div>

      {/* Main content area – center vertically & horizontally */}
      <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
        {/* Children (login card) are constrained and centered. */}
        <div className="w-full max-w-[456px]">{children}</div>
      </main>
    </div>
  );
}