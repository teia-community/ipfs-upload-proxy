FROM node:21

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY . /usr/src/app
RUN npm i

CMD [ "npm", "run", "start" ]
