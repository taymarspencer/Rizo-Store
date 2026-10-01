# Rizo.game v86 — Launch Hotfix

This release exists because v85 produced a white-screen launch failure in the real iPhone check despite passing the prior Chromium-heavy regression wall.

## Root causes / gaps addressed

1. The prior release ZIP wrapped the playable site inside a top-level project folder. v86 packages the deployable site flat, with `index.html` at archive root.
2. Prior browser gates were Chromium-first. They did not deserve to be treated as proof of iPhone/WebKit launch reliability.
3. Startup previously declared success as soon as runtime boot returned. v86 keeps the dependency-free boot shell visible until a real playable surface survives two paint turns.
4. If the runtime finishes but no playable surface exists, startup now fails visibly into the recovery shell rather than allowing a blank surface.
5. Page, runtime, and service-worker markers are converged on `v86-launch-hotfix`.

## Verification performed after the hotfix

- Launch recovery: 5/5
- Service-worker policy / poisoned-cache behavior: 4/4
- Static architecture / active asset audit: 80/80
- v84 gameplay lame-test gate: 34/34
- v85 handmade UI gate: 33/33

Total targeted hotfix verification: 156/156.

The release archive itself is intentionally flat. Do not add another parent folder when deploying it.
