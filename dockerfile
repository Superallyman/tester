FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build  # This is the crucial missing step

EXPOSE 3000

CMD ["npm", "run", "start"] # Or "next start" if you prefer