FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy all files (including data/cog.tif and scripts)
COPY . .

# Generate the mock certificates so the container is ready out of the box
RUN npm run generate-certs

# Expose HTTP (9480) and HTTPS (9443)
EXPOSE 9480
EXPOSE 9443

# Start the server
CMD ["npm", "start"]
