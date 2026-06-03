FROM node:24

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY . /usr/src/app
RUN npm ci

CMD [ "npm", "run", "start" ]
