// ============================================================================
// Crux-Webmail Frontend — PostCSS Config
// ============================================================================
// Procesa las directivas @tailwind de los CSS globales. Sin esto, Next no
// genera ninguna clase utilitaria y la app se renderiza sin estilos.
// ============================================================================

module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
