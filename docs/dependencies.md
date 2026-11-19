# Dependency maintenance

## Security update — 2026-11-19

The original lockfile produced 15 npm audit findings: 2 high, 12 moderate, and 1 low. Some findings represented packages depending on a vulnerable package rather than distinct vulnerabilities in the capture code.

| Dependency path | Resolution |
| --- | --- |
| `brace-expansion`, `js-yaml`, and affected ESLint dependencies | Refresh compatible versions in the lockfile |
| Raycast SDK | Update `1.104.24` → `1.104.25`; pin the reviewed patch release |
| Raycast SDK → `esbuild` | Scoped override to `0.28.2` |
| `@oclif/core` → `minimatch` | Scoped override to `11.0.9` |

The existing SDK's declared ranges do not include the fixed esbuild and minimatch versions. npm's automatic resolution suggested Raycast SDK 2.x. This update retains SDK 1.x and limits the overrides to the affected toolchain paths; it does not globally replace older minimatch APIs used elsewhere.

The esbuild advisory concerns its development server on Windows; this extension targets macOS and does not use that server. The dependency is nevertheless updated so the reviewed tree has no known npm audit findings. The glob/YAML advisories concern resource exhaustion in parsing. A clean audit is a point-in-time registry result, not a guarantee that all dependencies are free of defects.

## Compatibility of the dependency-only update

At the dependency-only update (`ccbcea7`), the capture source was unchanged. Readability, LinkeDOM, Turndown, and the GFM plugin retain their original versions. Output paths, image references, clipboard behavior, and the Raycast command identifier are unchanged.

The regression suite passed against both the original and updated dependency trees. It executes the actual command and parsing libraries, replacing only the Raycast host, network, clock, and home directory. It covers:

- WeChat, Readability, article, and body extraction paths.
- Source metadata, links, lists, tables, code blocks, and cleaned HTML.
- Image bytes, duplicate URLs, inline images, lazy loading, and failed downloads.
- Repeated captures, existing-file preservation, and failure without clipboard replacement.

Checks for the updated tree:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run test:bundle
npm audit
npm ls --all
```

The build script explicitly uses `ray build -e dist -o dist`. The `-e` flag selects the build mode; only `-o` selects the output directory. The previous script omitted `-o` and could write to Raycast’s default extension directory. Builds now remain in the repository’s ignored `dist/` directory; installation remains an explicit `npm run dev` step.

The updated esbuild context/watch/rebuild API and Raycast CLI argument handling were also checked. Raycast lint passes with the existing title-capitalization warnings; command names are preserved. Tests do not access the user's browser or clipboard. Interactive browser permission prompts and site-specific rendering are outside these automated checks.

## Future updates

Keep `package-lock.json` committed and install with `npm ci`. Re-run the checks after changing dependencies. Remove each override when the supported SDK declares a suitable fixed version, after verifying the resulting tree. Do not run `npm audit fix --force` without reviewing SDK/API changes.

## Unified implementation

The subsequent merge uses the local implementation as the functional baseline and retains the reviewed dependency tree. Its extension identifier is `webpage-capture-for-lzengan`; the command entry point remains `capture-webpage-as-md-for-lzengan`. Runtime changes and migration details are documented in the README.

The expanded suite covers relative paths, tab-pinned HTML, JSON-LD metadata, inline image localization, one-time background conversion, atomic directory creation, Readability exception fallback, and shared streaming size limits. Both HTTP and inline image data are subject to the same budget. The raw browser HTML is retained as `source.html`.
