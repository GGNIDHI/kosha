#!/bin/bash
set -e

# Detect node in standard paths first
if [ -f "/opt/homebrew/bin/node" ]; then
    NODE_CMD="/opt/homebrew/bin/node"
elif [ -f "/usr/local/bin/node" ]; then
    NODE_CMD="/usr/local/bin/node"
elif command -v node >/dev/null 2>&1; then
    NODE_CMD="node"
else
    echo "Global Node not found. Bootstrapping temporary portable Node.js..."
    if [ ! -f "node-portable/bin/node" ]; then
        ARCH=$(uname -m)
        if [ "$ARCH" = "arm64" ]; then
            NODE_URL="https://nodejs.org/dist/v22.11.0/node-v22.11.0-darwin-arm64.tar.gz"
        else
            NODE_URL="https://nodejs.org/dist/v22.11.0/node-v22.11.0-darwin-x64.tar.gz"
        fi
        mkdir -p node-portable
        curl -sSL "$NODE_URL" | tar -xz -C node-portable --strip-components=1
    fi
    NODE_CMD="./node-portable/bin/node"
fi

# Run the setup server in the background and log output to setup-server.log
nohup "$NODE_CMD" setup-server.cjs >setup-server.log 2>&1 </dev/null &
echo "Setup server bootstrapped successfully."
exit 0


