FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# ข้อมูลร้าน (ฐานข้อมูลและรูป) เก็บในโฟลเดอร์ /data ควร mount volume ไว้
ENV DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 3000
CMD ["npm", "start"]
