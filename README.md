# Meditree

## Get Started

### Backend

Install the dependencies of `backend` subprojects.
Then run `npm start` to start the server.

```shell
cd backend
npm install
npm start
```

At the first time you start the server,
it will throw an error and require you to configure it,
then a file called `meditree.json` will be created in the root.

### Frontend Website

Install the dependencies of `meditree` subprojects.
Create a `.env.local` file in the root, and config it based on `.env` file.
Then run `npm run dev` to start the website.

```shell
cd web
npm install
npm run dev
```

You can configure the host and port in the [Vite config file](/web/vite.config.js).
