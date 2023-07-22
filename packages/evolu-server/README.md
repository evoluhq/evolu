# Evolu Server

Node.js server for Evolu library.

Evolu is designed for privacy, ease of use, and no vendor lock-in.

## Requirements

- TypeScript 5.0 or newer
- The `strict` flag enabled in your `tsconfig.json` file

## Getting Started

```bash
npm install evolu-server
npm run build
npm start
```

## Deploy to fly.io

- https://fly.io/docs/languages-and-frameworks/node/

For quick testing, write `flyctl launch` and confirm a deployment. Note that without a Fly Volume, the database with be reset on every deployment.
