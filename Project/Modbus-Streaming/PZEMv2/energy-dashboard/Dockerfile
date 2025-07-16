# Use official Node.js LTS image
FROM node:22

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all project files
COPY . .

# Expose port (default 3000, can be changed via env)
EXPOSE 3000

# Set environment variables (optional, can override at runtime)
# ENV NODE_ENV=production

# Start the server
CMD ["node", "server.js"]