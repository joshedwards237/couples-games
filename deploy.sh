#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Couples Wordle — umbrella deploy script
# ============================================================================
# Handles:
#   1. Preflight env check (.env.production has Supabase client keys)
#   2. Typecheck (tsc --noEmit) + production build — abort on failure
#   3. Optional Supabase schema apply (psql) when --schema is passed OR when
#      schema.sql has drifted from the last-deployed hash
#   4. Firebase Hosting deploy
#   5. Prints the hosting URL
#
# Usage:
#   ./deploy.sh                 # build + Firebase deploy (warn if schema drifted)
#   ./deploy.sh --schema        # also apply Supabase schema via psql
#   ./deploy.sh --skip-schema   # ignore schema drift warning even if detected
#   ./deploy.sh --help
#
# Supabase admin DB credentials (only needed when applying schema) — accepts
# EITHER of the following in .env.deploy (gitignored) or in the environment:
#
#   (preferred, avoids URL-encoding headaches with special-char passwords)
#     PGHOST=aws-0-<region>.pooler.supabase.com
#     PGPORT=6543
#     PGUSER=postgres.<project-ref>
#     PGDATABASE=postgres
#     PGPASSWORD=your-raw-password
#
#   (legacy — auto-parsed via node URL so special chars still work if you
#    percent-encode the password)
#     SUPABASE_DB_URL=postgresql://user:pass@host:port/db
# ============================================================================

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$REPO_ROOT/couples-wordle-pwa"
ENV_FILE="$APP_DIR/.env.production"
SCHEMA_FILE="$APP_DIR/supabase/schema.sql"
SCHEMA_STATE_FILE="$APP_DIR/supabase/.schema.deployed.sha256"
DEPLOY_ENV_FILE="$REPO_ROOT/.env.deploy"

APPLY_SCHEMA=false
SKIP_SCHEMA=false

for arg in "$@"; do
  case "$arg" in
    --schema)       APPLY_SCHEMA=true ;;
    --skip-schema)  SKIP_SCHEMA=true ;;
    -h|--help)
      sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown flag: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

