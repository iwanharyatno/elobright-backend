# Dockerfile
FROM node:18-alpine

RUN apk update && apk add curl && rm -rf /var/cache/apk/*

WORKDIR /usr/src/app

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile

COPY . .

RUN yarn build

EXPOSE 3000

CMD ["yarn", "start"]
