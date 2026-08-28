# Use official Node.js image as base (bookworm for newer compilers)
FROM node:20-bookworm

# Install Compilers (Python, Java, C++) and sudo
RUN apt-get update && \
    apt-get install -y python3 default-jdk g++ sudo && \
    rm -rf /var/lib/apt/lists/*

# Create a restricted user for running code
RUN useradd -M -s /bin/false coderunner

# Configure sudo so the 'node' user can run commands as 'coderunner' without a password
RUN echo "node ALL=(coderunner) NOPASSWD: ALL" >> /etc/sudoers

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all backend source code
COPY . .

# Ensure the /app directory is strictly owned by the 'node' user
# and block all other users (like coderunner) from reading it.
# 750 = Owner (node) can rwx, Group (node) can r-x, Others (coderunner) get NOTHING.
RUN chown -R node:node /app && chmod -R 750 /app

# Switch to the non-root 'node' user to run the backend securely
USER node

# Expose backend port
EXPOSE 5001

# Start the server
CMD ["npm", "start"]
