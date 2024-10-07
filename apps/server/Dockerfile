FROM node:20-alpine AS builder

RUN mkdir -p /home/node/app

ENV NPM_CONFIG_PREFIX=/home/node/.npm-global

ENV PATH=$PATH:/home/node/.npm-global/bin 

WORKDIR /home/node/app

RUN npm i -g pnpm

RUN ls -l /home/node/.npm-global

COPY . /home/node/app/

RUN ls -l /home/node/app/

RUN pnpm i --shamefully-hoist

RUN pnpm build

RUN rm -rf /home/node/app/apps/server/.dockerignore

RUN ls /home/node/app/node_modules/

#EXPRESS LINKING FIX
RUN npm i -g express

RUN ls -l /home/node/.npm-global/lib/node_modules/

RUN rm -rf /home/node/app/packages/evolu-server/node_modules/express

RUN cp -r /home/node/.npm-global/lib/node_modules/express /home/node/app/packages/evolu-server/node_modules/

WORKDIR /home/node/.npm-global/lib/node_modules/express

RUN yarn

WORKDIR /home/node/app

RUN cp -r /home/node/.npm-global/lib/node_modules/express/node_modules/* /home/node/app/packages/evolu-server/node_modules/

FROM node:20-alpine

ENV PORT=4000

COPY --from=builder /home/node/app/apps/server /home/node/app/apps/server

COPY --from=builder /home/node/app/packages/evolu-server /home/node/app/packages/evolu-server

COPY --from=builder /home/node/app/packages/evolu-common /home/node/app/packages/evolu-common

RUN cd /home/node/app/apps/server

WORKDIR /home/node/app/

RUN ls -l /home/node/app/packages/evolu-server/node_modules

RUN cat /home/node/app/apps/server/package.json

WORKDIR /home/node/app/apps/server

EXPOSE $PORT

CMD [ "npm", "start" ]