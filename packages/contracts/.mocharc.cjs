// Mocha config for the contracts package.
//
// The contracts package keeps `"type": "module"` so the published
// output is ESM. The test files in `test/` use the default-import
// pattern (`import hardhat from "hardhat"`) for CJS modules to avoid
// the named-export trap. Mocha is invoked by Hardhat with the
// `mocha.nodeArgs` array from `hardhat.config.cjs`, which prepends
// `--import tsx` to the Node CLI. `tsx` is the TypeScript loader
// (already in the root devDependencies) and handles both ESM and CJS
// modules; it also resolves the `.js` import specifiers used in the
// test files to the matching `.ts` source files.
