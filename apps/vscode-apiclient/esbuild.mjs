/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * See the repository LICENSE for details.
 */

import esbuild from "esbuild";

const watch = process.argv.includes("--watch");

/** Extension host bundle (Node / CommonJS). */
const hostConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode"],
  outfile: "dist/extension.cjs",
  sourcemap: true,
  logLevel: "info",
};

/** Webview bundle (browser / IIFE) with React. */
const webviewConfig = {
  entryPoints: ["src/webview/index.tsx"],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  outfile: "dist/webview.js",
  sourcemap: true,
  jsx: "automatic",
  loader: { ".css": "css" },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
};

if (watch) {
  const hostCtx = await esbuild.context(hostConfig);
  const webviewCtx = await esbuild.context(webviewConfig);
  await Promise.all([hostCtx.watch(), webviewCtx.watch()]);
  console.log("[codesetu-api-client] watching for changes...");
} else {
  await Promise.all([esbuild.build(hostConfig), esbuild.build(webviewConfig)]);
}
