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

WORKDIR /home/node/app

#MANUALLY LINK PACKAGES TO REDUCE THE DOCKER IMAGE SIZE
RUN mkdir /home/node/app/packages/evolu-server/node_modules/effect/
RUN mkdir /home/node/app/packages/evolu-common/node_modules/effect/
RUN mkdir /home/node/app/packages/evolu-common/node_modules/@effect/
RUN cp -r /home/node/app/node_modules/effect/* /home/node/app/packages/evolu-server/node_modules/effect/
RUN cp -r /home/node/app/node_modules/effect/* /home/node/app/packages/evolu-common/node_modules/effect/
RUN cp -r /home/node/app/node_modules/@effect/* /home/node/app/packages/evolu-common/node_modules/@effect/

RUN mkdir /home/node/app/packages/evolu-common/node_modules/@noble/
RUN mv /home/node/app/node_modules/@noble/* /home/node/app/packages/evolu-common/node_modules/@noble/

RUN mkdir /home/node/app/packages/evolu-common/node_modules/@protobuf-ts/
RUN mv /home/node/app/node_modules/@protobuf-ts/* /home/node/app/packages/evolu-common/node_modules/@protobuf-ts/

RUN mkdir /home/node/app/packages/evolu-common/node_modules/@scure/
RUN mv /home/node/app/node_modules/@scure/* /home/node/app/packages/evolu-common/node_modules/@scure/

RUN mkdir /home/node/app/packages/evolu-common/node_modules/fast-check/
RUN mv /home/node/app/node_modules/fast-check/* /home/node/app/packages/evolu-common/node_modules/fast-check/

RUN mkdir /home/node/app/packages/evolu-common/node_modules/find-my-way-ts/
RUN mv /home/node/app/node_modules/find-my-way-ts/* /home/node/app/packages/evolu-common/node_modules/find-my-way-ts/

RUN mkdir /home/node/app/packages/evolu-common/node_modules/path-browserify/
RUN mv /home/node/app/node_modules/path-browserify/* /home/node/app/packages/evolu-common/node_modules/path-browserify/

RUN mkdir /home/node/app/packages/evolu-common/node_modules/multipasta/
RUN mv /home/node/app/node_modules/multipasta/* /home/node/app/packages/evolu-common/node_modules/multipasta/

RUN mkdir /home/node/app/packages/evolu-common/node_modules/pure-rand/
RUN mv /home/node/app/node_modules/pure-rand/* /home/node/app/packages/evolu-common/node_modules/pure-rand/

RUN mkdir /home/node/app/packages/evolu-common/node_modules/fast-querystring/
RUN mv /home/node/app/node_modules/fast-querystring/* /home/node/app/packages/evolu-common/node_modules/fast-querystring/

RUN mkdir /home/node/app/packages/evolu-common/node_modules/fast-decode-uri-component/
RUN mv /home/node/app/node_modules/fast-decode-uri-component/* /home/node/app/packages/evolu-common/node_modules/fast-decode-uri-component/
RUN mkdir /home/node/app/packages/evolu-server/node_modules/kysely/
RUN mkdir /home/node/app/packages/evolu-common/node_modules/kysely/
RUN cp -r /home/node/app/node_modules/kysely/* /home/node/app/packages/evolu-server/node_modules/kysely/
RUN cp -r /home/node/app/node_modules/kysely/* /home/node/app/packages/evolu-common/node_modules/kysely/

RUN mkdir /home/node/app/packages/evolu-server/node_modules/better-sqlite3/
RUN mv /home/node/app/node_modules/better-sqlite3/* /home/node/app/packages/evolu-server/node_modules/better-sqlite3/

RUN mkdir /home/node/app/packages/evolu-server/node_modules/express/
RUN mv /home/node/app/node_modules/express/* /home/node/app/packages/evolu-server/node_modules/express/

RUN mkdir /home/node/app/packages/evolu-server/node_modules/body-parser/
RUN mv /home/node/app/node_modules/body-parser/* /home/node/app/packages/evolu-server/node_modules/body-parser/

RUN mkdir /home/node/app/packages/evolu-server/node_modules/depd/
RUN mv /home/node/app/node_modules/depd/* /home/node/app/packages/evolu-server/node_modules/depd/

RUN mkdir /home/node/app/packages/evolu-server/node_modules/vary/
RUN mv /home/node/app/node_modules/vary/* /home/node/app/packages/evolu-server/node_modules/vary/

RUN mkdir /home/node/app/packages/evolu-server/node_modules/cors/
RUN mv /home/node/app/node_modules/cors/* /home/node/app/packages/evolu-server/node_modules/cors/

RUN mkdir /home/node/app/packages/evolu-server/node_modules/ws/
RUN mv /home/node/app/node_modules/ws/* /home/node/app/packages/evolu-server/node_modules/ws/

RUN mkdir /home/node/app/packages/evolu-server/node_modules/object-assign/
RUN mv /home/node/app/node_modules/object-assign/* /home/node/app/packages/evolu-server/node_modules/object-assign/

RUN mkdir /home/node/app/packages/evolu-server/node_modules/bindings/
RUN mv /home/node/app/node_modules/bindings/* /home/node/app/packages/evolu-server/node_modules/bindings/

RUN mkdir /home/node/app/packages/evolu-server/node_modules/prebuild-install/
RUN mv /home/node/app/node_modules/prebuild-install/* /home/node/app/packages/evolu-server/node_modules/prebuild-install/

RUN mkdir /home/node/app/packages/evolu-server/node_modules/file-uri-to-path/
RUN mv /home/node/app/node_modules/file-uri-to-path/* /home/node/app/packages/evolu-server/node_modules/file-uri-to-path/

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