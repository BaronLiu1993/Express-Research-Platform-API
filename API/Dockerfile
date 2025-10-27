# Use official Node image
FROM node:alpine

# Set working directory
WORKDIR /app

# Copy all files
COPY . .

# Install dependencies
RUN npm install

# Start the app
CMD ["npm", "start"]

# Expose port
EXPOSE 443