# Third-Party Licenses

`universal-deployment-log-viewer` is MIT licensed (see [LICENSE](./LICENSE)). It depends on the
following open-source packages. Each retains its own license and copyright; the authoritative
text is the `LICENSE` file shipped inside each package in `node_modules`.

| Package | License | Purpose | Project |
| --- | --- | --- | --- |
| `@tanstack/react-virtual` | MIT | Row virtualization with dynamic measurement | https://github.com/TanStack/virtual |
| `ansi-to-react` | BSD-3-Clause | Renders ANSI colour escape codes in the Raw Output tab | https://github.com/nteract/ansi-to-react |
| `lucide-react` | ISC (portions MIT, derived from Feather) | Icons | https://github.com/lucide-icons/lucide |

## Notes

- **MIT** (`@tanstack/react-virtual`): permits use, modification and redistribution provided the
  copyright and permission notice is retained.
- **BSD-3-Clause** (`ansi-to-react`): redistributions in source or binary form must retain the
  copyright notice, the list of conditions and the disclaimer, and the author's name may not be
  used to endorse derived products without permission.
- **ISC / MIT** (`lucide-react`): permission to use, copy, modify and distribute is granted provided
  the copyright and permission notice appear in all copies.

Because these packages are listed under `dependencies` (not bundled into your source tree), their
license files are installed alongside them by your package manager. If you vendor or bundle this
library into a distributed application, include the license texts of the packages above in your
own attribution file.
