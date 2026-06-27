# Aurora API — NestJS + Prisma
FROM node:22-alpine

WORKDIR /app

# install deps (incl. dev — needed for nest build, prisma CLI, ts-node seed)
COPY package*.json ./
RUN npm ci

# prisma client + app build
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000

# push schema to the DB, then boot the API
COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["entrypoint.sh"]
