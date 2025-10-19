# Use official Node image
FROM node:18

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