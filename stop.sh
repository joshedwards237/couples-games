#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT_DIR/.run"

FRONTEND_PORT=5173
FUNCTIONS_PORT=5001
EMULATOR_UI_PORT=4000
EMULATOR_HUB_PORT=4400
EMULATOR_LOGGING_PORT=4500

stop_pid_file() {
  local name="$1"
  local pid_file="$RUN_DIR/$name.pid"
  if [[ ! -f "$pid_file" ]]; then
    echo "[$name] no pid file"
    return
  fi
  local pid
  pid="$(cat "$pid_file")"
  if kill -0 "$pid" 2>/dev/null; then
    echo "[$name] stopping pid $pid (and children)"
    pkill -TERM -P "$pid" 2>/dev/null || true
    kill -TERM "$pid" 2>/dev/null || true
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
      echo "[$name] force-killing pid $pid"
      pkill -KILL -P "$pid" 2>/dev/null || true
      kill -KILL "$pid" 2>/dev/null || true
    fi
  else
    echo "[$name] pid $pid not running"
  fi
  rm -f "$pid_file"
}

free_port() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "[port $port] killing stray listeners: $pids"
    kill -TERM $pids 2>/dev/null || true
    sleep 1
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      kill -KILL $pids 2>/dev/null || true
    fi
  fi
}

stop_pid_file frontend
stop_pid_file functions

for port in "$FRONTEND_PORT" "$FUNCTIONS_PORT" "$EMULATOR_UI_PORT" \
            "$EMULATOR_HUB_PORT" "$EMULATOR_LOGGING_PORT"; do
  free_port "$port"
done

echo ""
echo "All services stopped."
