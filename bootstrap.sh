#!/bin/bash
set -e

# Checks if Node is installed globally. If not, bootstraps a temporary node binary to run the setup server.
NODE_CMD="node"

if ! command -v node >/dev/null 2>&1; then
    echo "Global Node not found. Bootstrapping temporary portable Node.js..."
    if [ ! -f "/tmp/node-portable/bin/node" ]; then
        ARCH=$(uname -m)
        if [ "$ARCH" = "arm64" ]; then
            NODE_URL="https://nodejs.org/dist/v22.11.0/node-v22.11.0-darwin-arm64.tar.gz"
        else
            NODE_URL="https://nodejs.org/dist/v22.11.0/node-v22.11.0-darwin-x64.tar.gz"
        fi
        mkdir -p /tmp/node-portable
        curl -sSL "$NODE_URL" | tar -xz -C /tmp/node-portable --strip-components=1
    fi
    NODE_CMD="/tmp/node-portable/bin/node"
fi

# Run the setup server in the background and exit immediately so AppleScript doesn't hang
nohup "$NODE_CMD" setup-server.js >/dev/null 2>&1 &
echo "Setup server bootstrapped successfully."
exit 0
