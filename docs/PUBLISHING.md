# Publishing the standalone alpha repository

The repository root is this `roomping/` folder. It has its own package, tests, license, CI and assets; no sibling project is needed. Source version is **0.1.0a2**.

## Validate the source and distribution

```sh
python -m venv .venv
python -m pip install -e . build
python -m unittest discover -s tests -v
node --test tests/*.test.mjs
python -m build
```

Use the appropriate virtual-environment Python or activate it first. Install `dist/roomping-0.1.0a2-py3-none-any.whl` into a separate clean environment, change to a directory outside the source tree, and confirm `python -m roomping --help`, `--version`, host startup and bundled HTML/CSS/JS. Open the complete printed token URL. Confirm the sdist includes source, license and README.

## GitHub handoff

1. Review [validation](VALIDATION.md) and preserve explicit unverified-device/download limitations.
2. Ensure no exported floorplan, real home image, measured location data, private join token, environment or build cache is staged.
3. Initialize the standalone source repository only after the parent task's review and user publishing authorization. No git operations are performed by this implementation worker.
4. Push the source and check the GitHub Actions test/build run. The workflow expects to run at this folder's repository root.
5. Create an alpha release such as `v0.1.0a2`, attach the reviewed source archive and optionally wheel/sdist, and list real-device checks still outstanding.

GitHub CI covers Python 3.10/3.12/3.14 on Linux and the available runner's Node runtime. Passing CI is not a physical smartphone, Wi-Fi, Windows or native download validation. Package-index publication is a separate authorized action; it is not performed here.

QR comes from the `qrcode` dependency. Do not copy this dependency's source without retaining its license. Installation fetches dependencies; running the installed application uses local assets and local measurements.
