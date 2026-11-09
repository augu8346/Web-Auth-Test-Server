FROM node:24-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy all files (including data/cog.tif and scripts)
COPY . .

# Expose HTTP (9480) and HTTPS (9443)
EXPOSE 9480
EXPOSE 9443

# npm prestart initializes the mounted certificate directory without rotating it.
CMD ["npm", "start"]
