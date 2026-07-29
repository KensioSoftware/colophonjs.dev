#!/usr/bin/env -S pnpm tsx

/**
 * Deploy the CDK stack into a simulated AWS and print the local URL it is
 * served at, so the CloudFront behaviour can be exercised without deploying.
 *
 * Synthesise the template first with `pnpm exec cdk synth`.
 */
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";
import { join } from "node:path";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

const templatePath = join(
  import.meta.dirname,
  "../cdk.out/ColophonJsDevStack.template.json",
);

const stack = await simAws.cloudFormation().deployTemplateFile({
  templatePath,
});

const cfDomain = stack.outputs.get("DistributionDomainName")?.value;
if (typeof cfDomain !== "string") {
  throw new Error("CloudFront URL not found in outputs");
}
const localUrl = srv.localUrl(`http://${cfDomain}/`).toString();
console.log(localUrl);
