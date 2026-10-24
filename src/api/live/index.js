// Live adapter. M0.4 stub: every call reports "not implemented" until M8.1 wires the backend.
import { ServerError } from "../errors.js";

const names = ["signIn", "listProjects", "createProject", "getProject"];

export const liveApi = Object.fromEntries(
  names.map((name) => [
    name,
    async () => {
      throw new ServerError(`Live API call "${name}" is not implemented yet.`);
    },
  ]),
);
