// The snapshot function lives in web/api (where Vercel looks when the project's Root Directory is "web").
// This file serves the same function when the project is built from the repository root.
export { default } from '../web/api/snapshot.js'
