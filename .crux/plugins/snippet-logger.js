const fs = require('fs');
const path = require('path');

module.exports = {
  name: "Snippet Logger",
  description: "Registra código generado en .crux/snippets/.",
  version: "1.0.0",

  onToolUse: async (toolName, args) => {
    if (toolName !== 'write_file' && toolName !== 'edit_file') return args;
    const content = args.content || args.new_content || '';
    if (!content || content.length < 20) return args;

    const snippetsDir = path.join(process.cwd(), '.crux', 'snippets');
    if (!fs.existsSync(snippetsDir)) fs.mkdirSync(snippetsDir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(snippetsDir, `snippet-${ts}.log`);
    const entry = `=== ${new Date().toISOString()} | Tool: ${toolName} | File: ${args.path || 'unknown'} ===\n${content}\n\n`;
    fs.appendFileSync(file, entry, 'utf8');
    return args;
  }
};