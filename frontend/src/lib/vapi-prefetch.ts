// shared dynamic import for @vapi-ai/web — one chunk, prefetched on idle
// vite/cjs interop can nest `default` ({ default: { default: Vapi } }); unwrap until we get a function

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ctorPromise: Promise<any> | null = null

function unwrapToConstructor(x: unknown): unknown {
  let cur: unknown = x
  for (let i = 0; i < 5; i++) {
    if (typeof cur === 'function') return cur
    if (cur && typeof cur === 'object' && 'default' in cur) {
      const next = (cur as { default: unknown }).default
      if (next === cur) break
      cur = next
      continue
    }
    break
  }
  return cur
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadVapiSdkClass(): Promise<any> {
  if (!ctorPromise) {
    ctorPromise = import('@vapi-ai/web')
      .then((VapiModule) => {
        const first =
          VapiModule && typeof VapiModule === 'object' && 'default' in VapiModule
            ? (VapiModule as { default: unknown }).default
            : VapiModule
        const Ctor = unwrapToConstructor(first)
        if (typeof Ctor !== 'function') {
          throw new Error('@vapi-ai/web: resolved export is not a constructor')
        }
        return Ctor
      })
      .catch((err) => {
        ctorPromise = null
        throw err
      })
  }
  return ctorPromise
}

// warms vapi chunk after idle so first mic tap pays less network/parse cost
export function prefetchVapiSdk(): void {
  if (!import.meta.env.VITE_VAPI_PUBLIC_KEY) return
  const run = () => {
    void loadVapiSdkClass().catch(() => {})
  }
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 4000 })
  } else {
    window.setTimeout(run, 1)
  }
}
