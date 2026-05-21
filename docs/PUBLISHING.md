# Publishing CodeSetu

This guide covers hosting the VS Code extension on the Visual Studio Marketplace,
Open VSX, or a private VSIX channel.

Sources checked on 2026-05-17:

- VS Code Publishing Extensions:
  https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- `@vscode/vsce`:
  https://github.com/microsoft/vscode-vsce
- Open VSX Publishing Extensions:
  https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions
- `ovsx` CLI:
  https://www.npmjs.com/package/ovsx

## Before You Publish

1. Confirm the extension manifest in `apps/vscode/package.json`:
   - `name`: `codesetu`
   - `displayName`: `CodeSetu`
   - `publisher`: your Marketplace publisher ID
   - `version`: a SemVer version, for example `0.1.0`
2. Update `README.md`, `CHANGELOG.md`, and `NOTICE`.
3. Run verification:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm format
corepack pnpm lint
corepack pnpm build
corepack pnpm test
```

4. Package a VSIX:

```bash
corepack pnpm package:vscode
```

5. Install and smoke test the generated VSIX locally:

```bash
code --install-extension artifacts/codesetu-0.0.0.vsix
```

## Publish to Visual Studio Marketplace

The Marketplace uses Azure DevOps identity and Personal Access Tokens for
publishing.

1. Create or choose an Azure DevOps organization.
2. Create a Personal Access Token with Marketplace Manage scope.
3. Create a publisher in the Marketplace publisher management page.
4. Set `publisher` in `apps/vscode/package.json` to that exact publisher ID.
5. Login with `vsce`:

```bash
cd apps/vscode
corepack pnpm dlx @vscode/vsce login <publisher-id>
```

6. Publish:

```bash
corepack pnpm dlx @vscode/vsce publish --no-dependencies
```

Or publish an existing VSIX manually from the Marketplace publisher management
page.

## Publish a Pre-Release

Use this for early testers:

```bash
cd apps/vscode
corepack pnpm dlx @vscode/vsce publish --pre-release --no-dependencies
```

Keep pre-release and release versions distinct.

## Publish to Open VSX

Open VSX is useful for VS Code-compatible editors such as VSCodium.

1. Create an Eclipse account.
2. Sign the Open VSX publisher agreement.
3. Create an Open VSX access token.
4. Create or claim the namespace that matches the publisher.
5. Publish the VSIX:

```bash
corepack pnpm package:vscode
corepack pnpm dlx ovsx publish artifacts/codesetu-0.0.0.vsix --pat "$OVSX_PAT"
```

Open VSX may scan uploads for leaked secrets, blocked files, and namespace
similarity. Fix any scanner findings before retrying.

## Private Hosting

Private hosting is the safest first release path while CodeSetu is still early.

1. Run the verification commands.
2. Package `artifacts/codesetu-0.0.0.vsix`.
3. Upload the VSIX to a GitHub Release, internal artifact store, or secure file
   share.
4. Give users the install command:

```bash
code --install-extension codesetu-0.0.0.vsix
```

5. Document the provider settings they should use for Sarvam, Ollama,
   OpenRouter, or local OpenAI-compatible models.

## Release Checklist

- [ ] Version bumped in `apps/vscode/package.json`
- [ ] `CHANGELOG.md` updated
- [ ] `README.md` and `INSTALL.md` reflect current settings
- [ ] No API keys or local secrets in the repository
- [ ] `corepack pnpm install --frozen-lockfile` passes
- [ ] `corepack pnpm format` passes
- [ ] `corepack pnpm lint` passes
- [ ] `corepack pnpm build` passes
- [ ] `corepack pnpm test` passes
- [ ] VSIX installs locally
- [ ] Chat works with at least one configured provider
- [ ] Inline completion works in a code file