hr() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m⚠\033[0m  %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. Preflight — client env vars
# ---------------------------------------------------------------------------
hr "Preflight"

[[ -f "$ENV_FILE" ]] || fail ".env.production not found at $ENV_FILE"
grep -qE '^VITE_SUPABASE_URL=.+' "$ENV_FILE"      || fail "VITE_SUPABASE_URL missing from .env.production"
grep -qE '^VITE_SUPABASE_ANON_KEY=.+' "$ENV_FILE" || fail "VITE_SUPABASE_ANON_KEY missing from .env.production"
ok ".env.production has VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY"

command -v firebase >/dev/null || fail "firebase CLI not installed (npm i -g firebase-tools)"
command -v node >/dev/null     || fail "node not installed"
ok "firebase CLI + node present"

# ---------------------------------------------------------------------------
# 2. Schema drift detection
# ---------------------------------------------------------------------------
CURRENT_HASH=""
STORED_HASH=""
SCHEMA_DRIFTED=false

if [[ -f "$SCHEMA_FILE" ]]; then
  CURRENT_HASH=$(shasum -a 256 "$SCHEMA_FILE" | cut -d' ' -f1)
  [[ -f "$SCHEMA_STATE_FILE" ]] && STORED_HASH=$(cat "$SCHEMA_STATE_FILE")

  if [[ -z "$STORED_HASH" ]]; then
    warn "no record of a prior schema apply (first-time deploy or new file)"
    [[ "$APPLY_SCHEMA" = false && "$SKIP_SCHEMA" = false ]] && \
      warn "re-run with --schema to apply schema.sql, or --skip-schema to suppress this"
  elif [[ "$CURRENT_HASH" != "$STORED_HASH" ]]; then
    SCHEMA_DRIFTED=true
    warn "schema.sql has changed since last deploy"
    if [[ "$APPLY_SCHEMA" = false && "$SKIP_SCHEMA" = false ]]; then
      read -r -p "   apply schema now? [y/N] " ans
      if [[ "$ans" =~ ^[Yy]$ ]]; then
        APPLY_SCHEMA=true
      else
        warn "skipping schema apply — Firebase hosting will deploy without DB changes"
      fi
    fi
  else
    ok "schema.sql unchanged since last deploy"
  fi
fi

# ---------------------------------------------------------------------------
# 3. Pre-deploy gates — typecheck + build
# ---------------------------------------------------------------------------
hr "Typecheck"
cd "$APP_DIR"
npx tsc --noEmit
ok "tsc --noEmit clean"

hr "Build"
npm run build -- --mode production
ok "vite build succeeded"

# ---------------------------------------------------------------------------
# 4. Apply Supabase schema (optional)
# ---------------------------------------------------------------------------
if [[ "$APPLY_SCHEMA" = true ]]; then
  hr "Supabase schema"

  # Load .env.deploy if present so PG* / SUPABASE_DB_URL populate the env.
  if [[ -f "$DEPLOY_ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    set -a; source "$DEPLOY_ENV_FILE"; set +a
  fi

  # If individual PG* vars aren't set but SUPABASE_DB_URL is, parse the URL
  # via node (which URL-decodes the userinfo correctly — bash parsing breaks
  # on passwords containing :/@#?&%).
  if [[ -z "${PGHOST:-}" && -n "${SUPABASE_DB_URL:-}" ]]; then
    command -v node >/dev/null || fail "node required to parse SUPABASE_DB_URL"
    # Emit shell-safe KEY='value' lines; eval to export.
    # shellcheck disable=SC2046
    eval "$(node -e '
      const u = new URL(process.argv[1]);
      const q = (s) => "\x27" + String(s).replace(/\x27/g, "\x27\\\x27\x27") + "\x27";
      console.log("export PGHOST="     + q(u.hostname));
      console.log("export PGPORT="     + q(u.port || 5432));
      console.log("export PGUSER="     + q(decodeURIComponent(u.username)));
      console.log("export PGPASSWORD=" + q(decodeURIComponent(u.password)));
      console.log("export PGDATABASE=" + q(u.pathname.replace(/^\//, "") || "postgres"));
    ' "$SUPABASE_DB_URL")"
  fi

  if [[ -z "${PGHOST:-}" || -z "${PGUSER:-}" || -z "${PGPASSWORD:-}" ]]; then
    warn "no DB credentials found"
    echo "   Add to $DEPLOY_ENV_FILE (gitignored):"
    echo "     PGHOST=aws-0-<region>.pooler.supabase.com"
    echo "     PGPORT=6543"
    echo "     PGUSER=postgres.<project-ref>"
    echo "     PGDATABASE=postgres"
    echo "     PGPASSWORD=your-raw-password"
    echo "   (or legacy: SUPABASE_DB_URL=postgresql://user:pass@host:port/db)"
    fail "cannot apply schema without credentials"
  fi

  : "${PGPORT:=6543}"
  : "${PGDATABASE:=postgres}"
  export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

  command -v psql >/dev/null || fail "psql not installed (brew install libpq && brew link --force libpq)"

  echo "  applying $SCHEMA_FILE to $PGUSER@$PGHOST:$PGPORT/$PGDATABASE …"
  psql -v ON_ERROR_STOP=1 -f "$SCHEMA_FILE" >/dev/null
  echo "$CURRENT_HASH" > "$SCHEMA_STATE_FILE"
  ok "schema applied; recorded hash in $(basename "$SCHEMA_STATE_FILE")"
elif [[ "$SCHEMA_DRIFTED" = true ]]; then
  warn "deploying hosting without applying drifted schema — clients may hit errors"
fi

# ---------------------------------------------------------------------------
# 5. Firebase Hosting deploy
# ---------------------------------------------------------------------------
hr "Firebase Hosting"
cd "$REPO_ROOT"
firebase deploy --only hosting --non-interactive

# ---------------------------------------------------------------------------
# 6. Print hosting URL
# ---------------------------------------------------------------------------
PROJECT_ID=$(node -e "try { console.log(require('./.firebaserc').projects.default) } catch (e) { process.exit(1) }" 2>/dev/null || true)

hr "Done"
if [[ -n "$PROJECT_ID" ]]; then
  printf '  🌐 https://%s.web.app\n' "$PROJECT_ID"
  printf '  🌐 https://%s.firebaseapp.com\n' "$PROJECT_ID"
else
  warn "could not read project id from .firebaserc — check 'firebase hosting:channel:list'"
fi
