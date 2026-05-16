const { execSync } = require('child_process');
const path = require('path');

module.exports = {
  name: "Auto Formatter",
  description: "Ejecuta Prettier/ESLint después de que el agente escribe archivos.",
  version: "1.0.0",

  onToolUse: async (toolName, args) => {
    if (toolName !== 'write_file' && toolName !== 'edit_file') return args;
    const filePath = args.path || args.file_path || '';
    if (!filePath) return args;

    const ext = path.extname(filePath);
    const fmtExts = ['.js', '.ts', '.jsx', '.tsx', '.json', '.css', '.html'];
    if (!fmtExts.includes(ext)) return args;

    try {
      execSync(`npx prettier --write "${filePath}" 2>/dev/null || true`, { timeout: 5000 });
      console.log('[AutoFormatter] Formatted:', filePath);
    } catch (e) { /* formatter not available */ }
    return args;
  }
};