#!/usr/bin/env node

import * as cdk from "aws-cdk-lib";
import { ColophonJsDevStack } from "../lib/colophonjs-dev-stack";

const app = new cdk.App();

new ColophonJsDevStack(app, "ColophonJsDevStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    // CloudFront certificates have to live in us-east-1.
    region: "us-east-1",
  },
});
