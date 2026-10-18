// Module types the bundler (scripts/build.mjs) provides.

/** `import text from "./file?raw"`: the file contents as a string. */
declare module "*?raw" {
  const text: string;
  export default text;
}
