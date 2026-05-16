const BLOCKED = [
  /rm\s+-rf\s+\//, /rm\s+-rf\s+~/, /DROP\s+TABLE/i,
  /DROP\s+DATABASE/i, /DELETE\s+FROM\s+\w+\s*;?$/i,
  /format\s+c:/i, /mkfs/i, /dd\s+if=.*of=/dev//i,
];

module.exports = {
  name: "Security Enforcer",
  description: "Bloquea comandos destructivos del agente.",
  version: "1.2.0",

  onToolUse: async (toolName, args) => {
    if (toolName !== 'run_command' && toolName !== 'terminal') return args;
    const cmd = args.command || args.cmd || '';
    for (const pattern of BLOCKED) {
      if (pattern.test(cmd)) {
        console.error(`[SecurityEnforcer] BLOCKED dangerous command: ${cmd}`);
        throw new Error(`[SecurityEnforcer] Comando bloqueado por política de seguridad: ${cmd}`);
      }
    }
    return args;
  }
};