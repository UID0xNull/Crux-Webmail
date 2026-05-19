import yaml

file_path = r"d:\Github\Crux-Webmail\docker-compose.prod.yml"

with open(file_path, encoding="utf-8") as f:
    data = yaml.safe_load(f)

services = data.get("services", {})
if not services:
    print("ERROR: No 'services' section in docker-compose.prod.yml")
else:
    # Validate depends_on references
    for svc_name, svc_conf in services.items():
        deps_raw = svc_conf.get("depends_on", None) or {}

        dep_names = set()

        if isinstance(deps_raw, list):
            dep_names = set(str(d) for d in deps_raw)
        elif isinstance(deps_raw, dict):
            dep_names = set(deps_raw.keys())

        unknown_deps = dep_names - set(services.keys())
        if unknown_deps:
            print(f"SERVICE [{svc_name}]: depends_on references undefined services: {unknown_deps}")

    # Validate secrets used are declared globally
    global_secrets = set(data.get("secrets", {}).keys()) or set()
    for svc_name, svc_conf in services.items():
        secrets_used = svc_conf.get("secrets") or []

        if isinstance(secrets_used, list):
            simple_names = {s["secret"] if isinstance(s, dict) else str(s).split("_")[0].strip() for s in secrets_used}
            # Normalize: often defined as top-level keys like 'jwt_secret'
            names = set()
            for s in secrets_used:
                v = s.get("source", str(s)) if isinstance(s, dict) else str(s)
                names.add(str(v).split("_")[0].strip())

            # A simpler check: assume top-level keys match source name directly (e.g., jwt_secret, postgres_password).
            raw_names = {s if isinstance(s, str) else s.get("source") for s in secrets_used}
            missing = set(raw_names) - global_secrets
            if missing:
                print(f"SERVICE [{svc_name}]: uses undeclared secret(s): {missing}")

print("YAML load OK.")