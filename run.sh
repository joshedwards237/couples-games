#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/couples-wordle-pwa"
FUNCTIONS_DIR="$ROOT_DIR/functions"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$RUN_DIR/logs"

FRONTEND_PORT=5173
FUNCTIONS_PORT=5001
EMULATOR_UI_PORT=4000

mkdir -p "$RUN_DIR" "$LOG_DIR"

is_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null
}

port_in_use() {
  lsof -iTCP:"$1" -sTCP:LISTEN -n -P >/dev/null 2>&1
}

start_frontend() {
  local pid_file="$RUN_DIR/frontend.pid"
  if is_running "$pid_file"; then
    echo "[frontend] already running (pid $(cat "$pid_file"))"
    return
  fi
  if port_in_use "$FRONTEND_PORT"; then
    echo "[frontend] port $FRONTEND_PORT already in use — skipping start"
    return
  fi

  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo "[frontend] installing dependencies..."
    (cd "$FRONTEND_DIR" && npm install)
  fi

  echo "[frontend] starting Vite dev server on :$FRONTEND_PORT"
  (cd "$FRONTEND_DIR" && nohup npm run dev >"$LOG_DIR/frontend.log" 2>&1 &
   echo $! >"$pid_file")
}

start_backend() {
  local pid_file="$RUN_DIR/functions.pid"
  if is_running "$pid_file"; then
    echo "[functions] already running (pid $(cat "$pid_file"))"
    return
  fi
  if port_in_use "$FUNCTIONS_PORT"; then
    echo "[functions] port $FUNCTIONS_PORT already in use — skipping start"
    return
  fi

  if ! command -v firebase >/dev/null 2>&1; then
    echo "[functions] firebase CLI not found — skipping emulator"
    echo "           install with: npm install -g firebase-tools"
    return
  fi

  if [[ ! -d "$FUNCTIONS_DIR/node_modules" ]]; then
    echo "[functions] installing dependencies..."
    (cd "$FUNCTIONS_DIR" && npm install)
  fi

  echo "[functions] starting Firebase emulator (functions:$FUNCTIONS_PORT, ui:$EMULATOR_UI_PORT)"
  (cd "$ROOT_DIR" && nohup firebase emulators:start --only functions \
      >"$LOG_DIR/functions.log" 2>&1 &
   echo $! >"$pid_file")
}

shutdown() {
  echo ""
  echo "Shutting down services..."
  "$ROOT_DIR/stop.sh" || true
  exit 0
}

trap shutdown INT TERM

start_frontend
start_backend

echo ""
echo "Services started:"
echo "  frontend:  http://localhost:$FRONTEND_PORT"
echo "  functions: http://localhost:$FUNCTIONS_PORT   (UI: http://localhost:$EMULATOR_UI_PORT)"
echo "  frontend log: $LOG_DIR/frontend.log"
echo ""
echo "Streaming backend log (Ctrl+C to stop all services)..."
echo "────────────────────────────────────────────────────────"

# Wait briefly for the log file to exist, then stream it.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  [[ -f "$LOG_DIR/functions.log" ]] && break
  sleep 0.3
done

tail -F "$LOG_DIR/functions.log" &
TAIL_PID=$!
wait "$TAIL_PID"
