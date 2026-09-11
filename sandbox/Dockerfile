FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PORT=2000
ENV NODE_ENV=production

# 1. Install system compilers, runtimes, security and network tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    build-essential \
    openjdk-17-jdk-headless \
    python3 \
    iptables \
    iproute2 \
    procps \
    util-linux \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

# 2. Install Node.js 20 LTS
RUN mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# 3. Create unprivileged sandbox user (UID 1001) for isolated code execution
RUN useradd -u 1001 -m -s /bin/bash sandbox_user

# 4. Set up application directory
WORKDIR /app

# Copy dependency definition and install
COPY package.json ./
RUN npm install --omit=dev

# Copy application code
COPY server.js ./
COPY runners/ ./runners/
COPY entrypoint.sh ./

# Fix permissions and line endings
RUN chmod +x entrypoint.sh \
    && sed -i 's/\r$//' entrypoint.sh

# 5. Production Healthcheck (dynamically resolves to container's configured $PORT)
HEALTHCHECK --interval=20s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f "http://127.0.0.1:${PORT}/health" || exit 1

EXPOSE ${PORT}

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["dumb-init", "node", "server.js"]
