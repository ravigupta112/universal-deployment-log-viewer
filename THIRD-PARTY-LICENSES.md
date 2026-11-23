# Third-Party Licenses

`universal-deployment-log-viewer` is MIT licensed (see [LICENSE](./LICENSE)). It depends on the
following open-source packages. Each retains its own license and copyright; the authoritative
text is the `LICENSE` file shipped inside each package in `node_modules`.

| Package | License | Purpose | Project |
| --- | --- | --- | --- |
| `@tanstack/react-virtual` | MIT | Row virtualization with dynamic measurement | https://github.com/TanStack/virtual |
| `ansi-to-react` | BSD-3-Clause | Renders ANSI colour escape codes in the Raw Output tab | https://github.com/nteract/ansi-to-react |
| `lucide-react` | ISC (portions MIT, derived from Feather) | Icons | https://github.com/lucide-icons/lucide |

The license texts below are copied from the installed packages (`ansi-to-react` ships no license file; its
license is declared as BSD-3-Clause in its `package.json`, authored by Kyle Kelley, repository
https://github.com/nteract/ansi-to-react - consult the upstream repository for its exact copyright line).

---

## @tanstack/react-virtual (MIT)

```
MIT License

Copyright (c) 2021-present Tanner Linsley

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## lucide-react (ISC; portions MIT from Feather)

```
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

## ansi-to-react (BSD-3-Clause)

The BSD 3-Clause license requires that redistributions retain the copyright notice, the list of conditions and
the disclaimer, and that the author's name is not used to endorse derived products without permission. See
https://github.com/nteract/ansi-to-react/blob/master/LICENSE for the authoritative text.

Because these packages are installed as `dependencies` (not bundled into this repository's source), your package
manager installs them with their own license files. If you vendor or bundle this library into a distributed
application, include the license texts above in your own attribution file.
