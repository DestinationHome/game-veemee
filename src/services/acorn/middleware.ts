import { SHA1 } from "bun";
import { createMiddleware } from "hono/factory";

const DefaultSalt = "veemeeHTTPRequ9R3UMWDAT8F3*#@&$^";

export const signer = createMiddleware(async (c, next) => {
  await next();

  if (c.res.status !== 200) {
    return;
  }

  if (
    c.req.path.includes("thumbnails") ||
    c.req.path.includes("crash.php") ||
    c.req.path.includes("audisled") ||
    c.req.path.includes("audiHS") ||
    c.req.path.includes("MetaScores") ||
    c.req.path.includes("hiscores.xml") ||
    c.req.path.includes("/nml/")
  ) {
    return;
  }

  const salt = DefaultSalt;

  const responseText = await c.res.clone().text();

  // Try to sign JSON responses only.
  // If we get something else, it's clearly not meant to be signed.
  let response: any;
  try {
    response = JSON.parse(responseText);
  } catch (e) {
    return;
  }

  const hasher = new SHA1();
  hasher.update(salt);
  hasher.update(responseText);
  const digest = hasher.digest("hex").toUpperCase();

  if (Array.isArray(response)) {
    response.push({ hash: digest });
  } else {
    response.hash = digest;
  }

  c.res = c.newResponse(JSON.stringify(response), {
    headers: {
      "Content-Type": "application/json",
    },
  });
});

export const unimplemented = createMiddleware(async (c, next) => {
  console.warn(`Unimplemented route: ${c.req.path}`);
  await next();
});
