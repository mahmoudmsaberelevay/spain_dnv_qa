import { runPublicContentSync } from "../server/publicContentService";

const result = await runPublicContentSync("manual");
console.log(JSON.stringify(result, null, 2));
process.exit(0);
